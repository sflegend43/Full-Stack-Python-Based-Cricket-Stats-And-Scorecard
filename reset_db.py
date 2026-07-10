import sqlite3
import os

DB_FILE = 'cricket_stats.db'

if os.path.exists(DB_FILE):
    try:
        os.remove(DB_FILE)
        print("Deleted cricket_stats.db")
    except Exception as e:
        print(f"Could not delete db: {e}")
        
        # Try to drop tables instead
        try:
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
            tables = cursor.fetchall()
            for table_name in tables:
                table_name = table_name[0]
                if table_name != 'sqlite_sequence':
                    cursor.execute(f"DROP TABLE IF EXISTS {table_name}")
            conn.commit()
            conn.close()
            print("Dropped all tables in existing db.")
        except Exception as e2:
            print(f"Could not drop tables: {e2}")

