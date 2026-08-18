import sqlite3
import json
from app.database import SessionLocal
from app.models.document import DBModelDocument
from app.models.mapping import DBModelMappingMemory

def migrate_data():
    print("Connecting to old SQLite database...")
    try:
        sqlite_conn = sqlite3.connect("sql_app.db")
        sqlite_conn.row_factory = sqlite3.Row
        cursor = sqlite_conn.cursor()
        
        # Connect to Postgres
        pg_db = SessionLocal()
        
        print("Migrating mapping_memory...")
        cursor.execute("SELECT * FROM mapping_memory")
        mappings = cursor.fetchall()
        count = 0
        for row in mappings:
            # Check if exists in PG
            exists = pg_db.query(DBModelMappingMemory).filter_by(
                source_label=row['source_label'], 
                target_key=row['target_key']
            ).first()
            
            if not exists:
                new_mapping = DBModelMappingMemory(
                    user_id=row['user_id'],
                    source_label=row['source_label'],
                    target_key=row['target_key'],
                    frequency_count=row['frequency_count'],
                    is_verified=row['is_verified']
                )
                pg_db.add(new_mapping)
                count += 1
        
        pg_db.commit()
        print(f"Migrated {count} mapping memory records.")

        print("Migrating documents...")
        cursor.execute("SELECT * FROM documents")
        documents = cursor.fetchall()
        count = 0
        for row in documents:
            exists = pg_db.query(DBModelDocument).filter_by(id=row['id']).first()
            if not exists:
                new_doc = DBModelDocument(
                    id=row['id'],
                    filename=row['filename'],
                    storage_path=row['storage_path'],
                    mime_type=row['mime_type'],
                    status=row['status'],
                    ocr_raw_text=row['ocr_raw_text'],
                    extracted_json=json.loads(row['extracted_json']) if row['extracted_json'] else None,
                    corrected_json=json.loads(row['corrected_json']) if row['corrected_json'] else None,
                    confidence_score=row['confidence_score']
                )
                pg_db.add(new_doc)
                count += 1
        
        pg_db.commit()
        print(f"Migrated {count} document records.")
        
        print("✅ Migration completed successfully!")
        
    except sqlite3.OperationalError:
        print("SQLite database not found or no tables exist. Skipping data migration.")
    except Exception as e:
        print(f"Error during migration: {e}")
        if 'pg_db' in locals():
            pg_db.rollback()
    finally:
        if 'sqlite_conn' in locals():
            sqlite_conn.close()
        if 'pg_db' in locals():
            pg_db.close()

if __name__ == "__main__":
    migrate_data()
