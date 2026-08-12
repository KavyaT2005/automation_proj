import json
import pandas as pd
import re
import sys
import os

# Add backend directory to sys.path so app modules can be imported
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.mapping_engine import FieldMappingEngine

target_fields = '[{"id": ":r1:", "label": "Customer Code *"}, {"id": ":r2:", "label": "Mobile Number *"}, {"id": ":r3:", "label": "Country *"}]'
parsed_targets = json.loads(target_fields)

df = pd.DataFrame([{"CUSTOMER NAME": "kowsalya", "MOBILE NUMBER": "123", "COUNTRY": "india"}])
mapping_engine = FieldMappingEngine()
col_map = {}
for col in df.columns:
    col_clean = re.sub(r'[^a-zA-Z0-9\s_]', '', str(col)).strip().lower().replace(' ', '_')
    matched_fid = None
    for tf in parsed_targets:
        fid = tf.get("id") or tf.get("name") or ""
        flabel = tf.get("label") or ""
        if (fid and fid.lower() == col_clean) or (flabel and flabel.lower() == str(col).lower()):
            matched_fid = fid
            break
    if not matched_fid:
        best_fid = None
        best_score = 0.0
        for tf in parsed_targets:
            fid = tf.get("id") or tf.get("name") or ""
            flabel = tf.get("label") or ""
            if not fid and not flabel: continue
            score = mapping_engine._get_string_match_score(col_clean, flabel or fid)
            print(f"col: {col}, tf: {flabel or fid}, score: {score}")
            if score > best_score:
                best_score = score
                best_fid = fid
        if best_score >= 0.5:
            matched_fid = best_fid
    if matched_fid:
        col_map[col] = matched_fid

print("col_map:", col_map)
