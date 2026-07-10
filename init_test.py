import sqlite3
from app import init_db

# Create tables
init_db()
print("Tables created")

import requests
try:
    # Just to test if the server is running on 5001
    res = requests.post("http://localhost:5001/api/dev/reset")
    print("Reset via API:", res.json())
except Exception as e:
    print("Could not reset via API:", e)
    # Server is not running, we'll try to seed directly
    pass
