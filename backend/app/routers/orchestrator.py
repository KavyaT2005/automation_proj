import os
import uuid
import pandas as pd
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import Dict, Any, List
from pydantic import BaseModel

from ..database import get_db
from ..config import settings
from ..models.orchestrator import Workbook, WorkbookSheet, AutomationJob, AutomationRecord

router = APIRouter(prefix="/orchestrator", tags=["orchestrator"])

@router.post("/upload")
def upload_workbook(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Only .xlsx files are supported")

    # Create upload directory if it doesn't exist
    upload_dir = os.path.join(settings.UPLOAD_DIR, "workbooks")
    os.makedirs(upload_dir, exist_ok=True)

    # Generate unique filename
    file_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1]
    storage_filename = f"{file_id}{ext}"
    storage_path = os.path.join(upload_dir, storage_filename)

    with open(storage_path, "wb") as buffer:
        buffer.write(file.file.read())

    # Save Workbook to DB
    workbook = Workbook(
        id=file_id,
        filename=file.filename,
        storage_path=storage_path,
        status="uploaded"
    )
    db.add(workbook)
    db.commit()
    db.refresh(workbook)

    # Parse sheets and rows using pandas
    try:
        excel_data = pd.read_excel(storage_path, sheet_name=None, dtype=str)
        # sheet_name=None returns a dict of DataFrames {sheet_name: df}
        
        for sheet_name, df in excel_data.items():
            # Create sheet record
            sheet = WorkbookSheet(
                workbook_id=workbook.id,
                sheet_name=sheet_name,
                status="pending"
            )
            db.add(sheet)
            db.flush() # flush to get sheet.id

            # Create default job for the sheet
            job = AutomationJob(
                sheet_id=sheet.id,
                status="pending"
            )
            db.add(job)
            db.flush()

            # Clean dataframe (replace NaNs with None/empty string)
            df = df.fillna("")
            
            # Convert rows to JSON and save as records
            records_data = df.to_dict(orient="records")
            for idx, row_dict in enumerate(records_data):
                record = AutomationRecord(
                    job_id=job.id,
                    row_index=idx,
                    extracted_data=row_dict,
                    status="pending"
                )
                db.add(record)
                
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to parse Excel file: {str(e)}")

    return {"workbook_id": workbook.id, "message": "Workbook uploaded and parsed successfully"}

@router.get("/workbooks")
def list_workbooks(db: Session = Depends(get_db)):
    workbooks = db.query(Workbook).order_by(Workbook.created_at.desc()).all()
    result = []
    for wb in workbooks:
        result.append({
            "id": wb.id,
            "filename": wb.filename,
            "status": wb.status,
            "created_at": wb.created_at
        })
    return result

@router.get("/workbook/{workbook_id}")
def get_workbook_details(workbook_id: str, db: Session = Depends(get_db)):
    workbook = db.query(Workbook).filter(Workbook.id == workbook_id).first()
    if not workbook:
        raise HTTPException(status_code=404, detail="Workbook not found")

    sheets = db.query(WorkbookSheet).filter(WorkbookSheet.workbook_id == workbook_id).all()
    
    sheets_data = []
    for sheet in sheets:
        job = db.query(AutomationJob).filter(AutomationJob.sheet_id == sheet.id).first()
        record_count = db.query(AutomationRecord).filter(AutomationRecord.job_id == job.id).count() if job else 0
        
        sheets_data.append({
            "id": sheet.id,
            "sheet_name": sheet.sheet_name,
            "resolved_module": sheet.resolved_module,
            "status": job.status if job else sheet.status,
            "job_id": job.id if job else None,
            "target_url": job.target_url if job else None,
            "record_count": record_count
        })
        
    base_dir = os.path.dirname(workbook.storage_path)
    original_filename = os.path.basename(workbook.storage_path)
    result_path = os.path.join(base_dir, f"result_{original_filename}")
    has_report = os.path.exists(result_path)

    return {
        "id": workbook.id,
        "filename": workbook.filename,
        "status": workbook.status,
        "created_at": workbook.created_at,
        "has_report": has_report,
        "sheets": sheets_data
    }

class JobConfigRequest(BaseModel):
    target_url: str

@router.put("/job/{job_id}/config")
def update_job_config(job_id: str, request: JobConfigRequest, db: Session = Depends(get_db)):
    job = db.query(AutomationJob).filter(AutomationJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job.target_url = request.target_url
    db.commit()
    return {"message": "Job configuration updated"}

from ..services.automation_engine import PlaywrightAutomationEngine
from ..services.mapping_engine import FieldMappingEngine

# Shared services instances
automation_engine = PlaywrightAutomationEngine()
mapping_engine = FieldMappingEngine()

class StartOrchestratorRequest(BaseModel):
    base_url: str
    retry_failed: bool = False

@router.post("/start/{workbook_id}")
def start_orchestration(workbook_id: str, request: StartOrchestratorRequest, db: Session = Depends(get_db)):
    workbook = db.query(Workbook).filter(Workbook.id == workbook_id).first()
    if not workbook:
        raise HTTPException(status_code=404, detail="Workbook not found")

    workbook.status = "running"
    db.commit()

    # Pass the base_url and retry_failed to the engine
    results = automation_engine.run_orchestrator_job(
        workbook_id, 
        mapping_engine, 
        db, 
        base_url=request.base_url,
        retry_failed_only=request.retry_failed
    )

    workbook.status = "completed" if results["success"] else "completed_with_errors"
    db.commit()

    return results

@router.get("/download_report/{workbook_id}")
def download_report(workbook_id: str, db: Session = Depends(get_db)):
    workbook = db.query(Workbook).filter(Workbook.id == workbook_id).first()
    if not workbook:
        raise HTTPException(status_code=404, detail="Workbook not found")
        
    base_dir = os.path.dirname(workbook.storage_path)
    original_filename = os.path.basename(workbook.storage_path)
    result_filename = f"result_{original_filename}"
    result_path = os.path.join(base_dir, result_filename)
    
    if not os.path.exists(result_path):
        raise HTTPException(status_code=404, detail="Report not yet generated or not found on disk")
        
    return FileResponse(
        path=result_path, 
        filename=result_filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

@router.delete("/workbook/{workbook_id}")
def delete_workbook(workbook_id: str, db: Session = Depends(get_db)):
    import os
    workbook = db.query(Workbook).filter(Workbook.id == workbook_id).first()
    if not workbook:
        raise HTTPException(status_code=404, detail="Workbook not found")

    # Optional: Delete file from disk
    if os.path.exists(workbook.storage_path):
        try:
            os.remove(workbook.storage_path)
        except Exception as e:
            print(f"Warning: Failed to delete physical file {workbook.storage_path}: {e}")

    # SQLAlchemy cascade will handle deleting sheets, jobs, records, logs
    db.delete(workbook)
    db.commit()
    
    return {"message": "Workbook deleted successfully"}
