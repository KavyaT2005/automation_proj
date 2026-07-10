from pydantic import BaseModel
from typing import Dict, Any, Optional, List
from datetime import datetime

class DocumentBase(BaseModel):
    filename: str
    mime_type: str

class DocumentCreate(DocumentBase):
    storage_path: str

class DocumentReview(BaseModel):
    corrected_json: Dict[str, Any]

class ExtractForTargetRequest(BaseModel):
    target_url: Optional[str] = None
    target_fields: Optional[List[Dict[str, Any]]] = None

class DocumentResponse(DocumentBase):
    id: str
    status: str
    ocr_raw_text: Optional[str] = None
    extracted_json: Optional[Dict[str, Any]] = None
    corrected_json: Optional[Dict[str, Any]] = None
    confidence_score: Optional[float] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
