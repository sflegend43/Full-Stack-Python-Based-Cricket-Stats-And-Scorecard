# app.py — CricketStats Pro | Flask + SQLite Backend
# ─────────────────────────────────────────────────────
# Run: python app.py
# Open: http://localhost:5001
# ─────────────────────────────────────────────────────

from flask import Flask, request, jsonify, send_from_directory
import sqlite3
import os
import time
import secrets
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash

# ─────────────────────────────────────────────────────
# Password helpers (with legacy plaintext migration support)
# ─────────────────────────────────────────────────────
def verify_password(stored, provided):
    """Verify a password against a hash. Falls back to a plain-text
    comparison for accounts created before password hashing was added."""
    try:
        if check_password_hash(stored, provided):
            return True
    except (ValueError, TypeError):
        pass
    return stored == provided


def is_hashed(value):
    return isinstance(value, str) and value.count('$') >= 2


# ─────────────────────────────────────────────────────
# Auth Decorator — token-based (NOT a spoofable client header)
# ─────────────────────────────────────────────────────
def get_bearer_token():
    header = request.headers.get('Authorization', '')
    if header.lower().startswith('bearer '):
        return header[7:].strip()
    return ''


def get_current_user():
    token = get_bearer_token()
    if not token:
        return None
    with get_db() as conn:
        return conn.execute('SELECT * FROM users WHERE token = ?', (token,)).fetchone()


def requires_admin(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user or not user['isAdmin']:
            return jsonify({'error': 'Unauthorized: Admin access required'}), 403
        return f(*args, **kwargs)
    return decorated_function

# ─────────────────────────────────────────────────────
# App Configuration
# ─────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH  = os.path.join(BASE_DIR, 'cricket_stats.db')

app = Flask(__name__, static_folder=BASE_DIR, static_url_path='')


# ─────────────────────────────────────────────────────
# Database Helpers
# ─────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Create all tables if they don't already exist (SQLite-adapted from SQL Server schema)."""
    with get_db() as conn:
        conn.executescript('''
            CREATE TABLE IF NOT EXISTS users (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                fullname  TEXT    NOT NULL,
                email     TEXT    UNIQUE NOT NULL,
                password  TEXT    NOT NULL,
                isAdmin   INTEGER DEFAULT 0,
                created   TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS Players (
                playerID          TEXT PRIMARY KEY,
                playerName        TEXT NOT NULL,
                playerDOB         TEXT NOT NULL,
                playerNationality TEXT NOT NULL,
                battingStyle      TEXT,
                bowlingStyle      TEXT,
                playerRole        TEXT CHECK(playerRole IN ('Batsman','Bowler','AllRounder','WicketKeeper'))
            );

            CREATE TABLE IF NOT EXISTS Team (
                teamName    TEXT PRIMARY KEY,
                country     TEXT NOT NULL,
                headCoach   TEXT,
                teamCaptain TEXT,
                ranking     INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS Venue (
                venueID       INTEGER PRIMARY KEY,
                venueName     TEXT NOT NULL,
                venueCity     TEXT NOT NULL,
                venueCountry  TEXT NOT NULL,
                venueCapacity INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS Umpire (
                umpireID                INTEGER PRIMARY KEY,
                umpireName              TEXT NOT NULL,
                umpireNationality       TEXT NOT NULL,
                umpireExperienceMatches INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS Matches (
                matchID            INTEGER PRIMARY KEY,
                tournamentName     TEXT NOT NULL,
                matchFormat        TEXT NOT NULL CHECK(matchFormat IN ('T20','ODI','TEST','T10')),
                matchType          TEXT NOT NULL CHECK(matchType IN ('League','Semi-Final','Final','Group-Stage')),
                isDayNight         INTEGER DEFAULT 0,
                team1Name          TEXT NOT NULL,
                team2Name          TEXT NOT NULL,
                venueID            INTEGER NOT NULL,
                matchDate          TEXT,
                winnerName         TEXT,
                tossWinnerName     TEXT,
                tossDecision       TEXT,
                winMargin          TEXT,
                onFieldUmpire1ID   INTEGER NOT NULL,
                onFieldUmpire2ID   INTEGER NOT NULL,
                thirdUmpireID      INTEGER,
                team1TotalRuns     INTEGER DEFAULT 0,
                team1TotalWickets  INTEGER DEFAULT 0,
                team2TotalRuns     INTEGER DEFAULT 0,
                team2TotalWickets  INTEGER DEFAULT 0,
                FOREIGN KEY (venueID)          REFERENCES Venue(venueID),
                FOREIGN KEY (team1Name)        REFERENCES Team(teamName),
                FOREIGN KEY (team2Name)        REFERENCES Team(teamName),
                FOREIGN KEY (winnerName)       REFERENCES Team(teamName),
                FOREIGN KEY (tossWinnerName)   REFERENCES Team(teamName),
                FOREIGN KEY (onFieldUmpire1ID) REFERENCES Umpire(umpireID),
                FOREIGN KEY (onFieldUmpire2ID) REFERENCES Umpire(umpireID),
                FOREIGN KEY (thirdUmpireID)    REFERENCES Umpire(umpireID)
            );

            CREATE TABLE IF NOT EXISTS BallByBall (
                ballID            INTEGER PRIMARY KEY AUTOINCREMENT,
                matchID           INTEGER NOT NULL,
                inningsNumber     INTEGER NOT NULL CHECK(inningsNumber BETWEEN 1 AND 4),
                overNumber        INTEGER NOT NULL,
                ballNumber        INTEGER NOT NULL CHECK(ballNumber >= 1),
                batsmanID         TEXT NOT NULL,
                bowlerID          TEXT NOT NULL,
                runsScored        INTEGER NOT NULL,
                extras            INTEGER DEFAULT 0,
                extraType         TEXT,
                wicketFallen      INTEGER DEFAULT 0,
                dismissedPlayerID TEXT,
                wicketType        TEXT,
                FOREIGN KEY (matchID)           REFERENCES Matches(matchID),
                FOREIGN KEY (batsmanID)         REFERENCES Players(playerID),
                FOREIGN KEY (dismissedPlayerID) REFERENCES Players(playerID),
                FOREIGN KEY (bowlerID)          REFERENCES Players(playerID)
            );

            CREATE TABLE IF NOT EXISTS Squad (
                teamName  TEXT NOT NULL,
                playerID  TEXT NOT NULL,
                PRIMARY KEY (teamName, playerID),
                FOREIGN KEY (teamName) REFERENCES Team(teamName),
                FOREIGN KEY (playerID) REFERENCES Players(playerID)
            );

            CREATE TABLE IF NOT EXISTS PlayingXI (
                matchID   INTEGER NOT NULL,
                playerID  TEXT    NOT NULL,
                matchRole TEXT CHECK(matchRole IN ('Player','Captain','WicketKeeper','Captain & WK')),
                PRIMARY KEY (matchID, playerID),
                FOREIGN KEY (matchID)  REFERENCES Matches(matchID),
                FOREIGN KEY (playerID) REFERENCES Players(playerID)
            );

            CREATE TABLE IF NOT EXISTS Tournament (
                tournamentName TEXT PRIMARY KEY,
                format         TEXT NOT NULL,
                totalTeams     INTEGER,
                overs          INTEGER
            );

            CREATE TABLE IF NOT EXISTS TournamentTeams (
                tournamentName TEXT NOT NULL,
                teamName       TEXT NOT NULL,
                PRIMARY KEY (tournamentName, teamName),
                FOREIGN KEY (tournamentName) REFERENCES Tournament(tournamentName),
                FOREIGN KEY (teamName)       REFERENCES Team(teamName)
            );

            CREATE TABLE IF NOT EXISTS TournamentSquad (
                tournamentName TEXT NOT NULL,
                teamName       TEXT NOT NULL,
                playerID       TEXT NOT NULL,
                PRIMARY KEY (tournamentName, teamName, playerID),
                FOREIGN KEY (tournamentName) REFERENCES Tournament(tournamentName),
                FOREIGN KEY (teamName)       REFERENCES Team(teamName),
                FOREIGN KEY (playerID)       REFERENCES Players(playerID)
            );

            CREATE TABLE IF NOT EXISTS MatchState (
                matchID       INTEGER NOT NULL,
                inningsNumber INTEGER NOT NULL CHECK(inningsNumber BETWEEN 1 AND 4),
                strikerID     TEXT,
                nonStrikerID  TEXT,
                bowlerID      TEXT,
                PRIMARY KEY (matchID, inningsNumber),
                FOREIGN KEY (matchID) REFERENCES Matches(matchID)
            );
        ''')

        # Migrations
        try:
            conn.execute('ALTER TABLE Matches ADD COLUMN tossDecision TEXT')
        except sqlite3.OperationalError:
            pass # column already exists
            
        try:
            conn.execute('ALTER TABLE PlayingXI ADD COLUMN teamName TEXT')
        except sqlite3.OperationalError:
            pass # column already exists

        try:
            conn.execute('ALTER TABLE users ADD COLUMN token TEXT')
        except sqlite3.OperationalError:
            pass # column already exists

        try:
            conn.execute('ALTER TABLE BallByBall ADD COLUMN fielderID TEXT')
        except sqlite3.OperationalError:
            pass # column already exists

        try:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS MatchState (
                    matchID       INTEGER NOT NULL,
                    inningsNumber INTEGER NOT NULL CHECK(inningsNumber BETWEEN 1 AND 4),
                    strikerID     TEXT,
                    nonStrikerID  TEXT,
                    bowlerID      TEXT,
                    PRIMARY KEY (matchID, inningsNumber),
                    FOREIGN KEY (matchID) REFERENCES Matches(matchID)
                )
            ''')
        except sqlite3.OperationalError:
            pass # table already exists

# ─────────────────────────────────────────────────────
# Static Page Routes
# ─────────────────────────────────────────────────────
@app.route('/')
def root():
    return send_from_directory(BASE_DIR, 'login.html')

@app.route('/<page>.html')
def serve_html_page(page):
    return send_from_directory(BASE_DIR, f"{page}.html")


# ─────────────────────────────────────────────────────
# AUTH API
# ─────────────────────────────────────────────────────
@app.route('/api/signup', methods=['POST'])
def signup():
    data     = request.get_json(silent=True) or {}
    fullname = (data.get('fullname') or '').strip()
    email    = (data.get('email')    or '').strip().lower()
    password = (data.get('password') or '').strip()
    role     = (data.get('role')     or '').strip().lower()
    adminKey = (data.get('adminKey') or '').strip()

    if not fullname or not email or not password:
        return jsonify({'error': 'All fields are required'}), 400
    if '@' not in email:
        return jsonify({'error': 'Please enter a valid email address'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400

    is_admin = 0
    if role == 'admin':
        admin_key_expected = os.environ.get('CRICKET_ADMIN_KEY', 'CRICKET_ADMIN_2026')
        if adminKey != admin_key_expected:
            return jsonify({'error': 'Invalid Admin Registration Key'}), 403
        is_admin = 1

    token = secrets.token_hex(32)
    try:
        with get_db() as conn:
            conn.execute(
                'INSERT INTO users (fullname, email, password, isAdmin, token) VALUES (?, ?, ?, ?, ?)',
                (fullname, email, generate_password_hash(password), is_admin, token)
            )
        return jsonify({'message': 'Account created successfully', 'user': {'fullname': fullname, 'email': email, 'isAdmin': bool(is_admin), 'token': token}}), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Email already registered. Please log in instead.'}), 400


@app.route('/api/login', methods=['POST'])
def login():
    data     = request.get_json(silent=True) or {}
    email    = (data.get('email')    or '').strip().lower()
    password = (data.get('password') or '').strip()

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    with get_db() as conn:
        user = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()

        if not user or not verify_password(user['password'], password):
            return jsonify({'error': 'Invalid email or password'}), 401

        token = secrets.token_hex(32)
        updates = {'token': token}
        if not is_hashed(user['password']):
            # Self-heal legacy plaintext passwords into hashed ones
            updates['password'] = generate_password_hash(password)

        if 'password' in updates:
            conn.execute('UPDATE users SET token=?, password=? WHERE id=?',
                         (updates['token'], updates['password'], user['id']))
        else:
            conn.execute('UPDATE users SET token=? WHERE id=?', (updates['token'], user['id']))

    is_admin = bool(user['isAdmin']) if 'isAdmin' in user.keys() else False
    return jsonify({'user': {'fullname': user['fullname'], 'email': user['email'], 'isAdmin': is_admin, 'token': token}})


import seed_data

# ─────────────────────────────────────────────────────
# SEED API — Populates all data from the SQL schema
# ─────────────────────────────────────────────────────
@app.route('/api/dev/reset', methods=['POST'])
@requires_admin
def reset_db_api():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        for table_name in tables:
            table_name = table_name[0]
            if table_name != 'sqlite_sequence':
                cursor.execute(f"DROP TABLE IF EXISTS {table_name}")
        conn.commit()
    init_db()
    return jsonify({'message': 'DB reset complete'})

@app.route('/api/seed', methods=['POST'])
def seed():
    with get_db() as conn:
        # Check if already seeded
        existing = conn.execute('SELECT COUNT(*) as c FROM Players').fetchone()
        if existing['c'] > 0:
            return jsonify({'message': 'Database already seeded', 'players': existing['c']}), 200

        # Teams
        conn.executemany('INSERT OR IGNORE INTO Team VALUES (?,?,?,?,?)', seed_data.teams)

        # Tournaments
        conn.executemany('INSERT OR IGNORE INTO Tournament VALUES (?,?,?,?)', [
            ('ICC Champions Trophy', 'T10', 8, 10),
            ('World Cup 2027', 'ODI', 14, 50),
        ])

        # Players
        conn.executemany('INSERT OR IGNORE INTO Players VALUES (?,?,?,?,?,?,?)', seed_data.players)

        # Venues
        conn.executemany('INSERT OR IGNORE INTO Venue VALUES (?,?,?,?,?)', seed_data.venues)

        # Umpires
        conn.executemany('INSERT OR IGNORE INTO Umpire VALUES (?,?,?,?)', seed_data.umpires)

        # Squads
        conn.executemany('INSERT OR IGNORE INTO Squad VALUES (?,?)', seed_data.squads)

    return jsonify({'message': 'Database seeded successfully!'}), 201


# ─────────────────────────────────────────────────────
# PLAYERS API
# ─────────────────────────────────────────────────────
@app.route('/api/players', methods=['GET'])
def get_players():
    role        = request.args.get('role', '').strip()
    nationality = request.args.get('nationality', '').strip()
    search      = request.args.get('search', '').strip()

    query  = 'SELECT * FROM Players WHERE 1=1'
    params = []
    if role:
        query += ' AND playerRole = ?'; params.append(role)
    if nationality:
        query += ' AND playerNationality = ?'; params.append(nationality)
    if search:
        query += ' AND playerName LIKE ?'; params.append(f'%{search}%')
    query += ' ORDER BY playerNationality, playerName'

    with get_db() as conn:
        rows = conn.execute(query, params).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/players/by_team', methods=['GET'])
def get_players_by_team():
    with get_db() as conn:
        rows = conn.execute('''
            SELECT p.*, s.teamName
            FROM Players p
            JOIN Squad s ON p.playerID = s.playerID
            ORDER BY s.teamName, p.playerName
        ''').fetchall()
        
        grouped = {}
        for r in rows:
            t = r['teamName']
            if t not in grouped: grouped[t] = []
            grouped[t].append(dict(r))
    return jsonify(grouped)

@app.route('/api/players/add_to_pool', methods=['POST'])
@requires_admin
def add_player_to_pool():
    d = request.get_json(silent=True) or {}
    name  = (d.get('playerName')        or '').strip()
    dob   = (d.get('playerDOB')         or '').strip()
    nat   = (d.get('playerNationality') or '').strip()
    bat   = (d.get('battingStyle')      or '').strip()
    bowl  = (d.get('bowlingStyle')      or '').strip()
    role  = (d.get('playerRole')        or '').strip()
    tname = (d.get('teamName')          or '').strip()

    if not all([name, dob, nat, role, tname]):
        return jsonify({'error': 'All fields and teamName are required'}), 400

    import uuid
    pid = "P" + str(uuid.uuid4())[:8].upper()

    try:
        with get_db() as conn:
            # Check if team exists
            team = conn.execute('SELECT 1 FROM Team WHERE teamName=?', (tname,)).fetchone()
            if not team: return jsonify({'error': 'Team not found'}), 404

            conn.execute('INSERT INTO Players VALUES (?,?,?,?,?,?,?)', (pid, name, dob, nat, bat, bowl, role))
            conn.execute('INSERT INTO Squad (teamName, playerID) VALUES (?,?)', (tname, pid))
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Player ID already exists or integrity error'}), 400
    return jsonify({'message': 'Player added to pool', 'playerID': pid}), 201

@app.route('/api/players/<player_id>', methods=['GET'])
def get_player(player_id):
    with get_db() as conn:
        p = conn.execute('SELECT * FROM Players WHERE playerID = ?', (player_id,)).fetchone()
        if not p:
            return jsonify({'error': 'Player not found'}), 404
        # Career batting stats
        batting = conn.execute('''
            SELECT COUNT(ballID) AS balls, SUM(runsScored) AS runs,
                   SUM(CASE WHEN runsScored=4 THEN 1 ELSE 0 END) AS fours,
                   SUM(CASE WHEN runsScored=6 THEN 1 ELSE 0 END) AS sixes,
                   MAX(runsScored) AS topScore
            FROM BallByBall WHERE batsmanID = ?
        ''', (player_id,)).fetchone()
        # Career bowling stats
        bowling = conn.execute('''
            SELECT COUNT(ballID) AS balls, SUM(runsScored+extras) AS runsConceded,
                   SUM(wicketFallen) AS wickets
            FROM BallByBall WHERE bowlerID = ?
        ''', (player_id,)).fetchone()
    return jsonify({
        'player':  dict(p),
        'batting': dict(batting),
        'bowling': dict(bowling)
    })


@app.route('/api/players', methods=['POST'])
@requires_admin
def add_player():
    d = request.get_json(silent=True) or {}
    pid   = (d.get('playerID')          or '').strip().upper()
    name  = (d.get('playerName')        or '').strip()
    dob   = (d.get('playerDOB')         or '').strip()
    nat   = (d.get('playerNationality') or '').strip()
    bat   = (d.get('battingStyle')      or '').strip()
    bowl  = (d.get('bowlingStyle')      or '').strip()
    role  = (d.get('playerRole')        or '').strip()

    if not all([pid, name, dob, nat, role]):
        return jsonify({'error': 'playerID, playerName, playerDOB, playerNationality, playerRole are required'}), 400

    try:
        with get_db() as conn:
            conn.execute('INSERT INTO Players VALUES (?,?,?,?,?,?,?)', (pid, name, dob, nat, bat, bowl, role))
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Player ID already exists'}), 400
    return jsonify({'message': 'Player added', 'playerID': pid}), 201


@app.route('/api/players/<player_id>', methods=['PUT'])
@requires_admin
def update_player(player_id):
    d = request.get_json(silent=True) or {}
    with get_db() as conn:
        existing = conn.execute('SELECT * FROM Players WHERE playerID=?', (player_id,)).fetchone()
        if not existing:
            return jsonify({'error': 'Player not found'}), 404
        name  = d.get('playerName',        existing['playerName'])
        dob   = d.get('playerDOB',         existing['playerDOB'])
        nat   = d.get('playerNationality', existing['playerNationality'])
        bat   = d.get('battingStyle',      existing['battingStyle'])
        bowl  = d.get('bowlingStyle',      existing['bowlingStyle'])
        role  = d.get('playerRole',        existing['playerRole'])
        conn.execute('''UPDATE Players SET playerName=?,playerDOB=?,playerNationality=?,
            battingStyle=?,bowlingStyle=?,playerRole=? WHERE playerID=?''',
            (name, dob, nat, bat, bowl, role, player_id))
    return jsonify({'message': 'Player updated'})


@app.route('/api/players/<player_id>', methods=['DELETE'])
@requires_admin
def delete_player(player_id):
    with get_db() as conn:
        existing = conn.execute('SELECT 1 FROM Players WHERE playerID=?', (player_id,)).fetchone()
        if not existing:
            return jsonify({'error': 'Player not found'}), 404

        played = conn.execute('''
            SELECT 1 FROM BallByBall
            WHERE batsmanID=? OR bowlerID=? OR dismissedPlayerID=? LIMIT 1
        ''', (player_id, player_id, player_id)).fetchone()
        if played:
            return jsonify({'error': 'Cannot delete: player has recorded ball-by-ball match statistics'}), 400

        # Remove dependent rows first to satisfy foreign-key constraints
        conn.execute('DELETE FROM Squad WHERE playerID=?', (player_id,))
        conn.execute('DELETE FROM PlayingXI WHERE playerID=?', (player_id,))
        conn.execute('DELETE FROM TournamentSquad WHERE playerID=?', (player_id,))
        conn.execute('DELETE FROM Players WHERE playerID=?', (player_id,))
    return jsonify({'message': 'Player deleted'})


# ─────────────────────────────────────────────────────
# TEAMS API
# ─────────────────────────────────────────────────────
@app.route('/api/teams', methods=['GET'])
def get_teams():
    with get_db() as conn:
        rows = conn.execute('SELECT * FROM Team ORDER BY ranking').fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/teams', methods=['POST'])
@requires_admin
def add_team():
    d = request.get_json(silent=True) or {}
    tname = (d.get('teamName') or '').strip()
    country = (d.get('countryName') or '').strip()
    coach = (d.get('headCoach') or '').strip()
    captain = (d.get('captainID') or '').strip()

    if not tname:
        return jsonify({'error': 'teamName is required'}), 400

    if not country:
        return jsonify({'error': 'countryName is required'}), 400

    try:
        with get_db() as conn:
            # Assign ranking as next integer
            curr_rank = conn.execute('SELECT MAX(ranking) as m FROM Team').fetchone()['m'] or 0
            conn.execute('INSERT INTO Team (teamName, country, headCoach, teamCaptain, ranking) VALUES (?,?,?,?,?)',
                         (tname, country, coach, captain, curr_rank + 1))
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Team already exists'}), 400
    return jsonify({'message': 'Team created', 'teamName': tname}), 201


@app.route('/api/teams/<path:team_name>', methods=['GET'])
def get_team(team_name):
    with get_db() as conn:
        t = conn.execute('SELECT * FROM Team WHERE teamName=?', (team_name,)).fetchone()
        if not t:
            return jsonify({'error': 'Team not found'}), 404
        squad = conn.execute('''
            SELECT p.*, s.teamName FROM Players p
            JOIN Squad s ON p.playerID = s.playerID
            WHERE s.teamName = ?
        ''', (team_name,)).fetchall()
        matches = conn.execute('''
            SELECT * FROM Matches
            WHERE team1Name=? OR team2Name=?
            ORDER BY matchDate DESC
        ''', (team_name, team_name)).fetchall()
    return jsonify({
        'team':    dict(t),
        'squad':   [dict(r) for r in squad],
        'matches': [dict(r) for r in matches]
    })


# ─────────────────────────────────────────────────────
# MATCHES API
# ─────────────────────────────────────────────────────
@app.route('/api/matches', methods=['GET'])
def get_matches():
    fmt    = request.args.get('format', '').strip()
    mtype  = request.args.get('type', '').strip()
    query  = 'SELECT * FROM Matches WHERE 1=1'
    params = []
    if fmt:
        query += ' AND matchFormat=?'; params.append(fmt)
    if mtype:
        query += ' AND matchType=?'; params.append(mtype)
    query += ' ORDER BY matchDate DESC'

    with get_db() as conn:
        rows = conn.execute(query, params).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route('/api/matches/<int:match_id>', methods=['GET'])
def get_match(match_id):
    with get_db() as conn:
        m = conn.execute('SELECT * FROM Matches WHERE matchID=?', (match_id,)).fetchone()
        if not m:
            return jsonify({'error': 'Match not found'}), 404
        balls = conn.execute('''
            SELECT b.*, p1.playerName AS batsmanName, p2.playerName AS bowlerName,
                   p3.playerName AS dismissedName
            FROM BallByBall b
            LEFT JOIN Players p1 ON b.batsmanID = p1.playerID
            LEFT JOIN Players p2 ON b.bowlerID  = p2.playerID
            LEFT JOIN Players p3 ON b.dismissedPlayerID = p3.playerID
            WHERE b.matchID = ?
            ORDER BY b.inningsNumber, b.overNumber, b.ballNumber
        ''', (match_id,)).fetchall()
        xi = conn.execute('''
            SELECT px.*, p.playerName, p.playerRole, p.playerNationality
            FROM PlayingXI px
            JOIN Players p ON px.playerID = p.playerID
            WHERE px.matchID = ?
        ''', (match_id,)).fetchall()
    return jsonify({
        'match':       dict(m),
        'ballByBall':  [dict(b) for b in balls],
        'playingXI':   [dict(x) for x in xi]
    })


@app.route('/api/matches', methods=['POST'])
@requires_admin
def add_match():
    d = request.get_json(silent=True) or {}
    required = ['matchID','tournamentName','matchFormat','matchType',
                'team1Name','team2Name','venueID','onFieldUmpire1ID','onFieldUmpire2ID']
    for f in required:
        if not d.get(f):
            return jsonify({'error': f'{f} is required'}), 400
    try:
        with get_db() as conn:
            conn.execute('''INSERT INTO Matches
                (matchID,tournamentName,matchFormat,matchType,isDayNight,
                 team1Name,team2Name,venueID,matchDate,winnerName,tossWinnerName,
                 tossDecision,winMargin,onFieldUmpire1ID,onFieldUmpire2ID,thirdUmpireID)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''', (
                d['matchID'], d['tournamentName'], d['matchFormat'], d['matchType'],
                d.get('isDayNight', 0), d['team1Name'], d['team2Name'], d['venueID'],
                d.get('matchDate'), d.get('winnerName'), d.get('tossWinnerName'),
                d.get('tossDecision'), d.get('winMargin'), d['onFieldUmpire1ID'], d['onFieldUmpire2ID'],
                d.get('thirdUmpireID')
            ))
    except sqlite3.IntegrityError as e:
        return jsonify({'error': str(e)}), 400
    return jsonify({'message': 'Match created', 'matchID': d['matchID']}), 201

@app.route('/api/matches/<int:match_id>/xi', methods=['POST'])
@requires_admin
def add_playing_xi(match_id):
    d = request.get_json(silent=True) or {}
    players = d.get('players', [])
    if not players:
        return jsonify({'error': 'No players provided'}), 400
    try:
        with get_db() as conn:
            # Delete any existing XI for this match
            conn.execute('DELETE FROM PlayingXI WHERE matchID=?', (match_id,))
            for p in players:
                if isinstance(p, dict):
                    pid = p.get('playerID')
                    role = p.get('matchRole')
                    team_name = p.get('teamName')
                else:
                    pid = p
                    role = None
                    team_name = None
                conn.execute('INSERT INTO PlayingXI (matchID, playerID, matchRole, teamName) VALUES (?, ?, ?, ?)', (match_id, pid, role, team_name))
    except Exception as e:
        return jsonify({'error': str(e)}), 400
    return jsonify({'message': 'Playing XI saved', 'matchID': match_id}), 201

@app.route('/api/matches/<int:match_id>', methods=['DELETE'])
@requires_admin
def delete_match(match_id):
    with get_db() as conn:
        conn.execute('DELETE FROM BallByBall WHERE matchID=?', (match_id,))
        conn.execute('DELETE FROM PlayingXI  WHERE matchID=?', (match_id,))
        r = conn.execute('DELETE FROM Matches WHERE matchID=?', (match_id,))
        if r.rowcount == 0:
            return jsonify({'error': 'Match not found'}), 404
    return jsonify({'message': 'Match deleted'})


# ─────────────────────────────────────────────────────
# TOURNAMENTS API
# ─────────────────────────────────────────────────────
@app.route('/api/tournaments', methods=['GET'])
def get_tournaments():
    with get_db() as conn:
        rows = conn.execute('SELECT * FROM Tournament').fetchall()
        t_list = []
        for r in rows:
            d = dict(r)
            teams = conn.execute('SELECT teamName FROM TournamentTeams WHERE tournamentName=?', (d['tournamentName'],)).fetchall()
            d['teams'] = [t['teamName'] for t in teams]
            t_list.append(d)
    return jsonify(t_list)

@app.route('/api/tournaments', methods=['POST'])
@requires_admin
def create_tournament():
    d = request.get_json(silent=True) or {}
    name   = (d.get('tournamentName') or '').strip()
    fmt    = (d.get('format') or '').strip()
    teams  = int(d.get('totalTeams') or 0)
    overs  = int(d.get('overs') or 0)
    team_list = d.get('teams') or []

    if not name or not fmt:
        return jsonify({'error': 'Name and format required'}), 400

    try:
        with get_db() as conn:
            conn.execute('INSERT INTO Tournament VALUES (?,?,?,?)', (name, fmt, teams, overs))
            for t in team_list:
                conn.execute('INSERT INTO TournamentTeams VALUES (?,?)', (name, t))
        return jsonify({'message': 'Tournament created', 'tournamentName': name}), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Tournament name might already exist'}), 400

@app.route('/api/tournaments/<path:name>', methods=['DELETE'])
@requires_admin
def delete_tournament(name):
    try:
        with get_db() as conn:
            # Delete children first to prevent foreign key constraint violations
            conn.execute('DELETE FROM TournamentSquad WHERE tournamentName = ?', (name,))
            conn.execute('DELETE FROM TournamentTeams WHERE tournamentName = ?', (name,))
            
            # Cascade delete matches and their balls
            matches = conn.execute('SELECT matchID FROM Matches WHERE tournamentName = ?', (name,)).fetchall()
            for m in matches:
                mid = m['matchID']
                conn.execute('DELETE FROM BallByBall WHERE matchID=?', (mid,))
                conn.execute('DELETE FROM PlayingXI WHERE matchID=?', (mid,))
            conn.execute('DELETE FROM Matches WHERE tournamentName = ?', (name,))
            
            # Now delete parent
            conn.execute('DELETE FROM Tournament WHERE tournamentName = ?', (name,))
        return jsonify({'message': 'Tournament deleted'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tournaments/<name>/squad', methods=['GET'])
def get_tournament_squads(name):
    with get_db() as conn:
        rows = conn.execute('''
            SELECT ts.teamName, p.playerID, p.playerName, p.playerRole
            FROM TournamentSquad ts
            JOIN Players p ON ts.playerID = p.playerID
            WHERE ts.tournamentName = ?
            ORDER BY ts.teamName, p.playerName
        ''', (name,)).fetchall()
        
        squads = {}
        for r in rows:
            t = r['teamName']
            if t not in squads: squads[t] = []
            squads[t].append({
                'playerID': r['playerID'],
                'playerName': r['playerName'],
                'playerRole': r['playerRole']
            })
    return jsonify(squads)

@app.route('/api/tournaments/<name>/squad', methods=['POST'])
@requires_admin
def save_tournament_squad(name):
    data = request.get_json(silent=True) or {}
    squad_list = data.get('squads') or [] # list of {teamName: ..., playerID: ...}
    
    if not squad_list:
        return jsonify({'error': 'Squad data required'}), 400

    try:
        with get_db() as conn:
            # First, check if tournament exists
            t = conn.execute('SELECT 1 FROM Tournament WHERE tournamentName=?', (name,)).fetchone()
            if not t: return jsonify({'error': 'Tournament not found'}), 404
            
            # Clear the old squad
            conn.execute('DELETE FROM TournamentSquad WHERE tournamentName=?', (name,))
            
            # Insert the selected players
            for s in squad_list:
                conn.execute('INSERT INTO TournamentSquad (tournamentName, teamName, playerID) VALUES (?,?,?)',
                            (name, s['teamName'], s['playerID']))
        return jsonify({'message': 'Tournament squad saved successfully'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────────────────
# STATS API
# ─────────────────────────────────────────────────────
@app.route('/api/stats/leaderboard', methods=['GET'])
def leaderboard():
    tournament = request.args.get('tournamentName', '').strip()
    t_join = " JOIN Matches m ON b.matchID = m.matchID " if tournament else ""
    t_where = " WHERE m.tournamentName = ? " if tournament else " WHERE 1=1 "
    t_params = (tournament,) if tournament else ()

    with get_db() as conn:
        # Top batsmen by total runs
        batsmen = conn.execute(f'''
            SELECT b.batsmanID AS playerID, p.playerName, p.playerNationality,
                   SUM(b.runsScored) AS totalRuns,
                   SUM(CASE WHEN b.extraType='Retired' THEN 0 ELSE 1 END) AS ballsFaced,
                   SUM(CASE WHEN b.runsScored=4 THEN 1 ELSE 0 END) AS fours,
                   SUM(CASE WHEN b.runsScored=6 THEN 1 ELSE 0 END) AS sixes
            FROM BallByBall b
            JOIN Players p ON b.batsmanID = p.playerID
            {t_join}
            {t_where}
            GROUP BY b.batsmanID
            ORDER BY totalRuns DESC
            LIMIT 10
        ''', t_params).fetchall()
        # Top bowlers by wickets
        bowlers = conn.execute(f'''
            SELECT b.bowlerID AS playerID, p.playerName, p.playerNationality,
                   SUM(CASE WHEN b.wicketFallen=1 AND (b.wicketType IS NULL OR b.wicketType != 'RetiredOut')
                            THEN 1 ELSE 0 END) AS wickets,
                   SUM(CASE WHEN (b.extraType IS NULL OR b.extraType NOT IN ('Wide','NoBall','Retired'))
                            THEN 1 ELSE 0 END) AS ballsBowled,
                   SUM(b.runsScored+b.extras) AS runsConceded
            FROM BallByBall b
            JOIN Players p ON b.bowlerID = p.playerID
            {t_join}
            {t_where}
            GROUP BY b.bowlerID
            ORDER BY wickets DESC
            LIMIT 10
        ''', t_params).fetchall()
        # Role distribution
        roles = conn.execute('''
            SELECT playerRole, COUNT(*) AS count FROM Players GROUP BY playerRole
        ''').fetchall()
        # Nationality distribution
        nations = conn.execute('''
            SELECT playerNationality, COUNT(*) AS count FROM Players GROUP BY playerNationality
        ''').fetchall()
    return jsonify({
        'topBatsmen': [dict(r) for r in batsmen],
        'topBowlers': [dict(r) for r in bowlers],
        'roleDistribution': [dict(r) for r in roles],
        'nationDistribution': [dict(r) for r in nations]
    })


@app.route('/api/stats/scorecard/<int:match_id>', methods=['GET'])
def scorecard(match_id):
    with get_db() as conn:
        m = conn.execute('SELECT * FROM Matches WHERE matchID=?', (match_id,)).fetchone()
        if not m:
            return jsonify({'error': 'Match not found'}), 404

        def get_batting(innings_num):
            return conn.execute('''
                SELECT b.batsmanID, p.playerName,
                       SUM(b.runsScored) AS runs,
                       SUM(CASE WHEN b.extraType='Retired' THEN 0 ELSE 1 END) AS balls,
                       SUM(CASE WHEN b.runsScored=4 THEN 1 ELSE 0 END) AS fours,
                       SUM(CASE WHEN b.runsScored=6 THEN 1 ELSE 0 END) AS sixes,
                       MAX(CASE WHEN b.dismissedPlayerID=b.batsmanID
                           THEN b.wicketType ELSE NULL END) AS dismissal
                FROM BallByBall b
                JOIN Players p ON b.batsmanID = p.playerID
                WHERE b.matchID=? AND b.inningsNumber=?
                GROUP BY b.batsmanID ORDER BY runs DESC
            ''', (match_id, innings_num)).fetchall()

        def get_bowling(innings_num):
            return conn.execute('''
                SELECT b.bowlerID, p.playerName,
                       SUM(CASE WHEN (b.extraType IS NULL OR b.extraType NOT IN ('Wide','NoBall','Retired'))
                                THEN 1 ELSE 0 END) AS ballsBowled,
                       SUM(b.runsScored+b.extras) AS runsConceded,
                       SUM(CASE WHEN b.wicketFallen=1 AND (b.wicketType IS NULL OR b.wicketType != 'RetiredOut')
                                THEN 1 ELSE 0 END) AS wicketsTaken,
                       SUM(CASE WHEN (b.extraType IS NULL OR b.extraType NOT IN ('Wide','NoBall','Retired'))
                                THEN b.extras ELSE 0 END) AS extras,
                       SUM(CASE WHEN (b.extraType IS NULL OR b.extraType NOT IN ('Wide','NoBall','Retired'))
                                    AND b.wicketFallen=0 AND b.runsScored=0
                                    AND (b.extras=0 OR b.extras IS NULL) THEN 1 ELSE 0 END) AS maidens
                FROM BallByBall b
                JOIN Players p ON b.bowlerID = p.playerID
                WHERE b.matchID=? AND b.inningsNumber=?
                GROUP BY b.bowlerID ORDER BY wicketsTaken DESC
            ''', (match_id, innings_num)).fetchall()

        def get_playing_xi(team_name):
            return conn.execute('''
                SELECT p.playerName, p.playerRole, p.battingStyle, p.bowlingStyle, xi.matchRole
                FROM PlayingXI xi
                JOIN Players p ON xi.playerID = p.playerID
                JOIN Squad s ON p.playerID = s.playerID
                WHERE xi.matchID=? AND s.teamName=?
            ''', (match_id, team_name)).fetchall()

    return jsonify({
        'match':          dict(m),
        'innings1Bat':    [dict(r) for r in get_batting(1)],
        'innings1Bowl':   [dict(r) for r in get_bowling(1)],
        'innings2Bat':    [dict(r) for r in get_batting(2)],
        'innings2Bowl':   [dict(r) for r in get_bowling(2)],
        'team1XI':        [dict(r) for r in get_playing_xi(m['team1Name'])],
        'team2XI':        [dict(r) for r in get_playing_xi(m['team2Name'])],
    })


@app.route('/api/stats/overview', methods=['GET'])
def overview():
    tournament = request.args.get('tournamentName', '').strip()
    m_where = " WHERE tournamentName = ? " if tournament else " WHERE 1=1 "
    b_join = " JOIN Matches m ON BallByBall.matchID = m.matchID " if tournament else ""
    b_where = " WHERE m.tournamentName = ? " if tournament else " WHERE 1=1 "
    
    m_params = (tournament,) if tournament else ()

    with get_db() as conn:
        total_matches  = conn.execute(f'SELECT COUNT(*) AS c FROM Matches {m_where}', m_params).fetchone()['c']
        total_players  = conn.execute('SELECT COUNT(*) AS c FROM Players').fetchone()['c']
        total_teams    = conn.execute('SELECT COUNT(*) AS c FROM Team').fetchone()['c']
        total_runs     = conn.execute(f'SELECT SUM(runsScored+extras) AS c FROM BallByBall {b_join} {b_where}', m_params).fetchone()['c'] or 0
        total_wickets  = conn.execute(f'SELECT SUM(wicketFallen) AS c FROM BallByBall {b_join} {b_where}', m_params).fetchone()['c'] or 0
        total_sixes    = conn.execute(f'SELECT COUNT(*) AS c FROM BallByBall {b_join} {b_where} AND runsScored=6', m_params).fetchone()['c']
        total_fours    = conn.execute(f'SELECT COUNT(*) AS c FROM BallByBall {b_join} {b_where} AND runsScored=4', m_params).fetchone()['c']
    return jsonify({
        'totalMatches':  total_matches,
        'totalPlayers':  total_players,
        'totalTeams':    total_teams,
        'totalRuns':     total_runs,
        'totalWickets':  total_wickets,
        'totalSixes':    total_sixes,
        'totalFours':    total_fours,
    })


@app.route('/api/rankings/teams', methods=['GET'])
def team_rankings():
    format_filter = request.args.get('format', '').strip()
    where_clause = " WHERE m.matchFormat = ? " if format_filter else ""
    params = (format_filter,) if format_filter else ()
    
    with get_db() as conn:
        # Calculate wins
        rows = conn.execute(f'''
            SELECT t.teamName, t.country,
                   COUNT(m.matchID) AS matchesPlayed,
                   SUM(CASE WHEN m.winnerName = t.teamName THEN 1 ELSE 0 END) AS wins
            FROM Team t
            LEFT JOIN Matches m ON (t.teamName = m.team1Name OR t.teamName = m.team2Name)
            {where_clause}
            GROUP BY t.teamName
            ORDER BY wins DESC, matchesPlayed ASC
        ''', params).fetchall()
        return jsonify([dict(r) for r in rows])


@app.route('/api/rankings/players', methods=['GET'])
def player_rankings():
    format_filter = request.args.get('format', '').strip()
    join_clause = " JOIN Matches m ON b.matchID = m.matchID " if format_filter else ""
    where_clause = " WHERE m.matchFormat = ? " if format_filter else ""
    params = (format_filter,) if format_filter else ()
    
    with get_db() as conn:
        rows = conn.execute(f'''
            SELECT p.playerID, p.playerName, p.playerNationality, p.playerRole,
                   SUM(b.runsScored) AS totalRuns,
                   SUM(b.wicketFallen) AS totalWickets
            FROM Players p
            JOIN BallByBall b ON p.playerID = b.batsmanID
            {join_clause}
            {where_clause}
            GROUP BY p.playerID
            ORDER BY totalRuns DESC
            LIMIT 100
        ''', params).fetchall()
        return jsonify([dict(r) for r in rows])

# ─────────────────────────────────────────────────────
# BALL-BY-BALL API
# ─────────────────────────────────────────────────────

@app.route('/api/balls/<int:match_id>', methods=['GET'])
def get_balls(match_id):
    """Return every ball for a match, newest first."""
    innings = request.args.get('innings', type=int)   # optional filter
    with get_db() as conn:
        if innings:
            rows = conn.execute('''
                SELECT b.*, p1.playerName AS batsmanName, p2.playerName AS bowlerName,
                       p3.playerName AS dismissedName
                FROM BallByBall b
                JOIN Players p1 ON b.batsmanID = p1.playerID
                JOIN Players p2 ON b.bowlerID  = p2.playerID
                LEFT JOIN Players p3 ON b.dismissedPlayerID = p3.playerID
                WHERE b.matchID=? AND b.inningsNumber=?
                ORDER BY b.overNumber, b.ballNumber
            ''', (match_id, innings)).fetchall()
        else:
            rows = conn.execute('''
                SELECT b.*, p1.playerName AS batsmanName, p2.playerName AS bowlerName,
                       p3.playerName AS dismissedName
                FROM BallByBall b
                JOIN Players p1 ON b.batsmanID = p1.playerID
                JOIN Players p2 ON b.bowlerID  = p2.playerID
                LEFT JOIN Players p3 ON b.dismissedPlayerID = p3.playerID
                WHERE b.matchID=?
                ORDER BY b.inningsNumber, b.overNumber, b.ballNumber
            ''', (match_id,)).fetchall()
    return jsonify([dict(r) for r in rows])


MAX_OVERS_PER_BOWLER = {'T10': 2, 'T20': 4, 'ODI': 10, 'TEST': None}


@app.route('/api/balls/state/<int:match_id>', methods=['GET'])
def get_ball_state(match_id):
    """Return current match state (over, ball, runs, wickets) to pre-fill the entry form."""
    innings = request.args.get('innings', 1, type=int)
    with get_db() as conn:
        # aggregate per innings — 'Retired' marker rows are not legal deliveries
        agg = conn.execute('''
            SELECT
                SUM(CASE WHEN (extraType IS NULL OR extraType NOT IN ('Wide','NoBall','Retired'))
                         THEN 1 ELSE 0 END)            AS legalBalls,
                SUM(runsScored + extras)                AS totalRuns,
                SUM(wicketFallen)                       AS wickets
            FROM BallByBall WHERE matchID=? AND inningsNumber=?
        ''', (match_id, innings)).fetchone()

        # playing XI for this match (both teams). canBowl includes anyone with a
        # bowling style on record, not just designated Bowlers/AllRounders.
        xi = conn.execute('''
            SELECT px.playerID, p.playerName, p.playerRole, px.teamName,
                   CASE WHEN p.playerRole IN ('Batsman','AllRounder','WicketKeeper') THEN 1 ELSE 0 END AS canBat,
                   CASE WHEN p.playerRole IN ('Bowler','AllRounder')
                        OR (p.bowlingStyle IS NOT NULL AND TRIM(LOWER(p.bowlingStyle)) NOT IN ('', 'none'))
                        THEN 1 ELSE 0 END AS canBowl
            FROM PlayingXI px JOIN Players p ON px.playerID = p.playerID
            WHERE px.matchID=?
            ORDER BY px.rowid
        ''', (match_id,)).fetchall()

        match = conn.execute('SELECT * FROM Matches WHERE matchID=?', (match_id,)).fetchone()

        # Batsmen already dismissed or retired this innings (excluded from new-batter picks)
        dismissed_rows = conn.execute('''
            SELECT DISTINCT dismissedPlayerID FROM BallByBall
            WHERE matchID=? AND inningsNumber=? AND dismissedPlayerID IS NOT NULL
        ''', (match_id, innings)).fetchall()
        dismissed_ids = [r['dismissedPlayerID'] for r in dismissed_rows]

        # Legal balls bowled per bowler this innings, to enforce the ICC max-overs-per-bowler rule
        bowler_rows = conn.execute('''
            SELECT bowlerID,
                   SUM(CASE WHEN (extraType IS NULL OR extraType NOT IN ('Wide','NoBall','Retired'))
                            THEN 1 ELSE 0 END) AS legalBalls
            FROM BallByBall WHERE matchID=? AND inningsNumber=?
            GROUP BY bowlerID
        ''', (match_id, innings)).fetchall()
        bowler_overs = {
            r['bowlerID']: {'overs': r['legalBalls'] // 6, 'balls': r['legalBalls'] % 6, 'legalBalls': r['legalBalls']}
            for r in bowler_rows
        }

        if agg and agg['legalBalls'] is not None:
            legal = int(agg['legalBalls'])
            over = (legal // 6) + 1
            next_ball = (legal % 6) + 1
        else:
            legal     = 0
            over      = 1
            next_ball = 1

        # Bowler of the most recently *completed* over (can't bowl the next one immediately after)
        last_over_bowler_id = None
        if next_ball == 1 and over > 1:
            prev_over_row = conn.execute('''
                SELECT bowlerID FROM BallByBall
                WHERE matchID=? AND inningsNumber=? AND overNumber=?
                ORDER BY ballID DESC LIMIT 1
            ''', (match_id, innings, over - 1)).fetchone()
            if prev_over_row:
                last_over_bowler_id = prev_over_row['bowlerID']

        # Persisted current context (striker / non-striker / bowler). Falls back to the
        # last recorded ball for striker & bowler so pre-existing data still restores.
        state_row = conn.execute('''
            SELECT strikerID, nonStrikerID, bowlerID FROM MatchState
            WHERE matchID=? AND inningsNumber=?
        ''', (match_id, innings)).fetchone()

        striker_id = state_row['strikerID'] if state_row else None
        nonstriker_id = state_row['nonStrikerID'] if state_row else None
        bowler_id = state_row['bowlerID'] if state_row else None

        if striker_id is None or bowler_id is None:
            last_ball = conn.execute('''
                SELECT batsmanID, bowlerID FROM BallByBall
                WHERE matchID=? AND inningsNumber=?
                ORDER BY ballID DESC LIMIT 1
            ''', (match_id, innings)).fetchone()
            if last_ball:
                if striker_id is None:
                    striker_id = last_ball['batsmanID']
                if bowler_id is None:
                    bowler_id = last_ball['bowlerID']

    batting_team = None
    bowling_team = None
    if match:
        toss_winner = match['tossWinnerName']
        toss_decision = match['tossDecision'] # Bat or Bowl
        team1 = match['team1Name']
        team2 = match['team2Name']
        other_team = team2 if toss_winner == team1 else team1

        if toss_decision == 'Bat':
            inn1_bat = toss_winner
            inn1_bowl = other_team
        elif toss_decision == 'Bowl':
            inn1_bat = other_team
            inn1_bowl = toss_winner
        else:
            inn1_bat = team1
            inn1_bowl = team2
            
        if innings == 1:
            batting_team = inn1_bat
            bowling_team = inn1_bowl
        else:
            batting_team = inn1_bowl
            bowling_team = inn1_bat

    max_overs = MAX_OVERS_PER_BOWLER.get(match['matchFormat']) if match else None

    return jsonify({
        'nextOver':          over,
        'nextBall':          next_ball,
        'totalRuns':         agg['totalRuns']  or 0,
        'wickets':           agg['wickets']    or 0,
        'legalBalls':        agg['legalBalls'] or 0,
        'battingTeam':       batting_team,
        'bowlingTeam':       bowling_team,
        'players':           [dict(r) for r in xi],
        'match':             dict(match) if match else {},
        'dismissedPlayerIDs': dismissed_ids,
        'bowlerOvers':       bowler_overs,
        'maxOversPerBowler': max_overs,
        'lastOverBowlerID':  last_over_bowler_id,
        'strikerID':          striker_id,
        'nonStrikerID':       nonstriker_id,
        'bowlerID':           bowler_id,
    })


def save_match_state(conn, match_id, innings, striker_id, nonstriker_id, bowler_id):
    """Upsert the current innings context (striker / non-striker / bowler)."""
    conn.execute('''
        INSERT INTO MatchState (matchID, inningsNumber, strikerID, nonStrikerID, bowlerID)
        VALUES (?,?,?,?,?)
        ON CONFLICT(matchID, inningsNumber) DO UPDATE SET
            strikerID=excluded.strikerID,
            nonStrikerID=excluded.nonStrikerID,
            bowlerID=excluded.bowlerID
    ''', (match_id, innings, striker_id, nonstriker_id, bowler_id))


@app.route('/api/balls/state/<int:match_id>', methods=['PUT'])
@requires_admin
def put_ball_state(match_id):
    """Persist the current innings context (striker / non-striker / bowler)."""
    d = request.get_json(silent=True) or {}
    innings = int(d.get('inningsNumber', 1))
    try:
        with get_db() as conn:
            save_match_state(
                conn, match_id, innings,
                d.get('strikerID'), d.get('nonStrikerID'), d.get('bowlerID')
            )
        return jsonify({'message': 'Context saved'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def enforce_bowler_rules(conn, match_id, innings, match_format, over, ball, bowler):
    """ICC rule checks: no consecutive overs by the same bowler, and a
    per-format cap on the number of overs a single bowler may deliver."""
    if ball != 1 or over <= 1:
        return None

    prev_over_row = conn.execute('''
        SELECT bowlerID FROM BallByBall
        WHERE matchID=? AND inningsNumber=? AND overNumber=?
        ORDER BY ballID DESC LIMIT 1
    ''', (match_id, innings, over - 1)).fetchone()
    if prev_over_row and prev_over_row['bowlerID'] == bowler:
        return 'The same bowler cannot bowl two consecutive overs'

    max_overs = MAX_OVERS_PER_BOWLER.get(match_format)
    if max_overs is not None:
        legal = conn.execute('''
            SELECT SUM(CASE WHEN (extraType IS NULL OR extraType NOT IN ('Wide','NoBall','Retired'))
                            THEN 1 ELSE 0 END) AS legalBalls
            FROM BallByBall WHERE matchID=? AND inningsNumber=? AND bowlerID=?
        ''', (match_id, innings, bowler)).fetchone()['legalBalls'] or 0
        if (legal // 6) >= max_overs:
            return f'Bowler has already bowled the maximum {max_overs} overs allowed in {match_format}'
    return None


@app.route('/api/balls', methods=['POST'])
@requires_admin
def add_ball():
    """Record a single delivery and update match totals."""
    d = request.get_json(silent=True) or {}

    required = ['matchID', 'inningsNumber', 'overNumber', 'ballNumber',
                'batsmanID', 'bowlerID', 'runsScored']
    for f in required:
        if d.get(f) is None:
            return jsonify({'error': f'Missing field: {f}'}), 400

    match_id      = int(d['matchID'])
    innings       = int(d['inningsNumber'])
    over          = int(d['overNumber'])
    ball          = int(d['ballNumber'])
    batsman       = d['batsmanID']
    bowler        = d['bowlerID']
    nonstriker    = d.get('nonStrikerID') or None
    runs          = int(d['runsScored'])
    extras        = int(d.get('extras', 0))
    extra_type    = d.get('extraType') or None       # Wide, NoBall, Bye, LegBye, Penalty, Retired
    wicket        = 1 if d.get('wicketFallen') else 0
    dismissed     = d.get('dismissedPlayerID') or None
    wicket_type   = d.get('wicketType') or None      # Bowled, Caught, LBW, RetiredHurt, ...
    fielder       = d.get('fielderID') or None

    try:
        with get_db() as conn:
            match_row = conn.execute('SELECT matchFormat FROM Matches WHERE matchID=?', (match_id,)).fetchone()
            if not match_row:
                return jsonify({'error': 'Match not found'}), 404

            rule_error = enforce_bowler_rules(conn, match_id, innings, match_row['matchFormat'], over, ball, bowler)
            if rule_error:
                return jsonify({'error': rule_error}), 400

            conn.execute('''
                INSERT INTO BallByBall
                  (matchID, inningsNumber, overNumber, ballNumber,
                   batsmanID, bowlerID, runsScored, extras, extraType,
                   wicketFallen, dismissedPlayerID, wicketType, fielderID)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
            ''', (match_id, innings, over, ball,
                  batsman, bowler, runs, extras, extra_type,
                  wicket, dismissed, wicket_type, fielder))

            # Persist current innings context so it auto-restores on reload
            save_match_state(conn, match_id, innings, batsman, nonstriker, bowler)

            # ── update match score totals ─────────────────────
            total_runs = conn.execute('''
                SELECT COALESCE(SUM(runsScored+extras),0) AS r
                FROM BallByBall WHERE matchID=? AND inningsNumber=?
            ''', (match_id, innings)).fetchone()['r']

            total_wkts = conn.execute('''
                SELECT COALESCE(SUM(wicketFallen),0) AS w
                FROM BallByBall WHERE matchID=? AND inningsNumber=?
            ''', (match_id, innings)).fetchone()['w']

            if innings == 1:
                conn.execute('''
                    UPDATE Matches SET team1TotalRuns=?, team1TotalWickets=? WHERE matchID=?
                ''', (total_runs, total_wkts, match_id))
            else:
                conn.execute('''
                    UPDATE Matches SET team2TotalRuns=?, team2TotalWickets=? WHERE matchID=?
                ''', (total_runs, total_wkts, match_id))

        return jsonify({'message': 'Ball recorded', 'totalRuns': total_runs, 'wickets': total_wkts}), 201

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/balls/<int:ball_id>', methods=['PUT'])
@requires_admin
def update_ball(ball_id):
    """Update a single delivery and update match totals."""
    d = request.get_json(silent=True) or {}

    required = ['matchID', 'inningsNumber', 'overNumber', 'ballNumber',
                'batsmanID', 'bowlerID', 'runsScored']
    for f in required:
        if d.get(f) is None:
            return jsonify({'error': f'Missing field: {f}'}), 400

    match_id      = int(d['matchID'])
    innings       = int(d['inningsNumber'])
    over          = int(d['overNumber'])
    ball          = int(d['ballNumber'])
    batsman       = d['batsmanID']
    bowler        = d['bowlerID']
    runs          = int(d['runsScored'])
    extras        = int(d.get('extras', 0))
    extra_type    = d.get('extraType') or None
    wicket        = 1 if d.get('wicketFallen') else 0
    dismissed     = d.get('dismissedPlayerID') or None
    wicket_type   = d.get('wicketType') or None
    fielder       = d.get('fielderID') or None

    try:
        with get_db() as conn:
            conn.execute('''
                UPDATE BallByBall
                SET batsmanID=?, bowlerID=?, runsScored=?, extras=?, extraType=?,
                    wicketFallen=?, dismissedPlayerID=?, wicketType=?, fielderID=?
                WHERE ballID=?
            ''', (batsman, bowler, runs, extras, extra_type,
                  wicket, dismissed, wicket_type, fielder, ball_id))

            # ── update match score totals ─────────────────────
            total_runs = conn.execute('''
                SELECT COALESCE(SUM(runsScored+extras),0) AS r
                FROM BallByBall WHERE matchID=? AND inningsNumber=?
            ''', (match_id, innings)).fetchone()['r']

            total_wkts = conn.execute('''
                SELECT COALESCE(SUM(wicketFallen),0) AS w
                FROM BallByBall WHERE matchID=? AND inningsNumber=?
            ''', (match_id, innings)).fetchone()['w']

            if innings == 1:
                conn.execute('''
                    UPDATE Matches SET team1TotalRuns=?, team1TotalWickets=? WHERE matchID=?
                ''', (total_runs, total_wkts, match_id))
            else:
                conn.execute('''
                    UPDATE Matches SET team2TotalRuns=?, team2TotalWickets=? WHERE matchID=?
                ''', (total_runs, total_wkts, match_id))

        return jsonify({'message': 'Ball updated', 'totalRuns': total_runs, 'wickets': total_wkts}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/balls/<int:ball_id>', methods=['DELETE'])
@requires_admin
def delete_ball(ball_id):
    """Undo the last ball entry."""
    try:
        with get_db() as conn:
            row = conn.execute('SELECT * FROM BallByBall WHERE ballID=?', (ball_id,)).fetchone()
            if not row:
                return jsonify({'error': 'Ball not found'}), 404
            conn.execute('DELETE FROM BallByBall WHERE ballID=?', (ball_id,))
            # recalc totals
            match_id = row['matchID']
            innings  = row['inningsNumber']
            r = conn.execute('''
                SELECT COALESCE(SUM(runsScored+extras),0) AS r,
                       COALESCE(SUM(wicketFallen),0)       AS w
                FROM BallByBall WHERE matchID=? AND inningsNumber=?
            ''', (match_id, innings)).fetchone()
            if innings == 1:
                conn.execute('UPDATE Matches SET team1TotalRuns=?, team1TotalWickets=? WHERE matchID=?',
                             (r['r'], r['w'], match_id))
            else:
                conn.execute('UPDATE Matches SET team2TotalRuns=?, team2TotalWickets=? WHERE matchID=?',
                             (r['r'], r['w'], match_id))
        return jsonify({'message': 'Ball deleted'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────────────────
# VENUES & UMPIRES
# ─────────────────────────────────────────────────────
@app.route('/api/venues', methods=['GET'])
def get_venues():
    with get_db() as conn:
        rows = conn.execute('SELECT * FROM Venue ORDER BY venueName').fetchall()
    return jsonify([dict(r) for r in rows])


@app.route('/api/umpires', methods=['GET'])
def get_umpires():
    with get_db() as conn:
        rows = conn.execute('SELECT * FROM Umpire ORDER BY umpireName').fetchall()
    return jsonify([dict(r) for r in rows])


# ─────────────────────────────────────────────────────
# AI STATS API
# ─────────────────────────────────────────────────────
@app.route('/api/stats/player', methods=['GET'])
def get_player_stats():
    name = request.args.get('name', '').lower()
    if not name: return jsonify({'error': 'Name required'}), 400
    with get_db() as conn:
        player = conn.execute('SELECT playerID, playerName FROM Players WHERE LOWER(playerName) LIKE ?', (f'%{name}%',)).fetchone()
        if not player: return jsonify({'error': 'Player not found'}), 404
        pid = player['playerID']

        # Recent performances (last 5 matches)
        recent = conn.execute('''
            SELECT m.matchDate, SUM(b.runsScored) as runs
            FROM BallByBall b
            JOIN Matches m ON b.matchID = m.matchID
            WHERE b.batsmanID = ?
            GROUP BY m.matchID
            ORDER BY m.matchDate DESC LIMIT 5
        ''', (pid,)).fetchall()

        # Year by year
        yby = conn.execute('''
            SELECT SUBSTR(m.matchDate, 1, 4) as year, SUM(b.runsScored) as runs
            FROM BallByBall b
            JOIN Matches m ON b.matchID = m.matchID
            WHERE b.batsmanID = ? AND m.matchDate IS NOT NULL
            GROUP BY year
            ORDER BY year ASC
        ''', (pid,)).fetchall()

    return jsonify({
        'player': player['playerName'],
        'recent': [dict(r) for r in recent],
        'yearly': [dict(r) for r in yby]
    })

@app.route('/api/stats/h2h', methods=['GET'])
def get_h2h():
    t1 = request.args.get('team1', '')
    t2 = request.args.get('team2', '')
    if not t1 or not t2: return jsonify({'error': 'Two teams required'}), 400
    with get_db() as conn:
        matches = conn.execute('''
            SELECT winnerName, COUNT(*) as wins
            FROM Matches
            WHERE (team1Name=? AND team2Name=?) OR (team1Name=? AND team2Name=?)
            GROUP BY winnerName
        ''', (t1, t2, t2, t1)).fetchall()
        
    res = {t1: 0, t2: 0, 'draw': 0}
    for m in matches:
        if m['winnerName'] == t1: res[t1] = m['wins']
        elif m['winnerName'] == t2: res[t2] = m['wins']
        else: res['draw'] += m['wins']
    return jsonify(res)

@app.route('/api/stats/player_vs_player', methods=['GET'])
def get_pvp():
    bat = request.args.get('batsman', '').lower()
    bowl = request.args.get('bowler', '').lower()
    with get_db() as conn:
        p1 = conn.execute('SELECT playerID FROM Players WHERE LOWER(playerName) LIKE ?', (f'%{bat}%',)).fetchone()
        p2 = conn.execute('SELECT playerID FROM Players WHERE LOWER(playerName) LIKE ?', (f'%{bowl}%',)).fetchone()
        if not p1 or not p2: return jsonify({'error': 'Players not found'}), 404
        
        stats = conn.execute('''
            SELECT COUNT(*) as balls, SUM(runsScored) as runs, SUM(wicketFallen) as dismissals
            FROM BallByBall
            WHERE batsmanID=? AND bowlerID=?
        ''', (p1['playerID'], p2['playerID'])).fetchone()
        
    return jsonify(dict(stats))

@app.route('/api/stats/player_vs_team', methods=['GET'])
def get_pvt():
    player_name = request.args.get('player', '').lower()
    team = request.args.get('team', '')
    with get_db() as conn:
        p = conn.execute('SELECT playerID FROM Players WHERE LOWER(playerName) LIKE ?', (f'%{player_name}%',)).fetchone()
        if not p: return jsonify({'error': 'Player not found'}), 404
        
        runs = conn.execute('''
            SELECT SUM(b.runsScored) as runs
            FROM BallByBall b JOIN Matches m ON b.matchID=m.matchID
            WHERE b.batsmanID=? AND (m.team1Name=? OR m.team2Name=?)
        ''', (p['playerID'], team, team)).fetchone()['runs'] or 0
        
    return jsonify({'runs': runs, 'team': team})

# ─────────────────────────────────────────────────────
# Match Completion
# ─────────────────────────────────────────────────────
@app.route('/api/matches/<int:match_id>/complete', methods=['PUT'])
@requires_admin
def complete_match(match_id):
    d = request.get_json(silent=True) or {}
    winner = (d.get('winnerName') or '').strip() or None
    margin = (d.get('winMargin') or '').strip() or None
    try:
        with get_db() as conn:
            match = conn.execute('SELECT * FROM Matches WHERE matchID=?', (match_id,)).fetchone()
            if not match:
                return jsonify({'error': 'Match not found'}), 404
            conn.execute('UPDATE Matches SET winnerName=?, winMargin=? WHERE matchID=?',
                         (winner, margin, match_id))
        return jsonify({'message': 'Match completed', 'winnerName': winner, 'winMargin': margin})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ─────────────────────────────────────────────────────
# Tournament Standings
# ─────────────────────────────────────────────────────
@app.route('/api/tournaments/<path:name>/standings', methods=['GET'])
def tournament_standings(name):
    with get_db() as conn:
        teams = conn.execute(
            'SELECT teamName FROM TournamentTeams WHERE tournamentName=?', (name,)
        ).fetchall()
        if not teams:
            return jsonify([])

        team_names = [t['teamName'] for t in teams]
        placeholders = ','.join('?' * len(team_names))
        rows = conn.execute(f'''
            SELECT
                t.teamName,
                COUNT(m.matchID) AS played,
                SUM(CASE WHEN m.winnerName = t.teamName THEN 1 ELSE 0 END) AS wins,
                SUM(CASE WHEN m.winnerName IS NOT NULL AND m.winnerName != t.teamName THEN 1 ELSE 0 END) AS losses,
                SUM(CASE WHEN m.winnerName IS NULL AND
                    (m.team1Name = t.teamName OR m.team2Name = t.teamName) THEN 1 ELSE 0 END) AS noResult,
                SUM(CASE
                    WHEN m.team1Name = t.teamName THEN m.team1TotalRuns
                    WHEN m.team2Name = t.teamName THEN m.team2TotalRuns
                    ELSE 0
                END) AS runsScored,
                SUM(CASE
                    WHEN m.team1Name = t.teamName THEN m.team1TotalWickets
                    WHEN m.team2Name = t.teamName THEN m.team2TotalWickets
                    ELSE 0
                END) AS wicketsLost,
                SUM(CASE
                    WHEN m.team1Name = t.teamName THEN COALESCE(m.team2TotalRuns, 0)
                    WHEN m.team2Name = t.teamName THEN COALESCE(m.team1TotalRuns, 0)
                    ELSE 0
                END) AS runsConceded
            FROM Team t
            LEFT JOIN Matches m ON (t.teamName = m.team1Name OR t.teamName = m.team2Name)
            WHERE t.teamName IN ({placeholders})
            GROUP BY t.teamName
            ORDER BY wins DESC, runsScored DESC
        ''', team_names).fetchall()

        result = []
        for i, r in enumerate(rows):
            d = dict(r)
            d['rank'] = i + 1
            d['points'] = (d['wins'] or 0) * 2
            d['nrr'] = 0.0
            if d['runsScored'] and d['runsConceded']:
                d['nrr'] = round(((d['runsScored'] or 0) - (d['runsConceded'] or 0)) / max(d['played'] or 1, 1), 2)
            result.append(d)
        return jsonify(result)

# ─────────────────────────────────────────────────────
# Player Stats (all players with aggregate stats)
# ─────────────────────────────────────────────────────
@app.route('/api/players/stats', methods=['GET'])
def all_player_stats():
    with get_db() as conn:
        rows = conn.execute('''
            SELECT
                p.playerID, p.playerName, p.playerDOB, p.playerNationality,
                p.battingStyle, p.bowlingStyle, p.playerRole,
                COALESCE(bat.runs, 0) AS totalRuns,
                COALESCE(bat.balls, 0) AS ballsFaced,
                COALESCE(bat.fours, 0) AS fours,
                COALESCE(bat.sixes, 0) AS sixes,
                COALESCE(bat.dismissals, 0) AS dismissals,
                COALESCE(bowl.balls, 0) AS ballsBowled,
                COALESCE(bowl.runsConceded, 0) AS runsConceded,
                COALESCE(bowl.wickets, 0) AS totalWickets,
                COALESCE(bowl.maidens, 0) AS maidens,
                COALESCE(m.played, 0) AS matchesPlayed,
                COALESCE(t.teamName, '') AS teamName
            FROM Players p
            LEFT JOIN (
                SELECT batsmanID,
                       SUM(runsScored) AS runs,
                       COUNT(*) AS balls,
                       SUM(CASE WHEN runsScored=4 THEN 1 ELSE 0 END) AS fours,
                       SUM(CASE WHEN runsScored=6 THEN 1 ELSE 0 END) AS sixes,
                       SUM(wicketFallen) AS dismissals
                FROM BallByBall GROUP BY batsmanID
            ) bat ON p.playerID = bat.batsmanID
            LEFT JOIN (
                SELECT bowlerID,
                       SUM(CASE WHEN (extraType IS NULL OR extraType NOT IN ('Wide','NoBall','Retired'))
                                THEN 1 ELSE 0 END) AS balls,
                       SUM(runsScored+extras) AS runsConceded,
                       SUM(wicketFallen) AS wickets,
                       SUM(CASE WHEN (extraType IS NULL OR extraType NOT IN ('Wide','NoBall','Retired'))
                                    AND wicketFallen=0 AND runsScored=0 AND (extras=0 OR extras IS NULL)
                                THEN 1 ELSE 0 END) AS maidens
                FROM BallByBall GROUP BY bowlerID
            ) bowl ON p.playerID = bowl.bowlerID
            LEFT JOIN (
                SELECT playerID, COUNT(DISTINCT matchID) AS played
                FROM PlayingXI GROUP BY playerID
            ) m ON p.playerID = m.playerID
            LEFT JOIN PlayingXI pi ON p.playerID = pi.playerID
            LEFT JOIN Team t ON pi.teamName = t.teamName
            GROUP BY p.playerID
            ORDER BY totalRuns DESC
        ''').fetchall()
        return jsonify([dict(r) for r in rows])

# ─────────────────────────────────────────────────────
# Error Handlers
# ─────────────────────────────────────────────────────
@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def server_error(e):
    app.logger.exception('Unhandled server error')
    return jsonify({'error': 'Internal server error'}), 500


# ─────────────────────────────────────────────────────
# Entry Point
# ─────────────────────────────────────────────────────
if __name__ == '__main__':
    init_db()
    sep = '-' * 52
    print(f'\n{sep}')
    print('  CricketStats Pro  --  Flask / SQLite')
    print(sep)
    print('  Open:     http://localhost:5001')
    print(f'  Database: {DB_PATH}')
    print(f'{sep}\n')
    app.run(debug=False, host='0.0.0.0', port=5001)
