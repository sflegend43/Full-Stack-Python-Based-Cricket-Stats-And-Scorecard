import sqlite3
conn=sqlite3.connect('cricket_stats.db')
print(conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='Matches'").fetchone()[0])
