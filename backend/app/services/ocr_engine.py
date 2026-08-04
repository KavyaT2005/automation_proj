import easyocr
import numpy as np
import os
from typing import Dict, Any, List

class OCREngine:
    def __init__(self, languages: List[str] = ["en"]):
        # Lazy loading reader to save resources at startup
        self.languages = languages
        self._reader = None

    @property
    def reader(self):
        if self._reader is None:
            # gpu=False by default; can be enabled if CUDA is active
            self._reader = easyocr.Reader(self.languages, gpu=False)
        return self._reader

    def extract_text(self, image_path: str) -> Dict[str, Any]:
        """
        Extracts text from the image using Document AI (primary) or EasyOCR (secondary/fallback).
        """
        from ..config import settings
        from ..routers.admin import append_admin_log, load_admin_data
        
        words = []
        docai_success = False
        
        # Read from dynamic admin settings first, fallback to environment settings
        try:
            admin_data = load_admin_data()
            admin_settings = admin_data.get("settings", {})
        except Exception:
            admin_settings = {}
            
        gemini_api_key = admin_settings.get("gemini_api_key") or settings.GEMINI_API_KEY
        
        # FAST TRACK: If Gemini is available, skip EasyOCR entirely to boost speed
        if gemini_api_key:
            append_admin_log("ocr", "INFO", "Fast-track mode: Gemini Vision API enabled. Skipping slow offline EasyOCR.")
            return {"raw_text": "", "words": [], "image_path": image_path}
            
        gcp_project_id = admin_settings.get("gcp_project_id") or settings.GCP_PROJECT_ID
        gcp_location = admin_settings.get("gcp_location") or settings.GCP_LOCATION
        docai_processor_id = admin_settings.get("docai_processor_id") or settings.DOCAI_PROCESSOR_ID
        
        # Try DocAI first if configured
        if gcp_project_id and docai_processor_id:
            try:
                append_admin_log("ocr", "INFO", f"DocAI: Initializing primary Google Document AI extraction for: {os.path.basename(image_path)}")
                
                from google.cloud import documentai
                import mimetypes
                from PIL import Image
                
                # Determine mime type
                mime_type, _ = mimetypes.guess_type(image_path)
                if not mime_type:
                    mime_type = "image/png"
                    
                # Determine width/height
                width, height = 1000, 1000
                try:
                    with Image.open(image_path) as img:
                        width, height = img.size
                except Exception:
                    pass
                    
                client = documentai.DocumentProcessorServiceClient()
                name = client.processor_path(gcp_project_id, gcp_location, docai_processor_id)
                
                with open(image_path, "rb") as image_file:
                    image_content = image_file.read()
                    
                raw_document = documentai.RawDocument(content=image_content, mime_type=mime_type)
                request = documentai.ProcessRequest(name=name, raw_document=raw_document)
                
                result = client.process_document(request=request)
                document = result.document
                
                words = []
                raw_text = document.text
                
                for page in document.pages:
                    w_scale = page.dimension.width or width or 1000
                    h_scale = page.dimension.height or height or 1000
                    
                    for token in page.tokens:
                        text_segments = token.layout.text_anchor.text_segments
                        token_text = ""
                        for segment in text_segments:
                            start = int(segment.start_index)
                            end = int(segment.end_index)
                            token_text += raw_text[start:end]
                        
                        token_text = token_text.strip()
                        if not token_text:
                            continue
                        
                        vertices = token.layout.bounding_poly.normalized_vertices
                        if not vertices:
                            vertices = token.layout.bounding_poly.vertices
                            x_coords = [int(v.x) for v in vertices if hasattr(v, 'x')]
                            y_coords = [int(v.y) for v in vertices if hasattr(v, 'y')]
                        else:
                            x_coords = [int(v.x * w_scale) for v in vertices if hasattr(v, 'x')]
                            y_coords = [int(v.y * h_scale) for v in vertices if hasattr(v, 'y')]
                        
                        if x_coords and y_coords:
                            x_min, x_max = min(x_coords), max(x_coords)
                            y_min, y_max = min(y_coords), max(y_coords)
                            confidence = getattr(token.layout, "confidence", 1.0)
                            words.append({
                                "text": token_text,
                                "confidence": float(confidence),
                                "bbox": [x_min, y_min, x_max, y_max]
                            })
                
                append_admin_log("ocr", "INFO", f"DocAI: Successfully parsed document via Google Cloud. Extracted {len(words)} tokens.")
                docai_success = True
                
            except Exception as e:
                append_admin_log("ocr", "WARNING", f"DocAI extraction failed ({str(e)}). Falling back to EasyOCR.")
                print(f"DocAI Error: {e}")
                docai_success = False
                
        if not docai_success:
            # Fallback to EasyOCR
            append_admin_log("ocr", "INFO", f"EasyOCR: Extracting text via local offline pipeline...")
            results = self.reader.readtext(image_path)
            words = []
            for bbox, text, confidence in results:
                pts = np.array(bbox, dtype=np.int32)
                x_min = int(np.min(pts[:, 0]))
                y_min = int(np.min(pts[:, 1]))
                x_max = int(np.max(pts[:, 0]))
                y_max = int(np.max(pts[:, 1]))
                
                words.append({
                    "text": text,
                    "confidence": float(confidence),
                    "bbox": [x_min, y_min, x_max, y_max]
                })

        if not words:
            return {"raw_text": "", "words": []}
            
        # Get dimensions
        max_x = max(w["bbox"][2] for w in words)
        max_y = max(w["bbox"][3] for w in words)
        
        # Divide into header, middle, footer to preserve full-width elements
        header_y = max_y * 0.12
        footer_y = max_y * 0.90
        
        header_words = [w for w in words if w["bbox"][3] < header_y]
        footer_words = [w for w in words if w["bbox"][1] > footer_y]
        middle_words = [w for w in words if w["bbox"][3] >= header_y and w["bbox"][1] <= footer_y]
        
        # Detect if middle section has a two-column structure
        mid_x = max_x * 0.5
        cross_count = 0
        for w in middle_words:
            x_min, _, x_max, _ = w["bbox"]
            if x_min < mid_x and x_max > mid_x:
                cross_count += 1
                
        is_two_column = False
        if middle_words:
            cross_ratio = cross_count / len(middle_words)
            is_two_column = cross_ratio < 0.15
            
            # If initially detected as two columns, verify if they represent independent columns.
            # Independent columns mean a line contains a label on the left AND a label on the right.
            if is_two_column:
                # Disable two-column sorting for invoices, bills, and GRNs
                invoice_keywords = {"invoice", "grn", "received notes", "purchase order", "challan", "bill of supply", "tax invoice", "statement", "vendor", "particulars", "quantity", "gross wt", "net wt", "making charge", "purity", "rate"}
                has_invoice_keyword = any(any(ik in w["text"].lower() for ik in invoice_keywords) for w in words)
                if has_invoice_keyword:
                    is_two_column = False
                
            if is_two_column:
                # Group middle words into horizontal lines
                mid_lines = []
                sorted_mid = sorted(middle_words, key=lambda w: (w["bbox"][1], w["bbox"][0]))
                if sorted_mid:
                    current_line = [sorted_mid[0]]
                    for w in sorted_mid[1:]:
                        last_w = current_line[-1]
                        last_h = last_w["bbox"][3] - last_w["bbox"][1]
                        last_cy = (last_w["bbox"][1] + last_w["bbox"][3]) / 2
                        curr_cy = (w["bbox"][1] + w["bbox"][3]) / 2
                        if abs(curr_cy - last_cy) < 0.6 * last_h:
                            current_line.append(w)
                        else:
                            mid_lines.append(current_line)
                            current_line = [w]
                    mid_lines.append(current_line)
                
                # Check for lines that contain multiple labels horizontally separated
                label_keywords = {"name", "code", "number", "phone", "email", "address", "country", "state", "district", "city", "pincode", "zip", "dob", "birth", "website", "linkedin", "id", "pan", "gstin"}
                
                label_label_lines_count = 0
                for line in mid_lines:
                    if len(line) >= 2:
                        line_sorted = sorted(line, key=lambda w: w["bbox"][0])
                        left_words = [w for w in line_sorted if (w["bbox"][0] + w["bbox"][2]) / 2 < mid_x]
                        right_words = [w for w in line_sorted if (w["bbox"][0] + w["bbox"][2]) / 2 >= mid_x]
                        
                        left_has_label = any(any(kw in w["text"].lower() for kw in label_keywords) for w in left_words)
                        right_has_label = any(any(kw in w["text"].lower() for kw in label_keywords) for w in right_words)
                        
                        if left_has_label and right_has_label:
                            label_label_lines_count += 1
                
                # If we have very few label-label lines, it's likely a row-based layout (no split columns)
                if label_label_lines_count < 2:
                    is_two_column = False
            
        # Sort sections using 2D reading-order binning
        header_sorted = self._sort_words_reading_order(header_words)
        footer_sorted = self._sort_words_reading_order(footer_words)
        
        if is_two_column:
            left_middle = [w for w in middle_words if (w["bbox"][0] + w["bbox"][2]) / 2 < mid_x]
            right_middle = [w for w in middle_words if (w["bbox"][0] + w["bbox"][2]) / 2 >= mid_x]
            
            left_sorted = self._sort_words_reading_order(left_middle)
            right_sorted = self._sort_words_reading_order(right_middle)
            
            middle_sorted = left_sorted + right_sorted
        else:
            middle_sorted = self._sort_words_reading_order(middle_words)
            
        sorted_words = header_sorted + middle_sorted + footer_sorted
        
        # Group words into lines based on vertical overlap and close horizontal proximity
        lines = []
        if sorted_words:
            current_line = [sorted_words[0]]
            for w in sorted_words[1:]:
                last_w = current_line[-1]
                last_h = last_w["bbox"][3] - last_w["bbox"][1]
                last_cy = (last_w["bbox"][1] + last_w["bbox"][3]) / 2
                curr_cy = (w["bbox"][1] + w["bbox"][3]) / 2
                x_gap = w["bbox"][0] - last_w["bbox"][2]
                
                # Check if same line and close horizontal gap
                if abs(curr_cy - last_cy) < 0.6 * last_h and x_gap < 2.5 * last_h:
                    current_line.append(w)
                else:
                    lines.append(" ".join([item["text"] for item in current_line]))
                    current_line = [w]
            lines.append(" ".join([item["text"] for item in current_line]))
            
        return {
            "raw_text": " \n".join(lines),
            "words": sorted_words,
            "image_path": image_path
        }

    def _sort_words_reading_order(self, words_list: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Sorts words using 2D vertical-bucket line binning to ensure left-to-right reading order
        on each overlapping line, preventing vertical-coordinate micro-jitter from reversing text.
        """
        if not words_list:
            return []
        
        # Initial rough vertical sort
        rough_sorted = sorted(words_list, key=lambda w: w["bbox"][1])
        
        lines = []
        for w in rough_sorted:
            w_cy = (w["bbox"][1] + w["bbox"][3]) / 2
            w_h = w["bbox"][3] - w["bbox"][1]
            
            placed = False
            for line in lines:
                line_cy = sum((item["bbox"][1] + item["bbox"][3]) / 2 for item in line) / len(line)
                line_h = sum(item["bbox"][3] - item["bbox"][1] for item in line) / len(line)
                
                # If centers overlap within 50% of the line height, group onto the same line
                if abs(w_cy - line_cy) < 0.5 * max(w_h, line_h):
                    line.append(w)
                    placed = True
                    break
            
            if not placed:
                lines.append([w])
                
        # Sort words in each line horizontally by X coordinate (left-to-right)
        for line in lines:
            line.sort(key=lambda w: w["bbox"][0])
            
        # Sort lines vertically by their average Y coordinate
        lines.sort(key=lambda line: sum((item["bbox"][1] + item["bbox"][3]) / 2 for item in line) / len(line))
        
        # Flatten back to a single list
        sorted_flat = []
        for line in lines:
            sorted_flat.extend(line)
            
        return sorted_flat

