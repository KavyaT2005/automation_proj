import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

def create_database():
    try:
        # Connect to the default 'postgres' database
        conn = psycopg2.connect(
            dbname='postgres',
            user='postgres',
            password='Kavya@2005',
            host='localhost',
            port='5432'
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()
        
        # Check if database exists
        cursor.execute("SELECT 1 FROM pg_catalog.pg_database WHERE datname = 'automation_db'")
        exists = cursor.fetchone()
        
        if not exists:
            cursor.execute('CREATE DATABASE automation_db')
            print("Database 'automation_db' created successfully.")
        else:
            print("Database 'automation_db' already exists.")
            
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    create_database()
