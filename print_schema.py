import sqlite3
conn=sqlite3.connect('cricket_stats.db')
cursor = conn.cursor()
cursor.execute("SELECT name, sql FROM sqlite_master WHERE type='table' AND name != 'sqlite_sequence'")
tables = cursor.fetchall()
for name, sql in tables:
    print(f"--- {name} ---")
    print(sql)
    print()
