import json

teams = [
    ('Pakistan Cricket Team',    'Pakistan',     'Mike Hesson',       'Babar Azam',       3),
    ('Indian Cricket Team',      'India',        'Gautam Gambhir',    'Rohit Sharma',     1),
    ('Australian Cricket Team',  'Australia',    'Andrew McDonald',   'Pat Cummins',      2),
    ('South Africa Cricket Team','South Africa', 'Rob Walter',        'Temba Bavuma',     4),
    ('New Zealand Cricket Team', 'New Zealand',  'Gary Stead',        'Kane Williamson',  5),
    ('England Cricket Team',     'England',      'Brendon McCullum',  'Jos Buttler',      6),
    ('West Indies Cricket Team', 'West Indies',  'Daren Sammy',       'Rovman Powell',    7),
    ('Sri Lanka Cricket Team',   'Sri Lanka',    'Chris Silverwood',  'Dasun Shanaka',    8),
    ('Bangladesh Cricket Team',  'Bangladesh',   'Chandika Hathurusingha','Shakib Al Hasan',9),
    ('Afghanistan Cricket Team', 'Afghanistan',  'Jonathan Trott',    'Hashmatullah Shahidi',10)
]

# Generate 25 players per team
players = []
squads = []

for team in teams:
    team_name = team[0]
    country = team[1]
    prefix = country[:3].upper()
    for i in range(1, 26):
        pid = f"{prefix}{i:03d}"
        role = "Batsman"
        if i > 15: role = "Bowler"
        elif i > 10: role = "AllRounder"
        elif i == 1: role = "WicketKeeper"
        
        name = f"{country} Player {i}"
        
        players.append((pid, name, '1995-01-01', country, 'Right-Hand', 'Right-arm Medium', role))
        squads.append((team_name, pid))

print("Teams:")
for t in teams:
    print(f"            {t},")

print("\nPlayers:")
for p in players:
    print(f"            {p},")

print("\nSquads:")
for s in squads:
    print(f"            {s},")

