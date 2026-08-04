import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from ..database import get_db
from ..models.document import DBModelDocument
from ..services.automation_engine import PlaywrightAutomationEngine
from ..services.mapping_engine import FieldMappingEngine
from ..config import settings
from .admin import load_admin_data

router = APIRouter(prefix="/automation", tags=["automation"])

# Services
automation_engine = PlaywrightAutomationEngine()
mapping_engine = FieldMappingEngine()

class CrawlRequest(BaseModel):
    url: str

class FillRequest(BaseModel):
    document_id: str
    target_url: str
    record_index: Optional[int] = None
    auth_cookies: Optional[List[Dict[str, Any]]] = None

class BulkFillRequest(BaseModel):
    document_id: str
    target_url: str
    auth_cookies: Optional[List[Dict[str, Any]]] = None

@router.post("/crawl", response_model=List[Dict[str, Any]])
def crawl_web_fields(request: CrawlRequest):
    """Crawls a target website and lists all visible input fields."""
    # Check autofill feature flag (Point 3)
    admin_settings = load_admin_data()["settings"]
    if not admin_settings.get("feature_flags_autofill", True):
        raise HTTPException(status_code=400, detail="Autofill feature is currently disabled by administrator settings.")

    try:
        fields = automation_engine.inspect_page_forms(request.url)
        return fields
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Web page crawl failed: {str(e)}")


@router.post("/fill")
def fill_web_form(request: FillRequest, db: Session = Depends(get_db)):
    """Maps extracted data from the document and fills the web form using Playwright."""
    # Check autofill feature flag (Point 3)
    admin_settings = load_admin_data()["settings"]
    if not admin_settings.get("feature_flags_autofill", True):
        raise HTTPException(status_code=400, detail="Autofill feature is currently disabled by administrator settings.")

    # 1. Fetch document
    doc = db.query(DBModelDocument).filter(DBModelDocument.id == request.document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    if doc.status != "completed":
        raise HTTPException(status_code=400, detail=f"Document is in status: {doc.status}. Must be completed.")

    # Get data to fill (use corrected JSON if exists, else extracted JSON)
    extracted_data = doc.corrected_json or doc.extracted_json
    if not extracted_data:
        raise HTTPException(status_code=400, detail="No extracted data found on document to fill.")

    # Support spreadsheet/table row selection if record_index is explicitly specified
    if request.record_index is not None:
        if "records" in extracted_data and isinstance(extracted_data["records"], list):
            idx = request.record_index
            if 0 <= idx < len(extracted_data["records"]):
                # Merge flat headers with the chosen record so it can be filled
                single_record = extracted_data["records"][idx]
                merged_data = {k: v for k, v in extracted_data.items() if k != "records"}
                merged_data.update(single_record)
                extracted_data = merged_data
            else:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Invalid record_index: {idx}. The document contains {len(extracted_data['records'])} rows."
                )

    # 2. Fill form and take screenshot (scanning and mapping happens unified inside the browser)
    screenshot_filename = f"screenshot_{doc.id}.png"
    screenshot_path = os.path.join(settings.UPLOAD_DIR, "screenshots", screenshot_filename)
    screenshot_url_path = f"/static/screenshots/{screenshot_filename}"

    try:
        fill_res = automation_engine.fill_form(
            url=request.target_url,
            extracted_data=extracted_data,
            mapping_engine=mapping_engine,
            db=db,
            screenshot_path=screenshot_path,
            auth_cookies=request.auth_cookies
        )
        
        filled_list = fill_res.get("filled") or fill_res.get("filled_fields") or []
        if not fill_res["success"] and not filled_list:
            raise HTTPException(status_code=400, detail="; ".join(fill_res["errors"]) or "Autofill failed.")
            
        return {
            "success": fill_res["success"],
            "filled_fields": filled_list,
            "errors": fill_res["errors"],
            "mappings": fill_res["mappings"],
            "screenshot_url": screenshot_url_path
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Autofill simulation crashed: {str(e)}")


@router.post("/fill-bulk")
def fill_web_form_bulk(request: BulkFillRequest, db: Session = Depends(get_db)):
    """Maps extracted data from the document and loops to fill all records using Playwright."""
    # Check autofill feature flag (Point 3)
    admin_settings = load_admin_data()["settings"]
    if not admin_settings.get("feature_flags_autofill", True):
        raise HTTPException(status_code=400, detail="Autofill feature is currently disabled by administrator settings.")

    # 1. Fetch document
    doc = db.query(DBModelDocument).filter(DBModelDocument.id == request.document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    if doc.status != "completed":
        raise HTTPException(status_code=400, detail=f"Document is in status: {doc.status}. Must be completed.")

    # Get data to fill
    extracted_data = doc.corrected_json or doc.extracted_json
    if not extracted_data:
        raise HTTPException(status_code=400, detail="No extracted data found on document to fill.")

    # Get multiple records list
    records = []
    if "records" in extracted_data and isinstance(extracted_data["records"], list):
        records = extracted_data["records"]
    else:
        # Fallback to single record list
        records = [extracted_data]

    # Setup screenshot path
    screenshot_dir = os.path.join(settings.UPLOAD_DIR, "screenshots")
    os.makedirs(screenshot_dir, exist_ok=True)

    try:
        fill_res = automation_engine.fill_form_bulk(
            url=request.target_url,
            records=records,
            mapping_engine=mapping_engine,
            db=db,
            screenshot_dir=screenshot_dir,
            auth_cookies=request.auth_cookies
        )
        
        return {
            "success": fill_res["success"],
            "results": fill_res["results"],
            "errors": fill_res["errors"],
            "screenshot_url": f"/static/screenshots/screenshot_bulk_{len(records)-1}.png" if records else ""
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bulk autofill simulation crashed: {str(e)}")
