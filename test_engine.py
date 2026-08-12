import sys
import os
sys.path.append('c:/Users/kavya/Desktop/text_extract/automation_proj/backend')
from app.services.automation_engine import PlaywrightAutomationEngine

engine = PlaywrightAutomationEngine()
print("Starting inspect_page_forms...")
fields = engine.inspect_page_forms('http://localhost:5173/admin/customer')
print(f"\nFinal fields returned: {fields}")
