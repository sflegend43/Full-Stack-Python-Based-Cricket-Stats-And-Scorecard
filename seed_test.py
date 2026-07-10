from app import app, seed
with app.app_context():
    res = seed()
    print("Seed response:", res[0].get_json())
