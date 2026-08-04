import requests
import json
import re
import hashlib
from typing import Dict, Any, List, Optional
from ..config import settings
from .cache_service import cache_service

class SLMEngine:
    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL
        self.model = settings.OLLAMA_MODEL
        self.gemini_api_key = settings.GEMINI_API_KEY
        
        # Compile prompt injection neutralization pattern at startup (Rule 11)
        self.injection_keywords = [
            "ignore previous instructions", 
            "ignore instructions", 
            "output the system prompt",
            "system prompt", 
            "override prompt",
            "delete database", 
            "drop table"
        ]
        self.injection_regex = re.compile(
            "|".join(re.escape(k) for k in self.injection_keywords), 
            re.IGNORECASE
        )

    def extract_fields(self, ocr_res: Any, file_hash: Optional[str] = None, target_fields: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        """
        Uses Ollama SLM, Gemini, or heuristic tabular alignment to extract structured fields dynamically.
        Falls back to rule-based parser if Ollama is unavailable. Uses AI result caching.
        """
        import os

        if isinstance(ocr_res, dict):
            ocr_text = ocr_res.get("raw_text", "")
            words = ocr_res.get("words", [])
            image_path = ocr_res.get("image_path", None)
        else:
            ocr_text = str(ocr_res)
            words = []
            image_path = None

        # 1. Load active settings and prompt version
        from ..routers.admin import append_admin_log, load_admin_data
        admin_settings = load_admin_data()["settings"]
        prompt_version = admin_settings.get("prompt_version", "v1")

        # Determine the file identification hash for caching
        import hashlib
        repr_hash = file_hash or hashlib.sha256(ocr_text.encode()).hexdigest()
        
        # Incorporate target fields signature into the cache key if present
        target_fields_sig = ""
        if target_fields:
            target_fields_sig = json.dumps(target_fields, sort_keys=True)
            
        # Build prompt cache lookup key SHA256(file_hash + prompt_version + model_name + target_fields_sig)
        import hashlib
        cache_seed = repr_hash + prompt_version + self.model + target_fields_sig
        ai_cache_key = f"ai:result:{hashlib.sha256(cache_seed.encode()).hexdigest()}"
        cached_ai = cache_service.get(ai_cache_key)
        if cached_ai:
            append_admin_log("deduplication", "INFO", f"AI Cache Hit: Restored extraction values from cache key {ai_cache_key[:16]}...")
            return cached_ai
            
        # Prompt Injection Protection using pre-compiled regex
        if admin_settings.get("prompt_injection_protection", True):
            found_matches = self.injection_regex.findall(ocr_text)
            if found_matches:
                append_admin_log("injection", "WARNING", f"Potential prompt injection pattern detected: {', '.join(set(found_matches))}. Neutralizing...")
                # Neutralize by replacing the offending phrases with a warning block
                ocr_text = self.injection_regex.sub("[RESTRICTED SECURE VALUE BLOCKED]", ocr_text)
            
        # Try heuristic table extraction first if words are present and we are NOT in target fields mode
        if words and not target_fields:
            table_data = self._extract_table_records(words, ocr_text)
            if table_data and "records" in table_data and len(table_data["records"]) > 0:
                print(f"Table ingestion active: Extracted {len(table_data['records'])} rows.")
                # Attach pipeline version metadata
                table_data["_pipeline_metadata"] = {
                    "ocr_engine_version": "EasyOCR v3.1" if admin_settings.get("feature_flags_ocr", True) else "OCR Disabled",
                    "prompt_version": f"Prompt {prompt_version}",
                    "model_version": "Heuristic Table Parser",
                    "pipeline_version": "Pipeline v2"
                }
                # Cache table heuristic result for 30 days
                cache_service.set(ai_cache_key, table_data, expire_seconds=30 * 86400)
                return table_data

        # --- Prompt Cache ---
        if target_fields:
            fields_desc = []
            for tf in target_fields:
                field_id = tf.get("id") or tf.get("name") or ""
                field_label = tf.get("label") or ""
                field_placeholder = tf.get("placeholder") or ""
                field_type = tf.get("type") or "text"
                desc = f"- key: '{field_id}' | Label: '{field_label}'"
                if field_placeholder:
                    desc += f" (Hint/Placeholder: '{field_placeholder}')"
                desc += f" [Type: {field_type}]"
                fields_desc.append(desc)
            
            fields_str = "\n".join(fields_desc)
            
            system_prompt = (
                "You are an advanced AI document parser with high reasoning capability. "
                "Your task is to analyze the provided OCR text and extract ONLY the values for the requested fields with extreme accuracy. "
                "Do not extract or include any other fields."
            )
            
            extraction_prompt = (
                "Extract values for the following fields from the OCR text:\n"
                f"{fields_str}\n\n"
                "CRITICAL INSTRUCTIONS:\n"
                "1. Return a SINGLE FLAT JSON object where the keys are EXACTLY the key names specified above.\n"
                "2. If a field is not present in the document, set its value to null.\n"
                "3. OUTPUT ONLY VALID JSON. Do not include markdown code blocks, thoughts, or explanations."
            )
        else:
            default_system = (
                "You are an advanced AI document parser with high reasoning capability. "
                "Your task is to analyze the provided OCR text and extract structured fields with extreme accuracy. "
                "Handle complex layouts, nested tables, and multi-line values correctly. "
                "Correct obvious OCR typos based on context (e.g. 'O' to '0' in dates or codes). "
                "Do not hallucinate data; if a field is not present, omit it."
            )
            default_extraction = (
                "Identify and extract key entities, including but not limited to:\n"
                "- Entities: buyer/customer full name, vendor/company name, address, country, state, district, pin_code, mobile_number, email.\n"
                "- Tax & IDs: PAN number, GSTIN number.\n"
                "- Invoice/Bill Details: invoice_number, invoice_date, total_amount, shipping_charges, discount.\n"
                "- Line Items (aggregate or dominant if flat): item_description, quantity, unit_price, hsn_code.\n"
                "- Industry Specific (if applicable): gross_weight, net_weight, purity, making_charges, wastage, rate_per_gram, stone_weight, patient_name, doctor_name, admission_date, discharge_date, room_number, medicine_cost, insurance_provider, pnr_no, journey_date, source_location, destination_location, seat_number, vehicle_no.\n"
                "- Jewelry & Retail GRNs: purchase_rate, net_weight, others_value, others_weight, stone_weight, gross_weight, bag_weight, grn_date, purchase_order_number, purchase_order_date, vendor_name, ordered_by, reference_id, stone_rate, making_charges, rate_per_gram, total_amount, total_amount_in_words, remarks, igst, round_off, branch_name, material_type, purity, material_price_per_gram, category, sub_category, type, quantity, total_weight.\n\n"
                "CRITICAL INSTRUCTIONS:\n"
                "1. Extract nested address components into separate fields ('state', 'district', 'pin_code') rather than combining them.\n"
                "2. For mathematical values (total amount, quantity, unit price), ensure they match the invoice logic.\n"
                "3. Format dates cleanly if possible.\n"
                "4. Return a SINGLE FLAT JSON object. Use strict lowercase snake_case for keys.\n"
                "5. OUTPUT ONLY VALID JSON. Do not include markdown code blocks, thoughts, or explanations."
            )
            
            system_prompt = cache_service.get_prompt("system", default_system)
            extraction_prompt = cache_service.get_prompt("extraction", default_extraction)
            
            # Append our critical table rows warning to the extraction prompt
            table_warning = (
                "\nCRITICAL: If the document contains a table or list of items/records, you MUST extract EVERY SINGLE ROW/ITEM in the table without combining, summarizing, or omitting any rows. "
                "Extract all columns for each row (such as material_type, purity, quantity, net_weight, gross_weight, making_charges, rate_per_gram, stone_weight, total_amount) into separate objects inside the 'records' array. "
                "Do not miss any line items from the table. If a row lacks some fields, include the other fields that are present."
            )
            extraction_prompt += table_warning
        
        prompt = (
            f"{system_prompt}\n"
            f"{extraction_prompt}\n\n"
            f"OCR Text:\n{ocr_text}"
        )
        
        result_data = None
        
        # Check if Google Gemini API key is configured
        gemini_key = admin_settings.get("gemini_api_key") or self.gemini_api_key
        if gemini_key:
            # 1. Try Gemini Multimodal Visual Extraction first
            if image_path and os.path.exists(image_path):
                print("Gemini API key and image detected. Initiating Gemini AI multimodal visual extraction...")
                try:
                    import base64
                    with open(image_path, "rb") as f:
                        img_bytes = f.read()
                    img_b64 = base64.b64encode(img_bytes).decode("utf-8")
                    
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key={gemini_key}"
                    payload = {
                        "contents": [{
                            "parts": [
                                {"text": prompt},
                                {
                                    "inlineData": {
                                        "mimeType": "image/png",
                                        "data": img_b64
                                    }
                                }
                            ]
                        }],
                        "generationConfig": {
                            "responseMimeType": "application/json"
                        }
                    }
                    headers = {"Content-Type": "application/json"}
                    
                    import time
                    response = None
                    max_retries = 3
                    for attempt in range(max_retries):
                        try:
                            response = requests.post(url, json=payload, headers=headers, timeout=60)
                            if response.status_code == 200:
                                break
                            elif response.status_code in (429, 503):
                                print(f"Gemini API returned temporary error {response.status_code} (attempt {attempt+1}/{max_retries}). Retrying in 5 seconds...")
                                time.sleep(5)
                            else:
                                break
                        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as req_err:
                            print(f"Gemini API request failed or timed out (attempt {attempt+1}/{max_retries}): {req_err}")
                            if attempt < max_retries - 1:
                                time.sleep(5)
                            else:
                                raise req_err
                                
                    if response and response.status_code == 200:
                        res_json = response.json()
                        result_text = res_json["candidates"][0]["content"]["parts"][0]["text"]
                        data = self._clean_and_load_json(result_text)
                        result_data = self._post_process_data(data, ocr_text)
                    else:
                        status_code = response.status_code if response else "No Response"
                        print(f"Gemini multimodal API returned status code {status_code}. Falling back to standard Gemini.")
                except Exception as gemini_err:
                    print(f"Gemini multimodal API call failed ({gemini_err}). Falling back to standard Gemini.")

            # 2. Try Standard Text-only Gemini Extraction
            if not result_data:
                print("Initiating Gemini AI standard text-only cloud extraction...")
                try:
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key={gemini_key}"
                    payload = {
                        "contents": [{
                            "parts": [{"text": prompt}]
                        }],
                        "generationConfig": {
                            "responseMimeType": "application/json"
                        }
                    }
                    headers = {"Content-Type": "application/json"}
                    
                    import time
                    response = None
                    max_retries = 3
                    for attempt in range(max_retries):
                        try:
                            response = requests.post(url, json=payload, headers=headers, timeout=60)
                            if response.status_code == 200:
                                break
                            elif response.status_code in (429, 503):
                                print(f"Gemini API returned temporary error {response.status_code} (attempt {attempt+1}/{max_retries}). Retrying in 5 seconds...")
                                time.sleep(5)
                            else:
                                break
                        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as req_err:
                            print(f"Gemini API request failed or timed out (attempt {attempt+1}/{max_retries}): {req_err}")
                            if attempt < max_retries - 1:
                                time.sleep(5)
                            else:
                                raise req_err
                                
                    if response and response.status_code == 200:
                        res_json = response.json()
                        result_text = res_json["candidates"][0]["content"]["parts"][0]["text"]
                        data = self._clean_and_load_json(result_text)
                        result_data = self._post_process_data(data, ocr_text)
                    # If target fields were requested, verify if local SLM actually extracted them.
                    # If the local LLM failed and returned invalid/unrelated keys (like :r15:), overlay regex fallback.
                    if target_fields and isinstance(result_data, dict):
                        matched_keys = [tf for tf in target_fields if (tf.get("id") in result_data or tf.get("name") in result_data)]
                        if len(matched_keys) == 0:
                            print("Ollama returned invalid keys. Overlaying rule-based regex fallback.")
                            fallback_data = self._regex_fallback_extract(ocr_text, target_fields=target_fields)
                            result_data = {**result_data, **fallback_data}
                    else:
                        status_code = response.status_code if response else "No Response"
                        print(f"Gemini standard API returned status code {status_code}. Falling back.")
                except Exception as gemini_err:
                    print(f"Gemini standard API call failed ({gemini_err}). Falling back.")
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key={gemini_key}"
                payload = {
                    "contents": [{
                        "parts": [{"text": prompt}]
                    }],
                    "generationConfig": {
                        "responseMimeType": "application/json"
                    }
                }
                headers = {"Content-Type": "application/json"}
                
                import time
                response = None
                max_retries = 3
                for attempt in range(max_retries):
                    try:
                        response = requests.post(url, json=payload, headers=headers, timeout=60)
                        if response.status_code == 200:
                            break
                        elif response.status_code in (429, 503):
                            print(f"Gemini API returned temporary error {response.status_code} (attempt {attempt+1}/{max_retries}). Retrying in 5 seconds...")
                            time.sleep(5)
                        else:
                            break
                    except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as req_err:
                        print(f"Gemini API request failed or timed out (attempt {attempt+1}/{max_retries}): {req_err}")
                        if attempt < max_retries - 1:
                            time.sleep(5)
                        else:
                            raise req_err
                            
                if response and response.status_code == 200:
                    res_json = response.json()
                    result_text = res_json["candidates"][0]["content"]["parts"][0]["text"]
                    data = json.loads(result_text)
                    result_data = self._post_process_data(data, ocr_text)
                    # If target fields were requested, verify if local SLM actually extracted them.
                    # If the local LLM failed and returned invalid/unrelated keys (like :r15:), overlay regex fallback.
                    if target_fields and isinstance(result_data, dict):
                        matched_keys = [tf for tf in target_fields if (tf.get("id") in result_data or tf.get("name") in result_data)]
                        if len(matched_keys) == 0:
                            print("Ollama returned invalid keys. Overlaying rule-based regex fallback.")
                            fallback_data = self._regex_fallback_extract(ocr_text, target_fields=target_fields)
                            result_data = {**result_data, **fallback_data}
                else:
                    status_code = response.status_code if response else "No Response"
                    print(f"Gemini standard API returned status code {status_code}. Falling back.")
            except Exception as gemini_err:
                print(f"Gemini standard API call failed ({gemini_err}). Falling back.")

        # 3. Fallback: Try heuristic table extraction first if words are present and target_fields is not used
        if words and not target_fields:
            table_data = self._extract_table_records(words, ocr_text)
            if table_data and "records" in table_data and len(table_data["records"]) > 0:
                print(f"Table ingestion active (Fallback): Extracted {len(table_data['records'])} rows.")
                flat_data = self._regex_fallback_extract(ocr_text, target_fields=target_fields)
                flat_data["records"] = table_data["records"]
                return self._post_process_data(flat_data, ocr_text)

        if not result_data:
            payload = {
                "model": self.model,
                "prompt": prompt,
                "format": "json",  # Forces Ollama to output valid JSON
                "stream": False
            }
            
            try:
                response = requests.post(
                    f"{self.base_url}/api/generate",
                    json=payload,
                    timeout=30
                )
                if response.status_code == 200:
                    result_json = response.json().get("response", "{}")
                    data = json.loads(result_json)
                    result_data = self._post_process_data(data, ocr_text)
                    # If target fields were requested, verify if local SLM actually extracted them.
                    # If the local LLM failed and returned invalid/unrelated keys (like :r15:), overlay regex fallback.
                    if target_fields and isinstance(result_data, dict):
                        matched_keys = [tf for tf in target_fields if (tf.get("id") in result_data or tf.get("name") in result_data)]
                        if len(matched_keys) == 0:
                            print("Ollama returned invalid keys. Overlaying rule-based regex fallback.")
                            fallback_data = self._regex_fallback_extract(ocr_text, target_fields=target_fields)
                            result_data = {**result_data, **fallback_data}
            except Exception as e:
                print(f"Ollama SLM inference failed ({e}). Falling back to rule-based heuristics.")
                
        if not result_data:
            result_data = self._post_process_data(self._regex_fallback_extract(ocr_text, target_fields=target_fields), ocr_text)

        # Attach pipeline version metadata (Requirement 11)
        if isinstance(result_data, dict) and len(result_data) > 0:
            model_name_used = "gemini-1.5-pro" if gemini_key else self.model
            if "_pipeline_metadata" not in result_data:
                result_data["_pipeline_metadata"] = {
                    "ocr_engine_version": "EasyOCR v3.1" if admin_settings.get("feature_flags_ocr", True) else "OCR Disabled",
                    "prompt_version": f"Prompt {prompt_version}",
                    "model_version": model_name_used,
                    "pipeline_version": "Pipeline v2"
                }

        # Resolve extracted human keys to target fields dynamically
        if target_fields and isinstance(result_data, dict):
            result_data = self._resolve_target_fields(result_data, target_fields)

        # Cache the successfully post-processed data (30 days TTL) (Point 5)
        cache_service.set(ai_cache_key, result_data, expire_seconds=30 * 86400)
        return result_data

    def _resolve_target_fields(self, result_data: Dict[str, Any], target_fields: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Dynamically maps human-friendly extracted keys (like full_name, mobile_number) 
        to the target website input field IDs (like :r12:, :r15:) based on labels/names.
        """
        resolved = {}
        if "_pipeline_metadata" in result_data:
            resolved["_pipeline_metadata"] = result_data["_pipeline_metadata"]
            
        for tf in target_fields:
            tf_id = tf.get("id") or tf.get("name")
            if not tf_id:
                continue
                
            tf_label = (tf.get("label") or "").strip().lower()
            tf_name = (tf.get("name") or "").strip().lower()
            tf_id_clean = tf_id.strip().lower()
            
            # Direct match check (casing/id match)
            direct_match = None
            for k, v in result_data.items():
                if k.lower() in (tf_id_clean, tf_name, tf_label):
                    direct_match = v
                    break
            if direct_match is not None:
                resolved[tf_id] = direct_match
                continue
                
            # Fuzzy label matching
            matched_val = None
            
            # Customer / Full Name
            if "name" in tf_label or "name" in tf_name:
                if "father" in tf_label or "father" in tf_name:
                    matched_val = result_data.get("father_name") or result_data.get("father name")
                elif "vendor" in tf_label or "vendor" in tf_name or "supplier" in tf_label:
                    matched_val = result_data.get("vendor_name") or result_data.get("vendor")
                else:
                    matched_val = (
                        result_data.get("full_name") or 
                        result_data.get("customer_name") or 
                        result_data.get("name") or 
                        result_data.get("customer name")
                    )
                    
            # Phone / Mobile Number
            elif any(x in tf_label or x in tf_name for x in ["phone", "mobile", "contact", "tel"]):
                matched_val = (
                    result_data.get("mobile_number") or 
                    result_data.get("phone") or 
                    result_data.get("phone_number") or 
                    result_data.get("mobile")
                )
                
            # Email
            elif "email" in tf_label or "email" in tf_name or "mail" in tf_label or "mail" in tf_name:
                matched_val = result_data.get("email") or result_data.get("email_address")
                
            # Address
            elif "address" in tf_label or "address" in tf_name or "residential" in tf_label or "residence" in tf_label:
                matched_val = result_data.get("address") or result_data.get("residential") or result_data.get("billing_address")
                
            # Country
            elif "country" in tf_label or "country" in tf_name:
                matched_val = result_data.get("country")
                
            # State
            elif "state" in tf_label or "state" in tf_name:
                matched_val = result_data.get("state")
                
            # District
            elif "district" in tf_label or "district" in tf_name:
                matched_val = result_data.get("district")
                
            # Pin code
            elif any(x in tf_label or x in tf_name for x in ["pin", "zip", "postal"]):
                matched_val = (
                    result_data.get("pin_code") or 
                    result_data.get("pincode") or 
                    result_data.get("zip") or 
                    result_data.get("postal_code")
                )
                
            # PAN No
            elif "pan" in tf_label or "pan" in tf_name:
                matched_val = result_data.get("pan_no") or result_data.get("pan")
                
            # GSTIN No
            elif "gst" in tf_label or "gst" in tf_name or "gstin" in tf_label or "gstin" in tf_name:
                matched_val = result_data.get("gstin_no") or result_data.get("gst") or result_data.get("gstin")
                
            # School
            elif "school" in tf_label or "school" in tf_name:
                matched_val = result_data.get("school")
                
            # College
            elif "college" in tf_label or "college" in tf_name:
                matched_val = result_data.get("college")
                
            if matched_val is not None:
                resolved[tf_id] = matched_val
                
        # Copy direct matching keys from original results to preserve LLM raw output
        for tf in target_fields:
            tf_id = tf.get("id") or tf.get("name")
            if tf_id and tf_id not in resolved:
                for k, v in result_data.items():
                    if k.lower() == tf_id.lower():
                        resolved[tf_id] = v
                        break
                        
        return resolved

    def _regex_fallback_extract(self, text: str, target_fields: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        """
        Dynamically extracts all key-value pairs from the OCR text block.
        Works line-by-line to parse both inline (key: value) and multi-line layouts.
        """
        data = {}
        lines = [line.strip() for line in text.split('\n') if line.strip()]
        
        # Create a mapping from clean label/id/name to the original target key
        label_to_target_key = {}
        if target_fields:
            for tf in target_fields:
                target_key = tf.get("id") or tf.get("name") or ""
                if not target_key:
                    continue
                fid = tf.get("id") or ""
                fname = tf.get("name") or ""
                flabel = tf.get("label") or ""
                for val in [fid, fname, flabel]:
                    val_clean = re.sub(r'[^a-zA-Z0-9\s]', '', val).strip().lower()
                    if val_clean:
                        label_to_target_key[val_clean] = target_key
        
        # Lists of words that represent known labels to help with parsing
        # (This helps check if a line is a label or a value)
        known_labels = [
            "name", "full name", "client", "patient", "employee", "customer", "customer name", "buyer", "buyer name", "sold to", "bill to", "billed to", "recipient", "purchaser", "consignee", "consignee name", "client name", "father name", "fathers name",
            "email", "mail", "e-mail", "email address", "email id", "mail id", "mail address", "user email",
            "phone", "tel", "telephone", "mobile", "contact", "phone number", "phone no", "mobile no", "contact no", "ph no", "tel no", "cell", "cell no", "cellphone",
            "date of birth", "dob", "birth date", "birthdate", "birthday",
            "id", "id number", "license", "passport", "ssn", "identity", "identity number", "document id",
            "address", "addr", "location", "residence", "residential", "residential address", "street", "street address", "billing address", "shipping address", "buyer address", "customer address", "consignee address",
            "website", "web", "url", "web address",
            "linkedin", "social", "social media", "twitter", "facebook",
            "pan", "pan no", "pan card", "gstin", "gstin no", "gst", "gst no", "gst num", "gst number", "tax id", "tax no", "tax number", "tin", "tin no", "urn", "urn no", "registration no", "reg no",
            "customer code", "code", "pin code", "pincode", "zip", "zip code", "zipcode", "postal", "postal code",
            "country", "state", "province", "district", "city", "town", "locality", "suburb", "state name", "country name", "city name", "district name",
            "invoice number", "invoice no", "bill no", "bill number", "inv no", "receipt no", "inv num", "bill num", "receipt num", "document no", "doc no", "voucher no", "voucher num",
            "invoice date", "bill date", "inv date", "date issued", "issue date", "date of issue", "billing date", "receipt date", "date",
            "total amount", "total", "grand total", "amount due", "amount", "total due", "net amount", "gross amount", "net payable", "payable amount", "total payable", "grand total amount", "invoice value", "invoice total", "sum due",
            "vendor name", "vendor", "merchant", "biller", "supplier", "merchant name", "supplier name", "seller", "seller name", "company name", "company", "firm name", "issued by", "sold by",
            "vendor address", "supplier address", "merchant address", "seller address", "bill from address", "shop address", "office address",
            "vendor gstin", "supplier gstin", "seller gstin", "merchant gstin", "vendor gst", "supplier gst",
            "vendor pan", "supplier pan", "seller pan", "merchant pan",
            "gross weight", "gross wt", "gwt", "grossweight", "total weight", "total wt",
            "net weight", "net wt", "nwt", "netweight", "gold weight", "gold wt", "metal weight", "metal wt",
            "purity", "karat", "carat", "kt", "ct", "hallmark", "gold purity", "purity percent", "fineness",
            "making charges", "making charge", "making chg", "mc", "making", "labor charges", "wastage charges",
            "wastage", "wastage percent", "wastage weight", "wastage wt", "wastage %",
            "rate", "rate per gram", "gold rate", "metal rate", "silver rate", "rate/gm", "rate/gram", "gold price",
            "stone weight", "stone wt", "stone_weight", "stone weight (g)", "st weight", "st wt", "stoneweight",
            "item description", "description", "particulars", "ornament", "ornament name", "jewel type", "item name", "product name", "product", "goods", "service", "goods desc", "description of goods",
            "qty", "quantity", "quantity ordered", "pieces", "pcs", "nos", "units", "count",
            "unit price", "price per item", "item rate", "unit rate", "price", "rate per piece", "unit cost",
            "discount", "discount amount", "promo code", "discount value", "disc", "rebate", "less", "discount val", "offer",
            "hsn", "hsn code", "sac", "sac code", "hsn/sac", "hsn sac code", "tariff code",
            "shipping charges", "delivery fee", "shipping", "freight", "postage", "carriage", "courier charges", "delivery charge", "transport charges",
            "sku", "item code", "product id", "product code", "article no", "style no", "barcode", "sku code", "upc",
            "patient name", "doctor name", "physician", "surgeon", "consultant", "referred by", "patient name", "doctor name",
            "admission date", "admitted on", "visit date", "checkin date", "admission date",
            "discharge date", "discharged on", "checkout date", "discharge date",
            "room number", "room no", "ward no", "bed no", "cabin no", "room number",
            "medicine cost", "pharmacy bill", "drug charges", "med cost", "medicine cost",
            "insurance provider", "tpa", "insurance co", "payer", "insurance provider",
            "pnr", "pnr no", "booking id", "ticket number", "ticket no", "pnr number", "booking reference", "reference no", "ticket no", "pnr number",
            "journey date", "travel date", "departure date", "departure time", "doj", "journey date",
            "source", "origin", "from station", "departure from", "boarding point", "from", "source location",
            "destination", "to station", "arrival at", "destination city", "to", "destination location",
            "seat number", "seat no", "berth no", "berth", "seat", "coach no", "cabin", "seat number",
            "vehicle no", "train no", "train number", "flight no", "flight number", "carrier no", "bus no", "vehicle no", "train no", "flight no",
            "declaration", "bank details", "authorized signatory", "signature", "invoice value", "invoice value in words", "net amount", "gross amount", "round off",
            "supplier (bill from)", "buyer (bill to)", "bill to", "bill from", "shipping address", "company's pan"
        ]

        def clean_key(raw_key: str) -> str:
            clean = re.sub(r'[^a-zA-Z0-9\s]', '', raw_key).strip().lower()
            if target_fields and clean in label_to_target_key:
                return label_to_target_key[clean]
            return self._clean_key_helper(raw_key)

        def is_label(line_text: str) -> bool:
            # A line is a label if it is short (1-4 words) and contains label keywords
            clean = re.sub(r'[^a-zA-Z0-9\s]', '', line_text).strip().lower()
            if not clean:
                return False
            # Exclude table/tax/declaration headers from being treated as labels
            exclude_keywords = {"uom", "cgst", "sgst", "igst", "s no", "s.no", "taxable value", "tax amt", "declaration", "terms", "conditions", "authorized", "signatory", "signature", "bank details", "tcs", "round off"}
            if any(ew in clean for ew in exclude_keywords):
                return False
            # Check length (labels are short)
            words = clean.split()
            if len(words) > 4:
                return False
            # If the clean line is exactly one of our known labels or custom target fields, it's a label
            if clean in known_labels or clean in label_to_target_key:
                return True
            # Or if it contains specific label phrases (excluding generic value words)
            for w in words:
                if (w in known_labels and w not in ["street", "town", "province", "code", "mail", "district", "state", "city", "country"]) or (w in label_to_target_key):
                    return True
            return False

        buttons = {"reset", "save", "submit", "cancel", "clear", "close", "confirm", "create", "update", "delete"}
        i = 0
        while i < len(lines):
            line = lines[i]
            
            # Case 0: Space-separated label-value on the same line (e.g. "GSTIN 33BOPP...")
            matched_spaced = False
            if ":" not in line and line.lower().strip() not in known_labels:
                sorted_labels = sorted(known_labels, key=len, reverse=True)
                for label in sorted_labels:
                    line_lower = line.lower()
                    if line_lower.startswith(label + " ") or line_lower.startswith(label + "  "):
                        val_part = line[len(label):].strip()
                        val_part = val_part.lstrip(": -").strip()
                        if val_part:
                            k = clean_key(label)
                            data[k] = val_part
                            matched_spaced = True
                            break
            if matched_spaced:
                i += 1
                continue
            
            # Case 1: Inline extraction using colons (e.g. "Website: www.site.com")
            if ":" in line:
                parts = line.split(":", 1)
                key_part = parts[0].strip()
                val_part = parts[1].strip()
                
                if len(key_part) > 1 and len(key_part) < 30 and is_label(key_part):
                    k = clean_key(key_part)
                    # If value part is not empty, save it
                    if val_part:
                        data[k] = val_part
                        # If it is an address, gather subsequent lines
                        if "address" in k:
                            addr_parts = [val_part]
                            j = i + 1
                            while j < len(lines) and not is_label(lines[j]) and ":" not in lines[j] and lines[j].strip().lower() not in buttons:
                                addr_parts.append(lines[j])
                                j += 1
                            data[k] = ", ".join(addr_parts)
                            i = j - 1
                    # If value part is empty, look at next line
                    elif i + 1 < len(lines) and not is_label(lines[i+1]):
                        data[k] = lines[i+1].strip()
                        i += 1
                    i += 1
                    continue
                    
            # Case 2: Label-Value on separate lines (e.g. "Name \n Olivia Wilson")
            if is_label(line):
                k = clean_key(line)
                # Gather subsequent lines until we hit another label or the end
                val_parts = []
                j = i + 1
                max_lines = 1
                if any(x in k for x in ["address", "description", "particulars", "vendor", "merchant", "supplier", "company"]):
                    max_lines = 4
                while j < len(lines) and len(val_parts) < max_lines and not is_label(lines[j]) and ":" not in lines[j] and lines[j].strip().lower() not in buttons:
                    # Guard: if the value line is a section heading itself, break
                    val_clean = re.sub(r'[^a-zA-Z0-9\s]', '', lines[j]).strip().lower()
                    exclude_keywords = {"uom", "cgst", "sgst", "igst", "s no", "s.no", "taxable value", "tax amt", "declaration", "terms", "conditions", "authorized", "signatory", "signature", "bank details", "tcs", "round off"}
                    if any(ew in val_clean for ew in exclude_keywords):
                        break
                    val_parts.append(lines[j])
                    j += 1
                
                if val_parts:
                    # If we only have one value line, take it
                    if len(val_parts) == 1:
                        data[k] = val_parts[0]
                    else:
                        # For addresses, join with comma, others with space
                        separator = ", " if "address" in k else " "
                        data[k] = separator.join(val_parts)
                    i = j - 1
            i += 1

        # Run FieldMappingEngine mapping on raw keys to dynamically map to target fields
        if target_fields and len(data) > 0:
            try:
                from .mapping_engine import FieldMappingEngine
                mapping_engine = FieldMappingEngine()
                mapped_selectors = mapping_engine.map_fields(data, target_fields)
                
                mapped_data = {}
                for raw_k, val in data.items():
                    if raw_k in mapped_selectors and mapped_selectors[raw_k]:
                        target_sel = mapped_selectors[raw_k]
                        mapped_data[target_sel] = val
                    else:
                        mapped_data[raw_k] = val
                data = mapped_data
            except Exception as map_err:
                print(f"Regex fallback mapping failed: {map_err}")

        return data

    def _post_process_data(self, data: Dict[str, Any], ocr_text: str = "") -> Dict[str, Any]:
        # Standardize keys to lowercase
        processed = {}
        for k, v in data.items():
            if v is not None:
                if k.lower() == "records" and isinstance(v, list):
                    processed["records"] = [self._post_process_data(item, ocr_text) for item in v if isinstance(item, dict)]
                else:
                    processed[k.lower()] = v

        # Clean mobile number if present
        if "mobile_number" in processed and processed["mobile_number"]:
            val = str(processed["mobile_number"]).strip()
            # Remove +91 or 91 country code prefix
            if val.startswith("+91"):
                val = val[3:].strip()
            elif val.startswith("91") and len(val) > 10:
                val = val[2:].strip()
            # Keep only digits
            val = "".join(c for c in val if c.isdigit())
            processed["mobile_number"] = val

        # Clean email domain spaces if any (standard correction)
        if "email" in processed and processed["email"] and "@" in processed["email"]:
            parts = processed["email"].split("@")
            if len(parts) == 2:
                domain = parts[1].strip().replace(" ", ".")
                domain = domain.rstrip(".,")
                username = parts[0].strip()
                processed["email"] = f"{username}@{domain}"
                
        # Clean date fields to keep only the date pattern if multiple texts exist
        date_fields = ["invoice_date", "admission_date", "discharge_date", "journey_date", "dob"]
        date_pattern = r'(\b\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}\b|\b\d{4}[/\-]\d{1,2}[/\-]\d{1,2}\b)'
        for df in date_fields:
            if df in processed and processed[df]:
                val_str = str(processed[df]).strip()
                date_match = re.search(date_pattern, val_str)
                if date_match:
                    processed[df] = date_match.group(1)


        if "dob" not in processed or not processed["dob"]:
            if ocr_text:
                dob_match = re.search(r'\b(?:dob|birth|birthdate|date\s+of\s+birth)[\s\S]{1,30}?\b((?:\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})|(?:[A-Za-z]+\s+\d{1,2},\s+\d{4}))\b', ocr_text, re.IGNORECASE)
                if dob_match:
                    processed["dob"] = dob_match.group(1)

        # ----------------------------------------------------
        # DOMAIN FIELD CORRECTIONS & POST-PROCESSING
        # ----------------------------------------------------
        # 1. GSTIN Clean & Upper
        if "gstin_no" in processed and processed["gstin_no"]:
            processed["gstin_no"] = re.sub(r'[^a-zA-Z0-9]', '', str(processed["gstin_no"])).upper()

        # 2. PAN Number Extraction & Correction
        is_pan_valid = False
        gstin_val = processed.get("gstin_no", "")
        if gstin_val and len(gstin_val) >= 12:
            pan_candidate = gstin_val[2:12]
            corrected_pan = self._clean_and_format_pan(pan_candidate)
            if corrected_pan:
                processed["pan_no"] = corrected_pan
                is_pan_valid = True

        if not is_pan_valid:
            pan_val = str(processed.get("pan_no", "")).strip()
            if pan_val:
                cleaned_pan = re.sub(r'[^a-zA-Z0-9]', '', pan_val).upper()
                corrected_pan = self._clean_and_format_pan(cleaned_pan)
                if corrected_pan:
                    processed["pan_no"] = corrected_pan
                    is_pan_valid = True

        if not is_pan_valid and ocr_text:
            pan_match = re.search(r'\bPAN\b[\s\S]{1,40}\b([A-Z0-9]{10})\b', ocr_text, re.IGNORECASE)
            if pan_match:
                corrected_pan = self._clean_and_format_pan(pan_match.group(1))
                if corrected_pan:
                    processed["pan_no"] = corrected_pan
                    is_pan_valid = True

        # 3. PIN Code Correction
        pin_val = str(processed.get("pin_code", "")).strip()
        pin_digits = "".join(c for c in pin_val if c.isdigit())
        if len(pin_digits) == 6:
            processed["pin_code"] = pin_digits
        else:
            if ocr_text:
                name_query = processed.get("full_name", "") or processed.get("customer_name", "")
                if not name_query:
                    name_query = "Buyer"
                closest_pin = self._find_closest_pincode(ocr_text, name_query)
                if closest_pin:
                    processed["pin_code"] = closest_pin

        # 4. Unit Price, Quantity, Subtotal Mathematical Correction
        if ocr_text:
            qty, price, amt = self._verify_and_extract_line_values(ocr_text)
            if qty and price and amt:
                curr_price = str(processed.get("unit_price", "")).strip()
                if not curr_price or any(c.isalpha() for c in curr_price):
                    processed["unit_price"] = price
                curr_qty = str(processed.get("quantity", "")).strip()
                if not curr_qty or any(c.isalpha() for c in curr_qty):
                    processed["quantity"] = qty

        # 5. Clean Unit Price to be purely numeric
        if "unit_price" in processed and processed["unit_price"]:
            price_str = str(processed["unit_price"]).strip()
            if any(c.isalpha() for c in price_str):
                price_digits = re.findall(r'\b\d+(?:\.\d+)?\b', price_str)
                if price_digits:
                    processed["unit_price"] = price_digits[0]
            else:
                processed["unit_price"] = "".join(c for c in price_str if c.isdigit() or c == '.')

        # 6. Total Amount Correction
        if ocr_text:
            lines = ocr_text.split('\n')
            for line_idx, line in enumerate(lines):
                clean_line = re.sub(r'[^a-zA-Z0-9\s]', '', line).strip().lower()
                if "invoice value" in clean_line and not "words" in clean_line:
                    candidate_lines = lines[line_idx:line_idx+3]
                    found_invoice_value = False
                    for cline in candidate_lines:
                        match = re.search(r'\b\d+\.\d{2}\b', cline)
                        if match:
                            processed["total_amount"] = match.group()
                            found_invoice_value = True
                            break
                    if found_invoice_value:
                        break

        # 7. Clean Vendor Name
        if "vendor_name" in processed and processed["vendor_name"]:
            vendor_str = str(processed["vendor_name"]).strip()
            for term in ["buyers order", "buyer order", "purchase order", "invoice no", "invoice number", "bill to"]:
                pos = vendor_str.lower().find(term)
                if pos != -1:
                    vendor_str = vendor_str[:pos].strip()
            processed["vendor_name"] = vendor_str.rstrip("_,: -")

        # 8. Clean State name from codes (e.g. Code 33 -> TAMILNADU)
        if "state" in processed and processed["state"]:
            state_val = str(processed["state"]).strip()
            if any(c.isdigit() for c in state_val) or "code" in state_val.lower():
                processed["state"] = ""
        
        if not processed.get("state") and ocr_text:
            matches = re.finditer(r'\bState\b', ocr_text, re.IGNORECASE)
            for m in matches:
                sub_text = ocr_text[m.end():m.end()+60]
                words_after = re.findall(r'\b[a-zA-Z]{4,20}\b', sub_text)
                noise = {"code", "gstin", "invoice", "date", "address", "supplier", "buyer", "consignee", "shipping"}
                for w in words_after:
                    if w.lower() not in noise:
                        processed["state"] = w.upper()
                        break
                if processed.get("state"):
                    break
        
        # 9. Clean Bank Details (e.g. "Name of the Bank ICICI" -> "ICICI")
        for key in list(processed.keys()):
            if "bank" in key and processed[key]:
                bank_val = str(processed[key]).strip()
                cleaned_bank = re.sub(
                    r'^(?:name\s+of\s+the\s+bank|name\s+of\s+bank|bank\s+details|bank\s+detail|bank\s+name|bank)\s*[:\-]?\s*',
                    '',
                    bank_val,
                    flags=re.IGNORECASE
                ).strip()
                processed[key] = cleaned_bank

        # 10. Extract Buyer/Customer billing details directly from OCR text to prevent mix-ups and get full address
        if ocr_text:
            buyer_match = re.search(
                r'(?:Buyer\s*\(Bill\s*To\)|Buyer\b|Bill\s*To)\s*[\n:]*\s*([^\n]+)(?:\n\s*([^\n]+))?(?:\n\s*([^\n]+))?(?:\n\s*([^\n]+))?',
                ocr_text,
                re.IGNORECASE
            )
            if buyer_match:
                buyer_name = buyer_match.group(1).strip()
                if not any(kw in buyer_name.lower() for kw in ["gstin", "state", "city", "pan", "phone", "email", "address"]):
                    processed["full_name"] = buyer_name
                    
                    # Gather billing address lines
                    addr_lines = []
                    for idx in range(2, 5):
                        line_val = buyer_match.group(idx)
                        if line_val:
                            line_val = line_val.strip()
                            if not line_val or any(kw in line_val.lower() for kw in ["city", "gstin", "state", "pin", "address", "phone", "email"]):
                                break
                            addr_lines.append(line_val)
                    if addr_lines:
                        processed["address"] = ", ".join(addr_lines)

        # 11. Extract vendor-specific GSTIN and PAN from the supplier section of the OCR text
        if ocr_text:
            buyer_idx = ocr_text.lower().find("buyer")
            supplier_section = ocr_text[:buyer_idx] if buyer_idx != -1 else ocr_text
            
            vendor_gstin_match = re.search(r'\bGSTIN\b[:\s]*([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z][ZR][0-9A-Z])\b', supplier_section, re.IGNORECASE)
            if vendor_gstin_match:
                processed["vendor_gstin"] = vendor_gstin_match.group(1).upper()
            else:
                vendor_gstin_match_loose = re.search(r'\bGSTIN\b[:\s]*([A-Z0-9]{15})\b', supplier_section, re.IGNORECASE)
                if vendor_gstin_match_loose:
                    processed["vendor_gstin"] = vendor_gstin_match_loose.group(1).upper()
                    
            vendor_pan_match = re.search(r'\bPAN\b[:\s]*([A-Z]{5}[0-9]{4}[A-Z]|[A-Z0-9]{10})\b', supplier_section, re.IGNORECASE)
            if vendor_pan_match:
                processed["vendor_pan"] = self._clean_and_format_pan(vendor_pan_match.group(1))

        # 12. An invoice/receipt should not have a Date of Birth (DOB)
        if "dob" in processed and ("invoice_number" in processed or "total_amount" in processed or "vendor_name" in processed):
            if not re.search(r'\b(?:dob|birth|birthdate|date\s+of\s+birth)\b', ocr_text or "", re.IGNORECASE):
                del processed["dob"]
                
        return processed

    def _extract_table_records(self, words: List[Dict[str, Any]], ocr_text: str = "") -> Optional[Dict[str, Any]]:
        """
        Heuristically groups and aligns text blocks horizontally using bounding box center coordinates
        to detect tabular rows and parse spreadsheets of customer records.
        """
        if not words:
            return None

        # 1. Group words into lines vertically based on overlap
        lines_words = []
        current_line = [words[0]]
        for w in words[1:]:
            last_w = current_line[-1]
            last_h = last_w["bbox"][3] - last_w["bbox"][1]
            last_cy = (last_w["bbox"][1] + last_w["bbox"][3]) / 2
            curr_cy = (w["bbox"][1] + w["bbox"][3]) / 2
            
            if abs(curr_cy - last_cy) < 0.6 * last_h:
                current_line.append(w)
            else:
                lines_words.append(current_line)
                current_line = [w]
        lines_words.append(current_line)

        # 2. Helper to group adjacent words in a line into cell text blocks
        distinct_labels = {"name", "phone", "mobile", "contact", "address", "country", "state", "district", "city", "zip", "pincode", "pan", "gstin", "email", "dob"}
        
        def should_avoid_merge(text1: str, text2: str) -> bool:
            clean1 = re.sub(r'[^a-zA-Z0-9\s]', '', text1).strip().lower()
            clean2 = re.sub(r'[^a-zA-Z0-9\s]', '', text2).strip().lower()
            has_label1 = any(dl in clean1 for dl in distinct_labels)
            has_label2 = any(dl in clean2 for dl in distinct_labels)
            if has_label1 and has_label2:
                lbls1 = {dl for dl in distinct_labels if dl in clean1}
                lbls2 = {dl for dl in distinct_labels if dl in clean2}
                if lbls1 != lbls2:
                    return True
            return False

        def get_text_blocks(line_words):
            blocks = []
            if not line_words:
                return blocks
            # Ensure words are sorted left-to-right
            sorted_line = sorted(line_words, key=lambda item: item["bbox"][0])
            current_block = [sorted_line[0]]
            for w in sorted_line[1:]:
                last_w = current_block[-1]
                last_h = last_w["bbox"][3] - last_w["bbox"][1]
                x_gap = w["bbox"][0] - last_w["bbox"][2]
                
                # Check if we should avoid merging them
                current_text = " ".join([item["text"] for item in current_block])
                avoid = should_avoid_merge(current_text, w["text"])
                
                # Merge words that are close horizontally (less than 1.5 * height gap)
                if x_gap < 1.5 * last_h and not avoid:
                    current_block.append(w)
                else:
                    blocks.append({
                        "text": " ".join([item["text"] for item in current_block]),
                        "x_min": current_block[0]["bbox"][0],
                        "x_max": current_block[-1]["bbox"][2]
                    })
                    current_block = [w]
            blocks.append({
                "text": " ".join([item["text"] for item in current_block]),
                "x_min": current_block[0]["bbox"][0],
                "x_max": current_block[-1]["bbox"][2]
            })
            return blocks

        # 3. Search for a header row in the top 40 lines
        known_labels = [
            "name", "full name", "client", "patient", "employee", "customer",
            "email", "mail", "e-mail", "email address",
            "phone", "tel", "telephone", "mobile", "contact", "phone number",
            "date of birth", "dob", "birth date", "birthdate",
            "id", "id number", "license", "passport", "ssn", "identity",
            "address", "addr", "location", "residence", "street",
            "website", "web", "url", "zip", "zipcode", "pincode", "pin", "zip code",
            "pan", "pan no", "pan card", "gstin", "gstin no", "gst",
            "country", "state", "province", "district", "city", "town",
            # GRN/Invoice specific table headers
            "ref no", "ref. no.", "ref_no", "ref no.", "material type", "purity", 
            "material price/g", "material price", "category", "sub category", 
            "type", "quantity", "qty", "gross wt", "net wt", "others", "making charge", 
            "rate per g", "total amount", "total", "making charges", "gross weight", "net weight"
        ]

        header_row_idx = -1
        col_headers = [] # list of {"key": normalized_key, "x_min": x0, "x_max": x1}
        
        for idx, line_words in enumerate(lines_words[:40]):
            blocks = get_text_blocks(line_words)
            matching_blocks_count = 0
            for b in blocks:
                clean_text = b["text"].lower().strip()
                # Check if it matches or contains any known label
                for label in known_labels:
                    if clean_text == label or (len(clean_text) > 2 and clean_text in label) or (len(label) > 2 and label in clean_text):
                        matching_blocks_count += 1
                        break
            
            # If the row has 3 or more column headers matching our keys, we treat it as the Header Row
            if matching_blocks_count >= 3:
                header_row_idx = idx
                for b in blocks:
                    k = self._clean_key_helper(b["text"])
                    col_headers.append({
                        "key": k,
                        "x_min": b["x_min"],
                        "x_max": b["x_max"]
                    })
                break

        # 4. If a header row is found, align data rows under the headers
        records = []
        if header_row_idx != -1:
            for line_words in lines_words[header_row_idx + 1:]:
                if not line_words:
                    continue
                
                # Check if it's a footer or unrelated line (e.g. fewer words than 2, or button labels)
                buttons = {"reset", "save", "submit", "cancel", "clear", "close", "confirm", "create", "update", "delete"}
                line_text_lower = " ".join([w["text"].lower() for w in line_words])
                if len(line_words) < 2 or any(btn == line_text_lower.strip() for btn in buttons):
                    continue

                row_data = {h["key"]: "" for h in col_headers if h["key"]}
                col_words = {h["key"]: [] for h in col_headers if h["key"]}
                
                # Split any word box that contains spaces into separate words with estimated bboxes
                split_line_words = []
                for w in line_words:
                    text = w["text"]
                    bbox = w["bbox"]
                    parts = text.split()
                    if len(parts) <= 1:
                        split_line_words.append(w)
                    else:
                        total_len = len(text)
                        x_min, y_min, x_max, y_max = bbox
                        width = x_max - x_min
                        current_idx = 0
                        for part in parts:
                            start_char_idx = text.find(part, current_idx)
                            if start_char_idx == -1:
                                start_char_idx = current_idx
                            end_char_idx = start_char_idx + len(part)
                            current_idx = end_char_idx
                            
                            p_x_min = x_min + int((start_char_idx / total_len) * width)
                            p_x_max = x_min + int((end_char_idx / total_len) * width)
                            split_line_words.append({
                                "text": part,
                                "bbox": [p_x_min, y_min, p_x_max, y_max]
                            })
                
                for w in split_line_words:
                    w_cx = (w["bbox"][0] + w["bbox"][2]) / 2
                    
                    # Align to the closest column header horizontally using boundary distance
                    best_col = None
                    min_dist = float("inf")
                    for col in col_headers:
                        if not col["key"]:
                            continue
                        if col["x_min"] <= w_cx <= col["x_max"]:
                            dist = 0
                        else:
                            dist = min(abs(w_cx - col["x_min"]), abs(w_cx - col["x_max"]))
                            
                        if dist < min_dist:
                            min_dist = dist
                            best_col = col["key"]
                            
                    if best_col:
                        col_words[best_col].append(w)
                
                # Assemble parsed cell values
                for col_key, words_in_col in col_words.items():
                    if words_in_col:
                        words_in_col.sort(key=lambda item: item["bbox"][0])
                        row_data[col_key] = " ".join([item["text"] for item in words_in_col])
                
                # If there is valid parsed row data, add it to records
                if any(row_data.values()):
                    records.append(self._post_process_data(row_data, ocr_text))
                    
        if records:
            return {"records": records}
        return None

    def _clean_key_helper(self, raw_key: str) -> str:
        # Helper to clean labels into standard snake_case keys (replicates inner clean_key of fallback parser)
        clean = re.sub(r'[^a-zA-Z0-9\s_]', '', raw_key).strip().lower()
        if "ref no" in clean or "ref_no" in clean or clean == "ref":
            return "ref_no"
        if "material type" in clean or "material_type" in clean:
            return "material_type"
        if "purity" in clean:
            return "purity"
        if "material price" in clean or "price/g" in clean or "price per gram" in clean:
            return "material_price_g"
        if "category" in clean:
            return "category"
        if "sub category" in clean or "sub_category" in clean:
            return "sub_category"
        if "type" in clean:
            return "type"
        if "qty" in clean or "quantity" in clean:
            return "quantity"
        if "gross wt" in clean or "gross weight" in clean or "gr wt" in clean:
            return "gross_weight"
        if "net wt" in clean or "net weight" in clean or "nt wt" in clean:
            return "net_weight"
        if "stone wt" in clean or "stone weight" in clean or "st wt" in clean:
            return "stone_weight"
        if "others wt" in clean or "others weight" in clean:
            return "others_wt"
        if "others value" in clean or "others val" in clean:
            return "others_value"
        if "others" in clean:
            return "others"
        if "purchase rate" in clean or "pur rate" in clean:
            return "purchase_rate"
        if "stone rate" in clean:
            return "stone_rate"
        if "making charge" in clean or "making charges" in clean or clean == "mc":
            return "making_charges"
        if "rate per g" in clean or "rate per gram" in clean or "rate/g" in clean or "rate/gram" in clean:
            return "rate_per_gram"
        if "total amount" in clean or "total amt" in clean or clean == "total":
            return "total_amount"

        if any(kw in clean for kw in ["code", "id", "identifier", "no", "num", "number"]):
            if "customer" in clean or "client" in clean or "patient" in clean:
                return "customer_code"
            if "pin" in clean or "zip" in clean or "postal" in clean:
                return "pin_code"
            if "pan" in clean:
                return "pan_no"
            if "gst" in clean or "gstin" in clean:
                return "gstin_no"
            if "phone" in clean or "mobile" in clean or "contact" in clean or "tel" in clean:
                return "mobile_number"
            if "invoice" in clean or "inv" in clean or "bill" in clean or "receipt" in clean:
                # Avoid matching Bill To / Bill From / Billing details as invoice_number
                if ("to" in clean or "from" in clean or "ing" in clean or "address" in clean) and "date" not in clean:
                    pass
                else:
                    return "invoice_number"
        if "gst" in clean or "gstin" in clean:
            return "gstin_no"
        if "pan_no" in clean or "pan no" in clean or "pan card" in clean or clean == "pan" or clean.startswith("pan ") or clean.endswith(" pan") or " pan " in clean:
            return "pan_no"
        if "pincode" in clean or "zip" in clean or "postal" in clean or "pin_code" in clean or clean == "pin" or clean.startswith("pin ") or clean.endswith(" pin") or " pin " in clean:
            return "pin_code"
        if "state" in clean or "province" in clean or "region" in clean:
            return "state"
        if "district" in clean or "city" in clean or "town" in clean or "locality" in clean:
            return "district"
        if "country" in clean or clean == "nation" or clean.startswith("nation ") or clean.endswith(" nation") or " nation " in clean:
            return "country"
        if "buyer" in clean or "bill_to" in clean or "bill to" in clean or "consignee" in clean or "receiver" in clean:
            return "full_name"
        if "vendor" in clean or "merchant" in clean or "supplier" in clean or "biller" in clean or "company" in clean or "seller" in clean or "bill_from" in clean or "bill from" in clean:
            return "vendor_name"
        if "source" in clean or "origin" in clean or "boarding" in clean or clean == "from" or clean.startswith("from ") or clean.endswith(" from") or " from " in clean:
            return "source_location"
        if "destination" in clean or "arrival" in clean or clean == "to" or clean.startswith("to ") or clean.endswith(" to") or " to " in clean:
            return "destination_location"
        if "address" in clean or "addr" in clean or "location" in clean or "residence" in clean or "street" in clean:
            return "address"
        if "phone" in clean or "mobile" in clean or "contact" in clean or "tel" in clean or "cell" in clean:
            return "mobile_number"
        if "email" in clean or "mail" in clean:
            return "email"
        if "dob" in clean or "birth" in clean:
            return "dob"
            
        # Put total_amount check BEFORE invoice check to catch "invoice value"
        if "total" in clean or "amount" in clean or "due" in clean or "grand" in clean or "invoice_value" in clean or "invoice value" in clean or "net_amount" in clean or "net amount" in clean or "value" in clean:
            if "medicine" in clean or "pharmacy" in clean or "drug" in clean:
                return "medicine_cost"
            return "total_amount"
            
        if "invoice" in clean or "inv" in clean or "bill" in clean or "receipt" in clean or "date" in clean:
            # Skip Bill To / Bill From / Billing Address/ Billing details (but keep billing date)
            if ("to" in clean or "from" in clean or "ing" in clean or "address" in clean) and "date" not in clean:
                pass
            else:
                if "date" in clean or "day" in clean or "issue" in clean:
                    if "admit" in clean or "admission" in clean or "visit" in clean or "checkin" in clean:
                        return "admission_date"
                    if "discharge" in clean or "checkout" in clean:
                        return "discharge_date"
                    if "travel" in clean or "journey" in clean or "departure" in clean or "doj" in clean:
                        return "journey_date"
                    return "invoice_date"
                if "ticket" in clean or "pnr" in clean or "booking" in clean:
                    return "pnr_no"
                return "invoice_number"
        if "gross" in clean or "gwt" in clean or "grwt" in clean:
            return "gross_weight"
        if "nwt" in clean or "ntwt" in clean or clean == "net" or clean.startswith("net ") or clean.endswith(" net") or " net " in clean:
            return "net_weight"
        if "purity" in clean or "karat" in clean or "hallmark" in clean or clean.endswith("kt") or clean.endswith("ct"):
            return "purity"
        if "making" in clean or clean == "mc" or "making_charges" in clean or "making_charge" in clean:
            return "making_charges"
        if "wastage" in clean or "waste" in clean:
            return "wastage"
        if "rate" in clean or "unit_price" in clean or "price" in clean:
            if "gram" in clean or "gm" in clean or "metal" in clean or "gold" in clean or "silver" in clean:
                return "rate_per_gram"
            return "unit_price"
        if "stone" in clean or "stwt" in clean:
            return "stone_weight"
        if "item" in clean or "description" in clean or "particulars" in clean or "ornament" in clean or "product" in clean or "goods" in clean or "service" in clean:
            return "item_description"
        if "discount" in clean or "disc" in clean or "rebate" in clean or "promo" in clean:
            return "discount"
        if "quantity" in clean or "qty" in clean or "pieces" in clean or "pcs" in clean or "nos" in clean or "units" in clean or clean == "count" or clean.startswith("count ") or clean.endswith(" count") or " count " in clean:
            return "quantity"
        if "hsn" in clean or "sac" in clean:
            return "hsn_code"
        if "shipping" in clean or "delivery" in clean or "freight" in clean or "postage" in clean or "carriage" in clean or "courier" in clean:
            return "shipping_charges"
        if "sku" in clean or "item_code" in clean or "product_code" in clean or "article_no" in clean or "style_no" in clean or "barcode" in clean:
            return "sku_code"
        if "patient" in clean:
            return "patient_name"
        if "doctor" in clean or "physician" in clean or "surgeon" in clean or "referred" in clean:
            return "doctor_name"
        if "admit" in clean or "admission" in clean:
            return "admission_date"
        if "discharge" in clean:
            return "discharge_date"
        if "room" in clean or "ward" in clean or "bed" in clean or "cabin" in clean:
            return "room_number"
        if "medicine" in clean or "pharmacy" in clean or "drug" in clean:
            return "medicine_cost"
        if "insurance" in clean or "tpa" in clean or "payer" in clean:
            return "insurance_provider"
        if "pnr" in clean or "booking_id" in clean or "ticket" in clean:
            return "pnr_no"
        if "journey" in clean or "departure" in clean or "travel" in clean or "doj" in clean:
            return "journey_date"
        if "seat" in clean or "berth" in clean or "coach" in clean:
            return "seat_number"
        if "vehicle" in clean or "train" in clean or "flight" in clean or "bus" in clean:
            return "vehicle_no"
        if "name" in clean or "client" in clean or "patient" in clean or "customer" in clean or "employee" in clean or "owner" in clean:
            return "full_name"
        return re.sub(r'\s+', '_', clean)

    def _clean_and_format_pan(self, raw_val: str) -> str:
        val = re.sub(r'[^a-zA-Z0-9]', '', raw_val).upper()
        if len(val) != 10:
            return ""
        digit_to_letter = {'0': 'O', '1': 'I', '2': 'Z', '5': 'S', '8': 'B'}
        letter_to_digit = {'O': '0', 'I': '1', 'Z': '2', 'S': '5', 'B': '8'}
        
        part1 = list(val[0:5])
        for idx, char in enumerate(part1):
            if char.isdigit() and char in digit_to_letter:
                part1[idx] = digit_to_letter[char]
                
        part2 = list(val[5:9])
        for idx, char in enumerate(part2):
            if char.isalpha() and char in letter_to_digit:
                part2[idx] = letter_to_digit[char]
                
        part3 = list(val[9:10])
        for idx, char in enumerate(part3):
            if char.isdigit() and char in digit_to_letter:
                part3[idx] = digit_to_letter[char]
                
        corrected_pan = "".join(part1 + part2 + part3)
        if re.match(r'^[A-Z]{5}[0-9]{4}[A-Z]$', corrected_pan):
            return corrected_pan
        return val

    def _find_closest_pincode(self, ocr_text: str, name_query: str) -> str:
        if not ocr_text:
            return ""
        pincodes = re.findall(r'\b\d{6}\b', ocr_text)
        if not pincodes:
            return ""
        if len(pincodes) == 1:
            return pincodes[0]
        
        if not name_query or name_query.lower() == "buyer":
            for q in ["buyer (bill to)", "bill to", "ship to", "consignee"]:
                if q in ocr_text.lower():
                    name_query = q
                    break
        
        if name_query:
            pos = ocr_text.lower().find(name_query.lower())
            if pos != -1:
                matches = list(re.finditer(r'\b\d{6}\b', ocr_text))
                closest_pin = ""
                min_dist = float('inf')
                for m in matches:
                    dist = m.start() - pos
                    if dist > 0 and dist < min_dist:
                        min_dist = dist
                        closest_pin = m.group()
                if closest_pin:
                    return closest_pin
        return pincodes[-1]

    def _verify_and_extract_line_values(self, ocr_text: str):
        if not ocr_text:
            return None, None, None
        for line in ocr_text.split('\n'):
            cleaned_line = line.replace(",.", ".").replace(", ", "").replace(" ,", "")
            nums = re.findall(r'\b\d+(?:\.\d+)?\b', cleaned_line)
            clean_nums = []
            for n in nums:
                try:
                    clean_nums.append(float(n))
                except ValueError:
                    pass
            
            for idx in range(len(clean_nums) - 2):
                n1, n2, n3 = clean_nums[idx], clean_nums[idx+1], clean_nums[idx+2]
                if abs(n1 * n2 - n3) < 0.05 * n3 and n1 > 0 and n2 > 0:
                    qty = f"{n1:.2f}" if '.' in str(n1) else str(int(n1))
                    price = f"{n2:.2f}"
                    amt = f"{n3:.2f}"
                    return qty, price, amt
                    
        return None, None, None

    def _clean_and_load_json(self, text: str) -> Dict[str, Any]:
        text = text.strip()
        # Remove markdown code block wrappers if present
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\n", "", text, flags=re.IGNORECASE)
            text = re.sub(r"\n```$", "", text)
        text = text.strip()
        
        try:
            return json.loads(text)
        except Exception as e:
            # Fix trailing commas inside arrays/objects
            fixed = re.sub(r',\s*([\]}])', r'\1', text)
            try:
                return json.loads(fixed)
            except Exception:
                pass
                
            # Replace single quotes with double quotes around key-value pairs
            fixed_quotes = fixed
            fixed_quotes = re.sub(r"'([a-zA-Z0-9_]+)'\s*:", r'"\1":', fixed_quotes)
            fixed_quotes = re.sub(r":\s*'([^']*)'", r': "\1"', fixed_quotes)
            fixed_quotes = re.sub(r"'\s*,", r'",', fixed_quotes)
            fixed_quotes = re.sub(r"\[\s*'([^']*)'", r'["\1"', fixed_quotes)
            fixed_quotes = re.sub(r"'([^']*)'\s*\]", r'"\1"]', fixed_quotes)
            
            try:
                return json.loads(fixed_quotes)
            except Exception:
                raise e