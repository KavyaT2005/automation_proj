
import pandas as pd
import json
import re

df = pd.DataFrame({'CUSTOMER NAME': ['kowsalya'], 'MOBILE NUMBER': ['9000912345'], 'JOB': ['artist'], 'SEX': ['female']})
target_fields = [{'id': 'customer_name', 'label': 'Customer Name'}, {'id': 'mobile_number', 'label': 'Mobile Number'}]

records = []
parsed_targets = target_fields if isinstance(target_fields, list) else None
if not parsed_targets and target_fields:
    try:
        parsed_targets = json.loads(target_fields) if isinstance(target_fields, str) else target_fields
    except Exception as e:
        print('JSON Error:', e)

if parsed_targets:
    class DummyMapping:
        def _get_string_match_score(self, a, b): return 0.0
    mapping_engine = DummyMapping()
    col_map = {}
    for col in df.columns:
        col_clean = re.sub(r'[^a-zA-Z0-9\s_]', '', str(col)).strip().lower().replace(' ', '_')
        matched_fid = None
        for tf in parsed_targets:
            fid = tf.get('id') or tf.get('name')
            flabel = tf.get('label') or ''
            if fid.lower() == col_clean or flabel.lower() == str(col).lower():
                matched_fid = fid
                break
        if not matched_fid:
            best_fid = None
            best_score = 0.0
            for tf in parsed_targets:
                fid = tf.get('id') or tf.get('name')
                flabel = tf.get('label') or ''
                score = mapping_engine._get_string_match_score(col_clean, flabel)
                if score > best_score:
                    best_score = score
                    best_fid = fid
            if best_score >= 0.5:
                matched_fid = best_fid
        if matched_fid:
            col_map[col] = matched_fid
            
    for _, row in df.iterrows():
        rec = {}
        for col, val in row.items():
            if col in col_map:
                key = col_map[col]
                rec[key] = str(val) if val is not None else ''
        records.append(rec)
print(records)

