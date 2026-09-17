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
        user = conn.execute('SELECT * FROM users WHERE token = ?', (token,)).fetchone()
        if not user:
            return None
        # Expire stale tokens when tokenCreated is present
        keys = user.keys()
        if 'tokenCreated' in keys and user['tokenCreated']:
            try:
                # stored as unix timestamp string/int
                created = int(float(user['tokenCreated']))
                if TOKEN_TTL_SECONDS > 0 and (time.time() - created) > TOKEN_TTL_SECONDS:
                    conn.execute('UPDATE users SET token=NULL, tokenCreated=NULL WHERE id=?', (user['id'],))
                    return None
            except (TypeError, ValueError):
                pass
        return user


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

# Server-side only — never expose in HTML/JS.
# Production: set CRICKET_ADMIN_KEY. Dev fallback only when CRICKET_ALLOW_DEV_ADMIN_KEY=1.
_ADMIN_KEY_DEV_FALLBACK = 'CRICKET_ADMIN_2026'
TOKEN_TTL_SECONDS = int(os.environ.get('CRICKET_TOKEN_TTL_SECONDS', str(7 * 24 * 3600)))  # 7 days
ALLOW_DB_RESET = os.environ.get('CRICKET_ALLOW_DB_RESET', '').strip() in ('1', 'true', 'TRUE', 'yes')

app = Flask(__name__, static_folder=BASE_DIR, static_url_path='')


def get_admin_registration_key():
    """Return the master admin registration key (env var preferred)."""
    env_key = (os.environ.get('CRICKET_ADMIN_KEY') or '').strip()
    if env_key:
        return env_key
    allow_dev = os.environ.get('CRICKET_ALLOW_DEV_ADMIN_KEY', '').strip() in ('1', 'true', 'TRUE', 'yes')
    # Also allow fallback when running the built-in server in local debug-ish setups
    if allow_dev or os.environ.get('FLASK_DEBUG', '').strip() in ('1', 'true', 'TRUE'):
        return _ADMIN_KEY_DEV_FALLBACK
    return ''


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
                playerRole        TEXT CHECK(playerRole IN ('Batsman','Bowler','AllRounder','WicketKeeper')),
                battingOrder      TEXT DEFAULT 'Middle Order' CHECK(battingOrder IN ('Top Order','Middle Order','Lower Order','Tail'))
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
                matchType          TEXT NOT NULL CHECK(matchType IN (
                                        'League','Group-Stage','Semi-Final','Final','Play-off',
                                        'Quarter-Final','Qualifier-1','Qualifier-2','Eliminator',
                                        '3rd-Place-SF','SF-1','SF-2','SF-Final','1st-Place-Match','2nd-Place-PO')),
                isDayNight         INTEGER DEFAULT 0,
                team1Name          TEXT NOT NULL,
                team2Name          TEXT NOT NULL,
                venueID            INTEGER,
                matchDate          TEXT,
                winnerName         TEXT,
                tossWinnerName     TEXT,
                tossDecision       TEXT,
                winMargin          TEXT,
                onFieldUmpire1ID   INTEGER,
                onFieldUmpire2ID   INTEGER,
                thirdUmpireID      INTEGER,
                team1TotalRuns     INTEGER DEFAULT 0,
                team1TotalWickets  INTEGER DEFAULT 0,
                team2TotalRuns     INTEGER DEFAULT 0,
                team2TotalWickets  INTEGER DEFAULT 0,
                status             TEXT DEFAULT 'Completed',
                matchStatus        TEXT DEFAULT 'live',
                team1TotalOvers    REAL DEFAULT 0,
                team2TotalOvers    REAL DEFAULT 0,
                matchGroup         TEXT DEFAULT NULL,
                sequenceNumber     INTEGER DEFAULT 0,
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
                teamName  TEXT,
                PRIMARY KEY (matchID, playerID),
                FOREIGN KEY (matchID)  REFERENCES Matches(matchID),
                FOREIGN KEY (playerID) REFERENCES Players(playerID),
                FOREIGN KEY (teamName) REFERENCES Team(teamName)
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
            # live | innings_break | super_over | completed
            conn.execute("ALTER TABLE Matches ADD COLUMN matchStatus TEXT DEFAULT 'live'")
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
                    freeHitPending INTEGER DEFAULT 0,
                    PRIMARY KEY (matchID, inningsNumber),
                    FOREIGN KEY (matchID) REFERENCES Matches(matchID)
                )
            ''')
        except sqlite3.OperationalError:
            pass # table already exists

        try:
            conn.execute('ALTER TABLE users ADD COLUMN tokenCreated TEXT')
        except sqlite3.OperationalError:
            pass

        try:
            conn.execute('ALTER TABLE MatchState ADD COLUMN freeHitPending INTEGER DEFAULT 0')
        except sqlite3.OperationalError:
            pass

        # ── Tournament Scheduling & Match Activation migrations ──
        try:
            conn.execute("ALTER TABLE Tournament ADD COLUMN tournamentType TEXT DEFAULT 'Tournament'")
        except sqlite3.OperationalError:
            pass

        try:
            conn.execute("ALTER TABLE Tournament ADD COLUMN status TEXT DEFAULT 'Running'")
        except sqlite3.OperationalError:
            pass

        # Match lifecycle status: Scheduled | Live | Completed
        try:
            conn.execute("ALTER TABLE Matches ADD COLUMN status TEXT DEFAULT 'Completed'")
        except sqlite3.OperationalError:
            pass

        try:
            conn.execute("ALTER TABLE Matches ADD COLUMN team1TotalOvers REAL DEFAULT 0")
        except sqlite3.OperationalError:
            pass

        try:
            conn.execute("ALTER TABLE Matches ADD COLUMN team2TotalOvers REAL DEFAULT 0")
        except sqlite3.OperationalError:
            pass

        # Group / pool label for a match (e.g. 'Group A', 'Pool B', 'SF-1')
        try:
            conn.execute("ALTER TABLE Matches ADD COLUMN matchGroup TEXT DEFAULT NULL")
        except sqlite3.OperationalError:
            pass

        # Ordering of a match within its tournament (schedule sequence)
        try:
            conn.execute("ALTER TABLE Matches ADD COLUMN sequenceNumber INTEGER DEFAULT 0")
        except sqlite3.OperationalError:
            pass

        # Exact schedule format code chosen (e.g. 'tri-1', 'quad-cup', 'tournament-pool-2')
        try:
            conn.execute("ALTER TABLE Tournament ADD COLUMN scheduleFormat TEXT DEFAULT NULL")
        except sqlite3.OperationalError:
            pass

        # Free-text qualification rules shown on the tournament dashboard
        try:
            conn.execute("ALTER TABLE Tournament ADD COLUMN qualificationRules TEXT DEFAULT NULL")
        except sqlite3.OperationalError:
            pass

        # Placeholder team so knockout fixtures can hold 'TBD' slots while
        # foreign keys stay enforced (winners overwrite these on advance).
        try:
            conn.execute(
                "INSERT OR IGNORE INTO Team (teamName, country, headCoach, teamCaptain, ranking) "
                "VALUES ('TBD','TBD',NULL,NULL,999)"
            )
        except sqlite3.OperationalError:
            pass

        # Batting order band for player categorization (Top Order / Middle Order / Lower Order / Tail)
        try:
            conn.execute("ALTER TABLE Players ADD COLUMN battingOrder TEXT DEFAULT 'Middle Order'")
        except sqlite3.OperationalError:
            pass

        # Backfill battingOrder for existing players who still have the default
        try:
            import seed_data as _sd
            _bom = {}
            for row in getattr(_sd, 'players', []) or []:
                if len(row) >= 8:
                    _bom[row[1]] = row[7]
            if _bom:
                for name, band in _bom.items():
                    conn.execute("UPDATE Players SET battingOrder=? WHERE playerName=? AND (battingOrder IS NULL OR battingOrder='Middle Order')", (band, name))
                conn.commit()
        except Exception:
            pass

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
def _resolve_registration_role(admin_key_submitted):
    """Default to 'user'; promote to 'admin' only when the backend key matches."""
    if not admin_key_submitted:
        return 'user', 0

    expected = get_admin_registration_key()
    if admin_key_submitted != expected:
        return None, None  # caller returns 403

    return 'admin', 1


def register_user(data):
    """Unified registration handler for user and admin sign-ups."""
    fullname = (data.get('fullname') or '').strip()
    email    = (data.get('email')    or '').strip().lower()
    password = (data.get('password') or '').strip()
    admin_key = (
        (data.get('adminKey') or data.get('admin_token') or '')
        .strip()
    )

    if not fullname or not email or not password:
        return jsonify({'error': 'All fields are required'}), 400
    if '@' not in email:
        return jsonify({'error': 'Please enter a valid email address'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400

    role, is_admin = _resolve_registration_role(admin_key)
    if role is None:
        return jsonify({'error': 'Invalid admin registration key'}), 403

    session_token = secrets.token_hex(32)
    hashed_password = generate_password_hash(password)

    try:
        with get_db() as conn:
            conn.execute(
                'INSERT INTO users (fullname, email, password, isAdmin, token, tokenCreated) VALUES (?, ?, ?, ?, ?, ?)',
                (fullname, email, hashed_password, is_admin, session_token, str(int(time.time())))
            )
        return jsonify({
            'message': 'Account created successfully',
            'user': {
                'fullname': fullname,
                'email': email,
                'role': role,
                'isAdmin': bool(is_admin),
                'token': session_token,
            },
        }), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Email already registered. Please log in instead.'}), 400


@app.route('/api/register', methods=['POST'])
def register():
    """Unified registration endpoint — role defaults to user unless a valid admin key is supplied."""
    data = request.get_json(silent=True) or {}
    return register_user(data)


@app.route('/api/signup', methods=['POST'])
def signup():
    """Backward-compatible alias for /api/register."""
    data = request.get_json(silent=True) or {}
    return register_user(data)


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
        token_created = str(int(time.time()))
        updates = {'token': token, 'tokenCreated': token_created}
        if not is_hashed(user['password']):
            # Self-heal legacy plaintext passwords into hashed ones
            updates['password'] = generate_password_hash(password)

        if 'password' in updates:
            conn.execute('UPDATE users SET token=?, tokenCreated=?, password=? WHERE id=?',
                         (updates['token'], updates['tokenCreated'], updates['password'], user['id']))
        else:
            conn.execute('UPDATE users SET token=?, tokenCreated=? WHERE id=?',
                         (updates['token'], updates['tokenCreated'], user['id']))

    is_admin = bool(user['isAdmin']) if 'isAdmin' in user.keys() else False
    return jsonify({
        'user': {
            'fullname': user['fullname'],
            'email': user['email'],
            'role': 'admin' if is_admin else 'user',
            'isAdmin': is_admin,
            'token': token,
        },
    })


import seed_data

# ─────────────────────────────────────────────────────
# SEED API — Populates all data from the SQL schema
# ─────────────────────────────────────────────────────
@app.route('/api/dev/reset', methods=['POST'])
@requires_admin
def reset_db_api():
    if not ALLOW_DB_RESET:
        return jsonify({
            'error': 'DB reset disabled. Set CRICKET_ALLOW_DB_RESET=1 to enable (dev only).'
        }), 403
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
    """Seed core reference data. Missing seed_data attributes are skipped safely.

    Open only for true first-run bootstrap (empty Players table). After that,
    admin auth is required so random clients cannot re-trigger seed logic.
    """
    with get_db() as conn:
        existing = conn.execute('SELECT COUNT(*) as c FROM Players').fetchone()
        if existing['c'] > 0:
            user = get_current_user()
            if not user or not user['isAdmin']:
                return jsonify({'message': 'Database already seeded', 'players': existing['c']}), 200
            return jsonify({'message': 'Database already seeded', 'players': existing['c']}), 200
        # First-run bootstrap — no auth required so the dashboard can self-seed.

        inserted = {}

        def _many(label, sql, rows):
            if not rows:
                inserted[label] = 0
                return
            conn.executemany(sql, rows)
            inserted[label] = len(rows)

        _many('teams', 'INSERT OR IGNORE INTO Team VALUES (?,?,?,?,?)', getattr(seed_data, 'teams', []) or [])
        _many('tournaments',
              'INSERT OR IGNORE INTO Tournament (tournamentName, format, totalTeams, overs) VALUES (?,?,?,?)', [
            ('ICC Champions Trophy', 'T10', 8, 10),
            ('World Cup 2027', 'ODI', 14, 50),
        ])
        _many('players', 'INSERT OR IGNORE INTO Players (playerID, playerName, playerDOB, playerNationality, battingStyle, bowlingStyle, playerRole, battingOrder) VALUES (?,?,?,?,?,?,?,?)', getattr(seed_data, 'players', []) or [])

        # Backfill battingOrder for any existing seed players missing it
        try:
            for row in getattr(seed_data, 'players', []) or []:
                if len(row) >= 8:
                    conn.execute("UPDATE Players SET battingOrder=? WHERE playerID=? AND (battingOrder IS NULL OR battingOrder='Middle Order')", (row[7], row[0]))
            conn.commit()
        except Exception:
            pass

        venues = getattr(seed_data, 'venues', None)
        if not venues:
            venues = [
                (1, 'Gaddafi Stadium', 'Lahore', 'Pakistan', 27000),
                (2, 'Melbourne Cricket Ground', 'Melbourne', 'Australia', 100024),
                (3, 'Lords', 'London', 'England', 31100),
                (4, 'Wankhede Stadium', 'Mumbai', 'India', 33108),
                (5, 'Eden Gardens', 'Kolkata', 'India', 68000),
            ]
            inserted['venues_fallback'] = True
        _many('venues', 'INSERT OR IGNORE INTO Venue VALUES (?,?,?,?,?)', venues)

        umpires = getattr(seed_data, 'umpires', None)
        if not umpires:
            umpires = [
                (1, 'Aleem Dar', 'Pakistan', 400),
                (2, 'Kumar Dharmasena', 'Sri Lanka', 350),
                (3, 'Richard Kettleborough', 'England', 280),
                (4, 'Nitin Menon', 'India', 200),
                (5, 'Marais Erasmus', 'South Africa', 310),
            ]
            inserted['umpires_fallback'] = True
        _many('umpires', 'INSERT OR IGNORE INTO Umpire VALUES (?,?,?,?)', umpires)

        _many('squads', 'INSERT OR IGNORE INTO Squad VALUES (?,?)', getattr(seed_data, 'squads', []) or [])

    return jsonify({'message': 'Database seeded successfully!', 'inserted': inserted}), 201





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
    band  = (d.get('battingOrder')      or '').strip()
    tname = (d.get('teamName')          or '').strip()

    if not all([name, dob, nat, role, tname]):
        return jsonify({'error': 'All fields and teamName are required'}), 400
    if band and band not in ('Top Order', 'Middle Order', 'Lower Order', 'Tail'):
        band = 'Middle Order'
    if not band:
        band = 'Middle Order'

    import uuid
    pid = "P" + str(uuid.uuid4())[:8].upper()

    try:
        with get_db() as conn:
            # Check if team exists
            team = conn.execute('SELECT 1 FROM Team WHERE teamName=?', (tname,)).fetchone()
            if not team: return jsonify({'error': 'Team not found'}), 404

            conn.execute('INSERT INTO Players (playerID, playerName, playerDOB, playerNationality, battingStyle, bowlingStyle, playerRole, battingOrder) VALUES (?,?,?,?,?,?,?,?)', (pid, name, dob, nat, bat, bowl, role, band))
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
    band  = (d.get('battingOrder')      or '').strip() or 'Middle Order'

    if band not in ('Top Order', 'Middle Order', 'Lower Order', 'Tail'):
        band = 'Middle Order'

    if not all([pid, name, dob, nat, role]):
        return jsonify({'error': 'playerID, playerName, playerDOB, playerNationality, playerRole are required'}), 400

    try:
        with get_db() as conn:
            conn.execute('INSERT INTO Players (playerID, playerName, playerDOB, playerNationality, battingStyle, bowlingStyle, playerRole, battingOrder) VALUES (?,?,?,?,?,?,?,?)', (pid, name, dob, nat, bat, bowl, role, band))
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
        band  = d.get('battingOrder',      existing['battingOrder'] if 'battingOrder' in existing.keys() else 'Middle Order') or 'Middle Order'
        if band not in ('Top Order', 'Middle Order', 'Lower Order', 'Tail'):
            band = 'Middle Order'
        conn.execute('''UPDATE Players SET playerName=?,playerDOB=?,playerNationality=?,
            battingStyle=?,bowlingStyle=?,playerRole=?,battingOrder=? WHERE playerID=?''',
            (name, dob, nat, bat, bowl, role, band, player_id))
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
    tname  = request.args.get('tournamentName', '').strip()
    status = request.args.get('status', '').strip()          # Scheduled | Live | Completed
    exclude_status = request.args.get('exclude', '').strip() # e.g. exclude=Scheduled
    query  = 'SELECT * FROM Matches WHERE 1=1'
    params = []
    if fmt:
        query += ' AND matchFormat=?'; params.append(fmt)
    if mtype:
        query += ' AND matchType=?'; params.append(mtype)
    if tname:
        query += ' AND tournamentName=?'; params.append(tname)
    if status:
        query += ' AND status=?'; params.append(status)
    if exclude_status:
        query += ' AND (status != ? OR status IS NULL)'; params.append(exclude_status)
    query += ' ORDER BY matchDate ASC, matchID ASC'

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
    try:
        with get_db() as conn:
            conn.execute('DELETE FROM BallByBall WHERE matchID=?', (match_id,))
            conn.execute('DELETE FROM PlayingXI  WHERE matchID=?', (match_id,))
            conn.execute('DELETE FROM MatchState WHERE matchID=?', (match_id,))
            r = conn.execute('DELETE FROM Matches WHERE matchID=?', (match_id,))
            if r.rowcount == 0:
                return jsonify({'error': 'Match not found'}), 404
        return jsonify({'message': 'Match deleted'})
    except Exception as e:
        print(f'DELETE MATCH ERROR: {e}')
        return jsonify({'error': str(e)}), 500


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
            name = d['tournamentName']
            teams = conn.execute(
                'SELECT teamName FROM TournamentTeams WHERE tournamentName=?',
                (name,)).fetchall()
            d['teams'] = [t['teamName'] for t in teams]
            mstats = conn.execute(
                "SELECT COUNT(*) AS totalMatches, "
                "SUM(CASE WHEN winnerName IS NOT NULL AND TRIM(winnerName) != '' THEN 1 ELSE 0 END) AS completedMatches, "
                "SUM(CASE WHEN COALESCE(matchStatus,'') = 'live' OR winnerName IS NULL OR TRIM(COALESCE(winnerName,'')) = '' THEN 1 ELSE 0 END) AS liveMatches, "
                "MIN(matchDate) AS startDate, MAX(matchDate) AS endDate "
                "FROM Matches WHERE tournamentName=?",
                (name,)).fetchone()
            total_m = int(mstats['totalMatches'] or 0)
            done_m = int(mstats['completedMatches'] or 0)
            live_m = int(mstats['liveMatches'] or 0)
            d['totalMatches'] = total_m
            d['completedMatches'] = done_m
            d['liveMatches'] = live_m
            d['startDate'] = mstats['startDate']
            d['endDate'] = mstats['endDate']
            if total_m == 0:
                d['status'] = 'upcoming'
            elif done_m >= total_m:
                d['status'] = 'completed'
            else:
                d['status'] = 'running'
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


# ─────────────────────────────────────────────────────────────────────
# Schedule generation helpers + Tournament wizard endpoints
# ─────────────────────────────────────────────────────────────────────
def _fx(t1, t2, mtype, seq, group=None):
    """Build one fixture dict."""
    return {'team1Name': t1, 'team2Name': t2, 'matchType': mtype,
            'matchGroup': group, 'matchDate': 'TBD', 'sequenceNumber': seq}


def _round_robin_pairs(teams, double=False):
    """Return list of (team1, team2) pairs for a single or double round robin."""
    pairs = [(teams[i], teams[j]) for i in range(len(teams)) for j in range(i + 1, len(teams))]
    if double:
        pairs = pairs + [(b, a) for a, b in pairs]
    return pairs


def _full_round_robin(teams, double=False, group=None, start_seq=1):
    """Group-Stage fixtures for a full round robin among `teams`."""
    fixtures = []
    seq = start_seq
    for t1, t2 in _round_robin_pairs(teams, double):
        fixtures.append(_fx(t1, t2, 'Group-Stage', seq, group))
        seq += 1
    return fixtures


def generate_round_robin(teams, intensity='limited', match_type='Group-Stage'):
    """Legacy generator kept for backward compatibility.
    intensity: 'limited' (single RR), 'moderate' (double RR),
               'max' (double RR + Semi-Finals + Final)."""
    double = intensity in ('moderate', 'max')
    fixtures = _full_round_robin(teams, double)
    seq = len(fixtures) + 1
    if intensity == 'max':
        if len(teams) >= 4:
            fixtures.append(_fx('TBD', 'TBD', 'Semi-Final', seq)); seq += 1
            fixtures.append(_fx('TBD', 'TBD', 'Semi-Final', seq)); seq += 1
        fixtures.append(_fx('TBD', 'TBD', 'Final', seq))
    return fixtures


def generate_bilateral_schedule(teams, num_matches, match_format='T20'):
    """For a 2-team series: alternate home/away order, all League matches."""
    fixtures = []
    if len(teams) < 2:
        return fixtures
    for i in range(max(1, int(num_matches or 1))):
        t1, t2 = (teams[0], teams[1]) if i % 2 == 0 else (teams[1], teams[0])
        fixtures.append(_fx(t1, t2, 'League', i + 1))
    return fixtures


# ── Tri-Series (3 teams) ────────────────────────────────────────────────
def generate_tri_format1(teams):
    """Single round robin (3 matches) + Final."""
    fixtures = _full_round_robin(teams[:3], double=False, group='Group')
    fixtures.append(_fx('TBD', 'TBD', 'Final', len(fixtures) + 1))
    return fixtures


def generate_tri_format2(teams):
    """Double round robin (6 matches) + Final."""
    fixtures = _full_round_robin(teams[:3], double=True, group='Group')
    fixtures.append(_fx('TBD', 'TBD', 'Final', len(fixtures) + 1))
    return fixtures


# ── Quad-Series (4 teams) ───────────────────────────────────────────────
def generate_quad_format1(teams):
    """'Cup' knockout: 2 semis + play-off + final (5 matches)."""
    import random
    t = teams[:4]
    random.shuffle(t)
    return [
        _fx(t[0], t[1], 'SF-1', 1, 'Round 1'),
        _fx(t[2], t[3], 'SF-2', 2, 'Round 1'),
        _fx('TBD', 'TBD', '3rd-Place-SF', 3, 'Round 2'),
        _fx('TBD', 'TBD', 'SF-Final', 4, 'Round 2'),
        _fx('TBD', 'TBD', 'Final', 5),
    ]


def generate_quad_format2(teams, double=False):
    """Round robin + top-2 Final."""
    fixtures = _full_round_robin(teams[:4], double, group='Group')
    fixtures.append(_fx('TBD', 'TBD', 'Final', len(fixtures) + 1))
    return fixtures


def generate_quad_format3(teams, double=False):
    """Round robin + (2nd v 3rd) Play-off + Final."""
    fixtures = _full_round_robin(teams[:4], double, group='Group')
    seq = len(fixtures) + 1
    fixtures.append(_fx('TBD', 'TBD', 'Play-off', seq))
    fixtures.append(_fx('TBD', 'TBD', 'Final', seq + 1))
    return fixtures


# ── Tournament (5+ teams) single group ──────────────────────────────────
def generate_tournament_odd_f1(teams, double=False):
    """Round robin + Top-2 Final."""
    fixtures = _full_round_robin(teams, double, group='Group')
    fixtures.append(_fx('TBD', 'TBD', 'Final', len(fixtures) + 1))
    return fixtures


def generate_tournament_odd_f2(teams, double=False):
    """Round robin + (2nd v 3rd) Play-off + Final."""
    fixtures = _full_round_robin(teams, double, group='Group')
    seq = len(fixtures) + 1
    fixtures.append(_fx('TBD', 'TBD', 'Play-off', seq))
    fixtures.append(_fx('TBD', 'TBD', 'Final', seq + 1))
    return fixtures


def generate_tournament_odd_f3(teams, double=False):
    """Round robin + IPL-style playoffs (Q1, Eliminator, Q2, Final)."""
    fixtures = _full_round_robin(teams, double, group='Group')
    seq = len(fixtures) + 1
    for mtype in ('Qualifier-1', 'Eliminator', 'Qualifier-2', 'Final'):
        fixtures.append(_fx('TBD', 'TBD', mtype, seq)); seq += 1
    return fixtures


# ── Tournament (even teams) pool formats ────────────────────────────────
def _pool_group_stage(pool_a, pool_b, double=False):
    fixtures = []
    seq = 1
    for pool, label in ((pool_a, 'Pool A'), (pool_b, 'Pool B')):
        for t1, t2 in _round_robin_pairs(pool, double):
            fixtures.append(_fx(t1, t2, 'Group-Stage', seq, label)); seq += 1
    return fixtures


def generate_pool_format1(pool_a, pool_b, double=False):
    """Pool winners meet in the Final."""
    fixtures = _pool_group_stage(pool_a, pool_b, double)
    fixtures.append(_fx('TBD', 'TBD', 'Final', len(fixtures) + 1))
    return fixtures


def generate_pool_format2(pool_a, pool_b, double=False):
    """Cross-pool Semi-Finals + Final."""
    fixtures = _pool_group_stage(pool_a, pool_b, double)
    seq = len(fixtures) + 1
    fixtures.append(_fx('TBD', 'TBD', 'Semi-Final', seq, 'SF-1'))
    fixtures.append(_fx('TBD', 'TBD', 'Semi-Final', seq + 1, 'SF-2'))
    fixtures.append(_fx('TBD', 'TBD', 'Final', seq + 2))
    return fixtures


def generate_pool_format3(pool_a, pool_b, double=False):
    """Champions-Trophy style: 1st-place match + 2nd-place play-off + Final."""
    fixtures = _pool_group_stage(pool_a, pool_b, double)
    seq = len(fixtures) + 1
    fixtures.append(_fx('TBD', 'TBD', '1st-Place-Match', seq))
    fixtures.append(_fx('TBD', 'TBD', '2nd-Place-PO', seq + 1))
    fixtures.append(_fx('TBD', 'TBD', 'Final', seq + 2))
    return fixtures


def _split_pools(teams, pool_a=None, pool_b=None):
    """Return (pool_a, pool_b). If not supplied, alternate teams into two pools."""
    if pool_a and pool_b:
        return pool_a, pool_b
    a = [t for i, t in enumerate(teams) if i % 2 == 0]
    b = [t for i, t in enumerate(teams) if i % 2 == 1]
    return a, b


def build_fixtures(t_type, teams, schedule_fmt='', num_matches=3,
                   double=False, pool_a=None, pool_b=None, match_format='T20'):
    """Route to the correct generator based on tournament type + schedule format code.
    Returns (fixtures, error)."""
    if t_type == 'Bilateral':
        return generate_bilateral_schedule(teams, num_matches, match_format), None
    if t_type == 'Tri':
        if schedule_fmt == 'tri-2':
            return generate_tri_format2(teams), None
        return generate_tri_format1(teams), None
    if t_type == 'Quad':
        if schedule_fmt == 'quad-cup':
            return generate_quad_format1(teams), None
        if schedule_fmt == 'quad-rr-playoff':
            return generate_quad_format3(teams, double), None
        return generate_quad_format2(teams, double), None
    if t_type == 'Tournament':
        if schedule_fmt and 'pool' in schedule_fmt:
            a, b = _split_pools(teams, pool_a, pool_b)
            if schedule_fmt == 'tournament-pool-2':
                return generate_pool_format2(a, b, double), None
            if schedule_fmt == 'tournament-pool-3':
                return generate_pool_format3(a, b, double), None
            return generate_pool_format1(a, b, double), None
        if schedule_fmt == 'tournament-odd-2':
            return generate_tournament_odd_f2(teams, double), None
        if schedule_fmt == 'tournament-odd-3':
            return generate_tournament_odd_f3(teams, double), None
        if schedule_fmt == 'tournament-rr':
            return _full_round_robin(teams, double, group='Group'), None
        return generate_tournament_odd_f1(teams, double), None
    return [], 'Unknown tournament type'


@app.route('/api/tournaments/preview-schedule', methods=['POST'])
@requires_admin
def preview_schedule():
    """Return generated fixtures for frontend review without saving anything."""
    data = request.get_json(silent=True) or {}
    teams = data.get('teams', [])
    t_type = data.get('tournamentType', 'Tournament')
    schedule_fmt = data.get('scheduleFormat', '')
    num_matches = data.get('numMatches', 3)
    double = bool(data.get('doubleRoundRobin', False))
    pool_a = data.get('poolA') or None
    pool_b = data.get('poolB') or None

    if len(teams) < 2:
        return jsonify({'error': 'At least 2 teams required'}), 400

    # Backward-compat: map legacy 'intensity' to a schedule format code
    if not schedule_fmt and t_type not in ('Bilateral',):
        intensity = data.get('intensity', 'limited')
        double = double or intensity in ('moderate', 'max')
        schedule_fmt = 'tournament-rr' if intensity != 'max' else 'tournament-odd-1'

    fixtures, err = build_fixtures(
        t_type, teams, schedule_fmt, num_matches, double, pool_a, pool_b,
        data.get('format', 'T20'))
    if err:
        return jsonify({'error': err}), 400

    return jsonify({
        'fixtures': fixtures,
        'total': len(fixtures),
        'groupStage': sum(1 for f in fixtures if f['matchType'] in ('Group-Stage', 'League')),
        'knockouts': sum(1 for f in fixtures if f['matchType'] not in ('Group-Stage', 'League')),
    }), 200


@app.route('/api/tournaments/generate', methods=['POST'])
@requires_admin
def generate_tournament():
    """Create a tournament, its teams, scheduled fixtures and squads atomically."""
    data = request.get_json(silent=True) or {}
    name = (data.get('tournamentName') or '').strip()
    fmt = data.get('format', 'T20')
    overs = int(data.get('overs') or {'T20': 20, 'T10': 10, 'ODI': 50, 'TEST': 0}.get(fmt, 20))
    t_type = data.get('tournamentType', 'Tournament')
    teams = data.get('teams', [])
    schedule = data.get('schedule', [])
    squads = data.get('squads', {})
    schedule_format = (data.get('scheduleFormat') or '').strip() or None
    qual_rules = (data.get('qualificationRules') or '').strip() or None
    num_matches = data.get('numMatches', 3)
    pool_a = data.get('poolA') or None
    pool_b = data.get('poolB') or None
    # doubleRoundRobin may be sent explicitly by the wizard; if absent (older
    # clients) it is inferred later from the reviewed schedule.
    double_rr = bool(data.get('doubleRoundRobin', False))
    double_rr_explicit = 'doubleRoundRobin' in data

    if not name:
        return jsonify({'error': 'Tournament name required'}), 400
    if len(teams) < 2:
        return jsonify({'error': 'At least 2 teams required'}), 400
    if not schedule:
        return jsonify({'error': 'Schedule cannot be empty'}), 400

    # Team-count rules per type
    TYPE_TEAM_RULES = {
        'Bilateral':  {'min': 2, 'max': 2},
        'Tri':        {'min': 3, 'max': 3},
        'Quad':       {'min': 4, 'max': 4},
        'Tournament': {'min': 5, 'max': 20},
    }
    rules = TYPE_TEAM_RULES.get(t_type)
    if rules:
        if len(teams) < rules['min']:
            return jsonify({'error': f"{t_type} requires at least {rules['min']} teams"}), 400
        if len(teams) > rules['max']:
            return jsonify({'error': f"{t_type} allows at most {rules['max']} teams"}), 400
    if 'TBD' in teams:
        return jsonify({'error': 'TBD is not a valid team name'}), 400

    VALID_MATCH_TYPES = {
        'League', 'Group-Stage', 'Semi-Final', 'Final', 'Play-off',
        'Quarter-Final', 'Qualifier-1', 'Qualifier-2', 'Eliminator',
        '3rd-Place-SF', 'SF-1', 'SF-2', 'SF-Final', '1st-Place-Match', '2nd-Place-PO',
    }
    for fx in schedule:
        if fx.get('matchType') not in VALID_MATCH_TYPES:
            return jsonify({'error': f"Invalid matchType: {fx.get('matchType')}"}), 400

    # ── Authoritative schedule regeneration ──────────────────────────────
    # The exact number and type of fixtures MUST match the selected format
    # (round-robin group matches + the right playoffs/semis/final). Rather
    # than trusting a possibly stale/incomplete client schedule (which was
    # the cause of "always 15 matches" regardless of format), rebuild the
    # fixtures server-side from the format parameters, then overlay the
    # concrete team names and dates the admin reviewed (matched by index).
    # Only regenerate when we have an unambiguous format signal, so custom /
    # manually-authored schedules are never overwritten.
    can_regen = (t_type == 'Bilateral') or bool(schedule_format)
    regen, regen_err = None, 'skipped'
    try:
      if can_regen:
        # Infer double round-robin from the reviewed schedule when the client
        # did not send the flag explicitly (backward compatibility).
        if not double_rr_explicit:
            grp_played = sum(1 for m in schedule
                             if m.get('matchType') in ('Group-Stage', 'League'))
            single_rr = len(teams) * (len(teams) - 1) // 2
            if single_rr and grp_played >= single_rr * 2:
                double_rr = True

        # Infer pool composition from the reviewed schedule when not supplied,
        # so pools stay exactly as the admin saw them.
        if schedule_format and 'pool' in schedule_format and not (pool_a and pool_b):
            pa, pb = [], []
            for m in schedule:
                grp = m.get('matchGroup')
                for tm in (m.get('team1Name'), m.get('team2Name')):
                    if tm and tm != 'TBD':
                        if grp == 'Pool A' and tm not in pa:
                            pa.append(tm)
                        elif grp == 'Pool B' and tm not in pb:
                            pb.append(tm)
            if pa and pb:
                pool_a, pool_b = pa, pb

        regen, regen_err = build_fixtures(
            t_type, teams, schedule_format or '', num_matches,
            double_rr, pool_a, pool_b, fmt)
    except Exception:
        regen, regen_err = None, 'regen-failed'

    if regen and not regen_err:
        for i, fx in enumerate(regen):
            if i < len(schedule):
                cs = schedule[i] or {}
                t1 = cs.get('team1Name')
                t2 = cs.get('team2Name')
                if t1 and t1 != 'TBD':
                    fx['team1Name'] = t1
                if t2 and t2 != 'TBD':
                    fx['team2Name'] = t2
                mdate = cs.get('matchDate')
                if mdate:
                    fx['matchDate'] = mdate
        schedule = regen
        # Re-validate the regenerated fixture types just in case.
        for fx in schedule:
            if fx.get('matchType') not in VALID_MATCH_TYPES:
                return jsonify({'error': f"Invalid matchType: {fx.get('matchType')}"}), 400

    try:
        with get_db() as conn:
            exists = conn.execute('SELECT 1 FROM Tournament WHERE tournamentName=?', (name,)).fetchone()
            if exists:
                return jsonify({'error': 'Tournament name already exists'}), 400

            for team in teams:
                if not conn.execute('SELECT 1 FROM Team WHERE teamName=?', (team,)).fetchone():
                    return jsonify({'error': f'Team not found: {team}'}), 400

            conn.execute(
                "INSERT INTO Tournament (tournamentName, format, totalTeams, overs, tournamentType, "
                "status, scheduleFormat, qualificationRules) VALUES (?,?,?,?,?, 'Running', ?, ?)",
                (name, fmt, len(teams), overs, t_type, schedule_format, qual_rules)
            )
            for team in teams:
                try:
                    conn.execute("INSERT INTO TournamentTeams (tournamentName, teamName) VALUES (?,?)",
                                 (name, team))
                except sqlite3.IntegrityError:
                    pass

            # Determine next match id (numeric primary key, no AUTOINCREMENT)
            row = conn.execute("SELECT COALESCE(MAX(matchID), 2000) AS mx FROM Matches").fetchone()
            next_id = int(row['mx']) + 1

            venues = conn.execute('SELECT venueID FROM Venue ORDER BY venueID').fetchall()
            umpires = conn.execute('SELECT umpireID FROM Umpire ORDER BY umpireID').fetchall()

            if not venues:
                return jsonify({'error': 'No venues available. Please seed the database first (POST /api/seed).'}), 400
            if not umpires:
                return jsonify({'error': 'No umpires available. Please seed the database first (POST /api/seed).'}), 400

            match_ids = []
            for i, m in enumerate(schedule):
                vid = venues[i % len(venues)]['venueID']
                u1 = umpires[i % len(umpires)]['umpireID']
                u2 = umpires[(i + 1) % len(umpires)]['umpireID']
                conn.execute(
                    """INSERT INTO Matches
                       (matchID, tournamentName, matchFormat, matchType, isDayNight,
                        team1Name, team2Name, venueID, matchDate,
                        onFieldUmpire1ID, onFieldUmpire2ID, thirdUmpireID,
                        team1TotalRuns, team1TotalWickets, team2TotalRuns, team2TotalWickets,
                        status, matchGroup, sequenceNumber)
                       VALUES (?,?,?,?,0,?,?,?, ?,?,?,NULL,0,0,0,0,'Scheduled',?,?)""",
                    (next_id, name, fmt, m.get('matchType', 'Group-Stage'),
                     m.get('team1Name', 'TBD'), m.get('team2Name', 'TBD'),
                     vid, m.get('matchDate', 'TBD'),
                     u1, u2,
                     m.get('matchGroup'), m.get('sequenceNumber', i + 1))
                )
                match_ids.append(next_id)
                next_id += 1

            for team_name, player_ids in (squads or {}).items():
                for pid in player_ids:
                    try:
                        conn.execute(
                            "INSERT INTO TournamentSquad (tournamentName, teamName, playerID) VALUES (?,?,?)",
                            (name, team_name, pid)
                        )
                    except sqlite3.IntegrityError:
                        pass
        return jsonify({'message': f'Tournament created with {len(schedule)} scheduled matches',
                        'matchIds': match_ids}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/matches/<int:match_id>/activate', methods=['PUT'])
@requires_admin
def activate_match(match_id):
    """Transition a Scheduled match to Live and fill in match-day details."""
    data = request.get_json(silent=True) or {}
    try:
        with get_db() as conn:
            match = conn.execute('SELECT * FROM Matches WHERE matchID=?', (match_id,)).fetchone()
            if not match:
                return jsonify({'error': 'Match not found'}), 404
            current_status = match['status'] if 'status' in match.keys() else None
            if current_status not in ('Scheduled', None, ''):
                return jsonify({'error': f"Match is already '{current_status}'"}), 400

            for field in ('venueID', 'onFieldUmpire1ID', 'onFieldUmpire2ID'):
                if not data.get(field):
                    return jsonify({'error': f'{field} is required to activate a match'}), 400

            toss_winner = (data.get('tossWinnerName') or '').strip()
            toss_decision = (data.get('tossDecision') or '').strip().lower()
            if not toss_winner:
                return jsonify({'error': 'tossWinnerName is required to activate a match'}), 400
            if toss_winner not in (match['team1Name'], match['team2Name']):
                return jsonify({'error': 'Toss winner must be one of the two match teams'}), 400
            if toss_decision not in ('bat', 'batting', 'bowl', 'bowling', 'field', 'fielding'):
                return jsonify({'error': "tossDecision must be 'bat' or 'bowl'"}), 400
            # Normalise decision so downstream toss helpers stay consistent
            toss_decision = 'bat' if toss_decision in ('bat', 'batting') else 'bowl'

            conn.execute("""
                UPDATE Matches SET
                    venueID=?, onFieldUmpire1ID=?, onFieldUmpire2ID=?, thirdUmpireID=?,
                    matchDate=?, isDayNight=?, tossWinnerName=?, tossDecision=?,
                    status='Live', matchStatus='live'
                WHERE matchID=?
            """, (
                data['venueID'], data['onFieldUmpire1ID'], data['onFieldUmpire2ID'],
                data.get('thirdUmpireID') or None, data.get('matchDate'),
                data.get('isDayNight', 0), toss_winner, toss_decision,
                match_id
            ))

            for p in data.get('playingXI', []):
                try:
                    conn.execute(
                        "INSERT OR REPLACE INTO PlayingXI (matchID, playerID, matchRole, teamName) VALUES (?,?,?,?)",
                        (match_id, p['playerID'], p.get('matchRole') or 'Player', p.get('teamName'))
                    )
                except sqlite3.IntegrityError:
                    pass

            # Publish both-innings batting/bowling sides so the UI can sync immediately
            innings_teams = {}
            for inn in (1, 2, 3, 4):
                bat, bowl = _teams_for_innings(conn, match_id, inn)
                innings_teams[str(inn)] = {'battingTeam': bat, 'bowlingTeam': bowl}

        return jsonify({
            'message': 'Match activated successfully',
            'matchId': match_id,
            'tossWinnerName': toss_winner,
            'tossDecision': toss_decision,
            'inningsTeams': innings_teams,
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

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
                conn.execute('DELETE FROM MatchState WHERE matchID=?', (mid,))
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
            SELECT ts.teamName, p.playerID, p.playerName, p.playerRole, p.battingOrder
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
                'playerRole': r['playerRole'],
                'battingOrder': r['battingOrder'] or 'Middle Order'
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


@app.route('/api/tournaments/<path:name>', methods=['PUT'])
@requires_admin
def update_tournament(name):
    """Update editable tournament metadata (format, overs, qualification rules)."""
    data = request.get_json(silent=True) or {}
    try:
        with get_db() as conn:
            t = conn.execute('SELECT * FROM Tournament WHERE tournamentName=?', (name,)).fetchone()
            if not t:
                return jsonify({'error': 'Tournament not found'}), 404
            sets, params = [], []
            if 'format' in data and data['format']:
                sets.append('format=?'); params.append(data['format'])
            if 'overs' in data and data.get('overs') is not None:
                sets.append('overs=?'); params.append(int(data['overs']))
            if 'qualificationRules' in data:
                sets.append('qualificationRules=?')
                params.append((data.get('qualificationRules') or '').strip() or None)
            if not sets:
                return jsonify({'error': 'Nothing to update'}), 400
            params.append(name)
            conn.execute(f"UPDATE Tournament SET {', '.join(sets)} WHERE tournamentName=?", params)
        return jsonify({'message': 'Tournament updated'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/tournaments/<path:name>/teams', methods=['PUT'])
@requires_admin
def update_tournament_teams(name):
    """Add participating teams to a tournament after creation (never removes played teams)."""
    data = request.get_json(silent=True) or {}
    add = data.get('teams', [])
    try:
        with get_db() as conn:
            t = conn.execute('SELECT * FROM Tournament WHERE tournamentName=?', (name,)).fetchone()
            if not t:
                return jsonify({'error': 'Tournament not found'}), 404
            for team in add:
                if team == 'TBD':
                    continue
                if not conn.execute('SELECT 1 FROM Team WHERE teamName=?', (team,)).fetchone():
                    return jsonify({'error': f'Team not found: {team}'}), 400
                try:
                    conn.execute('INSERT INTO TournamentTeams (tournamentName, teamName) VALUES (?,?)',
                                 (name, team))
                except sqlite3.IntegrityError:
                    pass
            cnt = conn.execute('SELECT COUNT(*) c FROM TournamentTeams WHERE tournamentName=?',
                               (name,)).fetchone()['c']
            conn.execute('UPDATE Tournament SET totalTeams=? WHERE tournamentName=?', (cnt, name))
        return jsonify({'message': 'Teams updated'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/tournaments/<path:name>/schedule', methods=['POST'])
@requires_admin
def add_scheduled_matches(name):
    """Append one or more Scheduled fixtures to an existing tournament."""
    data = request.get_json(silent=True) or {}
    fixtures = data.get('schedule', [])
    if not fixtures:
        return jsonify({'error': 'No fixtures supplied'}), 400
    VALID_MATCH_TYPES = {
        'League', 'Group-Stage', 'Semi-Final', 'Final', 'Play-off',
        'Quarter-Final', 'Qualifier-1', 'Qualifier-2', 'Eliminator',
        '3rd-Place-SF', 'SF-1', 'SF-2', 'SF-Final', '1st-Place-Match', '2nd-Place-PO',
    }
    try:
        with get_db() as conn:
            t = conn.execute('SELECT * FROM Tournament WHERE tournamentName=?', (name,)).fetchone()
            if not t:
                return jsonify({'error': 'Tournament not found'}), 404
            fmt = t['format']
            row = conn.execute("SELECT COALESCE(MAX(matchID), 2000) AS mx FROM Matches").fetchone()
            next_id = int(row['mx']) + 1
            seq_row = conn.execute(
                'SELECT COALESCE(MAX(sequenceNumber),0) s FROM Matches WHERE tournamentName=?',
                (name,)).fetchone()
            seq = int(seq_row['s'])

            venues = conn.execute('SELECT venueID FROM Venue ORDER BY venueID').fetchall()
            umpires = conn.execute('SELECT umpireID FROM Umpire ORDER BY umpireID').fetchall()

            if not venues:
                return jsonify({'error': 'No venues available. Please seed the database first (POST /api/seed).'}), 400
            if not umpires:
                return jsonify({'error': 'No umpires available. Please seed the database first (POST /api/seed).'}), 400

            ids = []
            for idx, m in enumerate(fixtures):
                if m.get('matchType') not in VALID_MATCH_TYPES:
                    return jsonify({'error': f"Invalid matchType: {m.get('matchType')}"}), 400
                seq += 1
                vid = venues[(len(ids)) % len(venues)]['venueID']
                u1 = umpires[(len(ids)) % len(umpires)]['umpireID']
                u2 = umpires[(len(ids) + 1) % len(umpires)]['umpireID']
                conn.execute(
                    """INSERT INTO Matches
                       (matchID, tournamentName, matchFormat, matchType, isDayNight,
                        team1Name, team2Name, venueID, matchDate,
                        onFieldUmpire1ID, onFieldUmpire2ID, thirdUmpireID,
                        team1TotalRuns, team1TotalWickets, team2TotalRuns, team2TotalWickets,
                        status, matchGroup, sequenceNumber)
                       VALUES (?,?,?,?,0,?,?,?, ?,?,?,NULL,0,0,0,0,'Scheduled',?,?)""",
                    (next_id, name, fmt, m.get('matchType', 'Group-Stage'),
                     m.get('team1Name', 'TBD'), m.get('team2Name', 'TBD'),
                     vid, m.get('matchDate', 'TBD'),
                     u1, u2,
                     m.get('matchGroup'), seq))
                ids.append(next_id)
                next_id += 1
        return jsonify({'message': f'{len(ids)} matches added', 'matchIds': ids}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/matches/<int:match_id>/schedule', methods=['PUT'])
@requires_admin
def update_scheduled_match(match_id):
    """Edit a Scheduled fixture's teams / type / date before it is activated."""
    data = request.get_json(silent=True) or {}
    try:
        with get_db() as conn:
            m = conn.execute('SELECT * FROM Matches WHERE matchID=?', (match_id,)).fetchone()
            if not m:
                return jsonify({'error': 'Match not found'}), 404
            if m['status'] not in ('Scheduled', None):
                return jsonify({'error': 'Only Scheduled matches can be edited'}), 400
            sets, params = [], []
            for field, col in (('team1Name', 'team1Name'), ('team2Name', 'team2Name'),
                               ('matchType', 'matchType'), ('matchDate', 'matchDate'),
                               ('matchGroup', 'matchGroup')):
                if field in data:
                    sets.append(f'{col}=?'); params.append(data[field])
            if not sets:
                return jsonify({'error': 'Nothing to update'}), 400
            params.append(match_id)
            conn.execute(f"UPDATE Matches SET {', '.join(sets)} WHERE matchID=?", params)
        return jsonify({'message': 'Match updated'}), 200
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
                   COUNT(DISTINCT b.matchID) AS matchesPlayed,
                   SUM(b.runsScored) AS totalRuns,
                   SUM(CASE WHEN b.extraType IN ('Retired','Wide') THEN 0 ELSE 1 END) AS ballsFaced,
                   SUM(CASE WHEN b.dismissedPlayerID=b.batsmanID THEN 1 ELSE 0 END) AS dismissals,
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
                   COUNT(DISTINCT b.matchID) AS matchesPlayed,
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
                       SUM(CASE WHEN b.extraType IN ('Retired','Wide') THEN 0 ELSE 1 END) AS balls,
                       SUM(CASE WHEN b.runsScored=4 THEN 1 ELSE 0 END) AS fours,
                       SUM(CASE WHEN b.runsScored=6 THEN 1 ELSE 0 END) AS sixes,
                       MAX(CASE WHEN b.dismissedPlayerID=b.batsmanID
                           THEN b.wicketType ELSE NULL END) AS dismissal,
                       (SELECT p2.playerName FROM BallByBall b2
                        JOIN Players p2 ON b2.bowlerID = p2.playerID
                        WHERE b2.matchID=b.matchID AND b2.inningsNumber=b.inningsNumber
                              AND b2.dismissedPlayerID=b.batsmanID AND b2.wicketType != 'RunOut'
                        ORDER BY b2.rowid DESC LIMIT 1) AS bowlerName,
                       (SELECT p3.playerName FROM BallByBall b3
                        JOIN Players p3 ON b3.fielderID = p3.playerID
                        WHERE b3.matchID=b.matchID AND b3.inningsNumber=b.inningsNumber
                              AND b3.dismissedPlayerID=b.batsmanID
                        ORDER BY b3.rowid DESC LIMIT 1) AS fielderName,
                       (SELECT MIN(bb.ballID) FROM BallByBall bb
                        WHERE bb.matchID=b.matchID AND bb.inningsNumber=b.inningsNumber
                              AND bb.batsmanID=b.batsmanID) AS battingSeq
                FROM BallByBall b
                JOIN Players p ON b.batsmanID = p.playerID
                WHERE b.matchID=? AND b.inningsNumber=?
                GROUP BY b.batsmanID ORDER BY battingSeq ASC
            ''', (match_id, innings_num)).fetchall()

        def get_bowling(innings_num):
            return conn.execute('''
                SELECT b.bowlerID, p.playerName,
                       SUM(CASE WHEN (b.extraType IS NULL OR b.extraType NOT IN ('Wide','NoBall','Retired'))
                                THEN 1 ELSE 0 END) AS ballsBowled,
                       SUM(b.runsScored + CASE WHEN b.extraType IN ('Wide','NoBall')
                                               THEN b.extras ELSE 0 END) AS runsConceded,
                       SUM(CASE WHEN b.wicketFallen=1 AND (b.wicketType IS NULL OR b.wicketType != 'RetiredOut')
                                THEN 1 ELSE 0 END) AS wicketsTaken,
                       SUM(CASE WHEN b.extraType IN ('Wide','NoBall')
                                THEN b.extras ELSE 0 END) AS extras,
                       (SELECT COUNT(*) FROM (
                            SELECT bo.overNumber
                            FROM BallByBall bo
                            WHERE bo.matchID=b.matchID AND bo.inningsNumber=b.inningsNumber
                                  AND bo.bowlerID=b.bowlerID
                            GROUP BY bo.overNumber
                            HAVING SUM(CASE WHEN (bo.extraType IS NULL OR bo.extraType NOT IN ('Wide','NoBall','Retired'))
                                            THEN 1 ELSE 0 END) >= 6
                               AND SUM(bo.runsScored + CASE WHEN bo.extraType IN ('Wide','NoBall')
                                                            THEN bo.extras ELSE 0 END) = 0
                       )) AS maidens
                FROM BallByBall b
                JOIN Players p ON b.bowlerID = p.playerID
                WHERE b.matchID=? AND b.inningsNumber=?
                GROUP BY b.bowlerID ORDER BY wicketsTaken DESC
            ''', (match_id, innings_num)).fetchall()

        def get_playing_xi(team_name):
            return conn.execute('''
                SELECT p.playerID, p.playerName, p.playerRole, p.battingStyle, p.bowlingStyle,
                       p.battingOrder, xi.matchRole, xi.rowid AS xiOrder
                FROM PlayingXI xi
                JOIN Players p ON xi.playerID = p.playerID
                JOIN Squad s ON p.playerID = s.playerID
                WHERE xi.matchID=? AND s.teamName=?
                ORDER BY xi.rowid
            ''', (match_id, team_name)).fetchall()

        # ── Match overview helpers (live strip + worm + completed summary) ──
        def _name_map():
            rows = conn.execute(
                'SELECT playerID, playerName FROM Players'
            ).fetchall()
            return {r['playerID']: r['playerName'] for r in rows}

        def _innings_totals(inn):
            row = conn.execute(
                '''
                SELECT
                    COALESCE(SUM(runsScored + extras), 0) AS runs,
                    COALESCE(SUM(wicketFallen), 0) AS wickets,
                    COALESCE(SUM(CASE WHEN extraType IS NULL OR extraType NOT IN ('Wide','NoBall','Retired')
                                     THEN 1 ELSE 0 END), 0) AS legalBalls
                FROM BallByBall WHERE matchID=? AND inningsNumber=?
                ''',
                (match_id, inn)
            ).fetchone()
            legal = int(row['legalBalls'] or 0)
            return {
                'runs': int(row['runs'] or 0),
                'wickets': int(row['wickets'] or 0),
                'legalBalls': legal,
                'overs': f"{legal // 6}.{legal % 6}",
            }

        def _worm_for_innings(inn):
            """Cumulative runs by completed over (+ partial current over)."""
            balls = conn.execute(
                '''
                SELECT overNumber, ballNumber, runsScored, extras, extraType, wicketFallen
                FROM BallByBall
                WHERE matchID=? AND inningsNumber=?
                ORDER BY overNumber, ballID
                ''',
                (match_id, inn)
            ).fetchall()
            if not balls:
                return {'points': [], 'labels': [], 'runs': [], 'wicketsAt': []}

            cum = 0
            over_end_runs = {}
            wicket_marks = []
            max_over = 0
            for b in balls:
                ov = int(b['overNumber'] or 0)
                max_over = max(max_over, ov)
                runs = int(b['runsScored'] or 0) + int(b['extras'] or 0)
                cum += runs
                if b['wicketFallen']:
                    wicket_marks.append({'over': ov, 'runs': cum})
                over_end_runs[ov] = cum

            labels = [0]
            runs_series = [0]
            for ov in range(1, max_over + 1):
                if ov in over_end_runs:
                    labels.append(ov)
                    runs_series.append(over_end_runs[ov])
            return {
                'points': [{'over': labels[i], 'runs': runs_series[i]} for i in range(len(labels))],
                'labels': labels,
                'runs': runs_series,
                'wicketsAt': wicket_marks,
            }

        def _player_live_bat(pid, inn):
            if not pid:
                return None
            row = conn.execute(
                '''
                SELECT
                    COALESCE(SUM(runsScored), 0) AS runs,
                    COALESCE(SUM(CASE WHEN extraType IN ('Retired','Wide') THEN 0 ELSE 1 END), 0) AS balls,
                    COALESCE(SUM(CASE WHEN runsScored=4 THEN 1 ELSE 0 END), 0) AS fours,
                    COALESCE(SUM(CASE WHEN runsScored=6 THEN 1 ELSE 0 END), 0) AS sixes
                FROM BallByBall
                WHERE matchID=? AND inningsNumber=? AND batsmanID=?
                ''',
                (match_id, inn, pid)
            ).fetchone()
            names = _name_map()
            runs = int(row['runs'] or 0)
            balls = int(row['balls'] or 0)
            return {
                'playerID': pid,
                'playerName': names.get(pid, pid),
                'runs': runs,
                'balls': balls,
                'fours': int(row['fours'] or 0),
                'sixes': int(row['sixes'] or 0),
                'strikeRate': round((runs * 100 / balls), 1) if balls else 0.0,
            }

        def _player_live_bowl(pid, inn):
            if not pid:
                return None
            row = conn.execute(
                '''
                SELECT
                    COALESCE(SUM(CASE WHEN extraType IS NULL OR extraType NOT IN ('Wide','NoBall','Retired')
                                     THEN 1 ELSE 0 END), 0) AS balls,
                    COALESCE(SUM(runsScored + CASE WHEN extraType IN ('Wide','NoBall') THEN extras ELSE 0 END), 0) AS runs,
                    COALESCE(SUM(CASE WHEN wicketFallen=1 AND (wicketType IS NULL OR wicketType != 'RetiredOut')
                                     THEN 1 ELSE 0 END), 0) AS wickets
                FROM BallByBall
                WHERE matchID=? AND inningsNumber=? AND bowlerID=?
                ''',
                (match_id, inn, pid)
            ).fetchone()
            names = _name_map()
            balls = int(row['balls'] or 0)
            runs = int(row['runs'] or 0)
            wkts = int(row['wickets'] or 0)
            return {
                'playerID': pid,
                'playerName': names.get(pid, pid),
                'overs': f"{balls // 6}.{balls % 6}",
                'balls': balls,
                'runs': runs,
                'wickets': wkts,
                'economy': round(runs / (balls / 6.0), 2) if balls else 0.0,
                'figures': f"{wkts}/{runs}",
            }

        def _top_bat_for_team(team_name):
            xi_ids = [r['playerID'] for r in get_playing_xi(team_name)]
            if not xi_ids:
                return None
            placeholders = ','.join('?' * len(xi_ids))
            row = conn.execute(
                f'''
                SELECT b.batsmanID, p.playerName,
                       SUM(b.runsScored) AS runs,
                       SUM(CASE WHEN b.extraType IN ('Retired','Wide') THEN 0 ELSE 1 END) AS balls
                FROM BallByBall b
                JOIN Players p ON p.playerID = b.batsmanID
                WHERE b.matchID=? AND b.batsmanID IN ({placeholders})
                GROUP BY b.batsmanID
                ORDER BY runs DESC, balls ASC
                LIMIT 1
                ''',
                (match_id, *xi_ids)
            ).fetchone()
            if not row or not row['runs']:
                return None
            balls = int(row['balls'] or 0)
            runs = int(row['runs'] or 0)
            return {
                'playerID': row['batsmanID'],
                'playerName': row['playerName'],
                'runs': runs,
                'balls': balls,
                'strikeRate': round(runs * 100 / balls, 1) if balls else 0.0,
            }

        def _top_bowl_for_team(team_name):
            xi_ids = [r['playerID'] for r in get_playing_xi(team_name)]
            if not xi_ids:
                return None
            placeholders = ','.join('?' * len(xi_ids))
            row = conn.execute(
                f'''
                SELECT b.bowlerID, p.playerName,
                       SUM(CASE WHEN b.wicketFallen=1 AND (b.wicketType IS NULL OR b.wicketType != 'RetiredOut')
                                THEN 1 ELSE 0 END) AS wickets,
                       SUM(b.runsScored + CASE WHEN b.extraType IN ('Wide','NoBall') THEN b.extras ELSE 0 END) AS runs,
                       SUM(CASE WHEN b.extraType IS NULL OR b.extraType NOT IN ('Wide','NoBall','Retired')
                                THEN 1 ELSE 0 END) AS balls
                FROM BallByBall b
                JOIN Players p ON p.playerID = b.bowlerID
                WHERE b.matchID=? AND b.bowlerID IN ({placeholders})
                GROUP BY b.bowlerID
                ORDER BY wickets DESC, runs ASC
                LIMIT 1
                ''',
                (match_id, *xi_ids)
            ).fetchone()
            if not row:
                return None
            wkts = int(row['wickets'] or 0)
            runs = int(row['runs'] or 0)
            balls = int(row['balls'] or 0)
            if wkts == 0 and runs == 0:
                return None
            return {
                'playerID': row['bowlerID'],
                'playerName': row['playerName'],
                'wickets': wkts,
                'runs': runs,
                'overs': f"{balls // 6}.{balls % 6}",
                'figures': f"{wkts}/{runs}",
            }

        max_inn_row = conn.execute(
            'SELECT MAX(inningsNumber) AS mi FROM BallByBall WHERE matchID=?',
            (match_id,)
        ).fetchone()
        active_innings = int(max_inn_row['mi'] or 0) or 1
        progress = evaluate_progress(conn, match_id, active_innings) if m else {}
        bat_team, bowl_team = _teams_for_innings(conn, match_id, active_innings) if m else (None, None)

        state_row = conn.execute(
            '''
            SELECT strikerID, nonStrikerID, bowlerID, freeHitPending FROM MatchState
            WHERE matchID=? AND inningsNumber=?
            ''',
            (match_id, active_innings)
        ).fetchone()
        striker_id = state_row['strikerID'] if state_row else None
        nonstriker_id = state_row['nonStrikerID'] if state_row else None
        bowler_id = state_row['bowlerID'] if state_row else None
        free_hit_pending = bool(state_row['freeHitPending']) if state_row and 'freeHitPending' in state_row.keys() and state_row['freeHitPending'] else False
        if striker_id is None or bowler_id is None:
            last_ball = conn.execute(
                '''
                SELECT batsmanID, bowlerID FROM BallByBall
                WHERE matchID=? AND inningsNumber=?
                ORDER BY ballID DESC LIMIT 1
                ''',
                (match_id, active_innings)
            ).fetchone()
            if last_ball:
                if striker_id is None:
                    striker_id = last_ball['batsmanID']
                if bowler_id is None:
                    bowler_id = last_ball['bowlerID']

        tot = _innings_totals(active_innings)
        legal = tot['legalBalls']
        next_over = (legal // 6) + 1
        next_ball = (legal % 6) + 1
        last_over_bowler_id = None
        look_over = next_over - 1 if next_over > 1 else None
        if look_over:
            prev = conn.execute(
                '''
                SELECT bowlerID FROM BallByBall
                WHERE matchID=? AND inningsNumber=? AND overNumber=?
                ORDER BY ballID DESC LIMIT 1
                ''',
                (match_id, active_innings, look_over)
            ).fetchone()
            if prev:
                last_over_bowler_id = prev['bowlerID']

        inn1_tot = _innings_totals(1)
        inn2_tot = _innings_totals(2)
        completed = bool(m['winnerName']) or bool(progress.get('matchComplete')) or (
            (m['matchStatus'] == 'completed') if m['matchStatus'] else False
        )

        if completed:
            phase = 'completed'
        elif active_innings >= 2 or inn2_tot['legalBalls'] > 0 or inn2_tot['runs'] > 0:
            phase = 'innings2'
        elif progress.get('phase') == 'innings_break':
            phase = 'innings1_break'
        elif inn1_tot['legalBalls'] > 0 or inn1_tot['runs'] > 0:
            phase = 'innings1'
        else:
            phase = 'not_started'

        target = None
        if phase in ('innings2', 'innings1_break', 'completed'):
            if inn1_tot['legalBalls'] or inn1_tot['runs']:
                target = inn1_tot['runs'] + 1

        overview = {
            'phase': phase,
            'activeInnings': active_innings,
            'completed': completed,
            'tossWinnerName': m['tossWinnerName'],
            'tossDecision': m['tossDecision'],
            'winnerName': m['winnerName'] or progress.get('winnerName'),
            'winMargin': m['winMargin'] or progress.get('winMargin'),
            'resultText': progress.get('resultText'),
            'battingTeam': bat_team,
            'bowlingTeam': bowl_team,
            'target': target if phase != 'innings1' else None,
            'innings1': {
                **inn1_tot,
                'battingTeam': _teams_for_innings(conn, match_id, 1)[0] if m else None,
            },
            'innings2': {
                **inn2_tot,
                'battingTeam': _teams_for_innings(conn, match_id, 2)[0] if m else None,
            },
            'striker': _player_live_bat(striker_id, active_innings),
            'nonStriker': _player_live_bat(nonstriker_id, active_innings),
            'currentBowler': _player_live_bowl(bowler_id, active_innings),
            'lastOverBowler': _player_live_bowl(last_over_bowler_id, active_innings) if last_over_bowler_id else None,
            'worms': {
                'innings1': _worm_for_innings(1),
                'innings2': _worm_for_innings(2),
            },
            'topPerformers': {
                'team1': {
                    'teamName': m['team1Name'],
                    'topBat': _top_bat_for_team(m['team1Name']),
                    'topBowl': _top_bowl_for_team(m['team1Name']),
                },
                'team2': {
                    'teamName': m['team2Name'],
                    'topBat': _top_bat_for_team(m['team2Name']),
                    'topBowl': _top_bowl_for_team(m['team2Name']),
                },
            },
            'progress': progress,
        }

        return jsonify({
            'match':          dict(m),
            'innings1Bat':    [dict(r) for r in get_batting(1)],
            'innings1Bowl':   [dict(r) for r in get_bowling(1)],
            'innings2Bat':    [dict(r) for r in get_batting(2)],
            'innings2Bowl':   [dict(r) for r in get_bowling(2)],
            'innings3Bat':    [dict(r) for r in get_batting(3)],
            'innings3Bowl':   [dict(r) for r in get_bowling(3)],
            'innings4Bat':    [dict(r) for r in get_batting(4)],
            'innings4Bowl':   [dict(r) for r in get_bowling(4)],
            'team1XI':        [dict(r) for r in get_playing_xi(m['team1Name'])],
            'team2XI':        [dict(r) for r in get_playing_xi(m['team2Name'])],
            'overview':       overview,
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
    # Put format filter in the JOIN so teams with zero matches still appear.
    join_extra = " AND m.matchFormat = ? " if format_filter else ""
    params = (format_filter,) if format_filter else ()

    with get_db() as conn:
        rows = conn.execute(
            "SELECT t.teamName, t.country, "
            "COUNT(m.matchID) AS matchesPlayed, "
            "SUM(CASE WHEN m.winnerName = t.teamName THEN 1 ELSE 0 END) AS wins "
            "FROM Team t "
            "LEFT JOIN Matches m ON (t.teamName = m.team1Name OR t.teamName = m.team2Name)"
            + join_extra +
            " GROUP BY t.teamName "
            "ORDER BY wins DESC, matchesPlayed ASC, t.ranking ASC",
            params
        ).fetchall()

        result = []
        for r in rows:
            d = dict(r)
            team = d['teamName']
            fparams = [team, team]
            fq = ("SELECT winnerName FROM Matches "
                  "WHERE (team1Name=? OR team2Name=?) AND status='Completed'")
            if format_filter:
                fq += " AND matchFormat=?"; fparams.append(format_filter)
            fq += " ORDER BY matchDate DESC, matchID DESC LIMIT 5"
            form_rows = conn.execute(fq, tuple(fparams)).fetchall()
            form = []
            for f in form_rows:
                if not f['winnerName']:
                    form.append('N')
                elif f['winnerName'] == team:
                    form.append('W')
                else:
                    form.append('L')
            while len(form) < 5:
                form.append(None)
            d['recentForm'] = form
            result.append(d)
        return jsonify(result)

@app.route('/api/rankings/players', methods=['GET'])
def player_rankings():
    format_filter = request.args.get('format', '').strip()
    role_filter = request.args.get('role', '').strip()  # Batters | Bowlers | AllRounders
    # Runs are credited to the batsman; wickets are credited to the bowler
    # (excluding RetiredOut). Computed as independent subqueries so a bowler's
    # wickets are never confused with dismissals that fell while they batted.
    jm  = " JOIN Matches m ON b.matchID = m.matchID " if format_filter else ""
    fmt = " AND m.matchFormat = ? " if format_filter else ""
    params = []
    if format_filter:
        params.extend([format_filter, format_filter])

    role_clause = ""
    if role_filter in ('Batters', 'Batsman'):
        role_clause = " WHERE p.playerRole IN ('Batsman', 'WicketKeeper') "
        order_by = "totalRuns DESC, totalWickets DESC"
    elif role_filter in ('Bowlers', 'Bowler'):
        role_clause = " WHERE p.playerRole = 'Bowler' "
        order_by = "totalWickets DESC, totalRuns DESC"
    elif role_filter in ('AllRounders', 'AllRounder'):
        role_clause = " WHERE p.playerRole = 'AllRounder' "
        order_by = "(totalRuns + totalWickets * 20) DESC, totalRuns DESC"
    else:
        order_by = "totalRuns DESC, totalWickets DESC"

    sql = (
        "SELECT p.playerID, p.playerName, p.playerNationality, p.playerRole, "
        "COALESCE((SELECT SUM(b.runsScored) FROM BallByBall b" + jm +
        " WHERE b.batsmanID = p.playerID" + fmt + "), 0) AS totalRuns, "
        "COALESCE((SELECT SUM(CASE WHEN b.wicketFallen=1 "
        "AND (b.wicketType IS NULL OR b.wicketType != 'RetiredOut') "
        "THEN 1 ELSE 0 END) FROM BallByBall b" + jm +
        " WHERE b.bowlerID = p.playerID" + fmt + "), 0) AS totalWickets "
        "FROM Players p" + role_clause +
        " ORDER BY " + order_by + " LIMIT 100"
    )
    with get_db() as conn:
        rows = conn.execute(sql, tuple(params)).fetchall()
        return jsonify([dict(r) for r in rows])

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

# Total overs bowled in ONE innings, per format. TEST has no over cap.
INNINGS_OVERS = {'T10': 10, 'T20': 20, 'ODI': 50, 'TEST': None}

# ICC Super Over limits (per side)
SUPER_OVER_BALLS   = 6    # one over
SUPER_OVER_WICKETS = 2    # side is "all out" on the 2nd wicket

# Wickets that end an innings ("all out") for the two innings-pairs
ALL_OUT_WICKETS = 10


# ─────────────────────────────────────────────────────
# Innings / result evaluation (ICC rules)
# ─────────────────────────────────────────────────────
def _teams_for_innings(conn, match_id, innings):
    """Return (battingTeam, bowlingTeam) for any innings 1-4.
    Innings 1/2 follow the toss. The Super Over (3/4) follows the ICC rule
    that the team which batted SECOND in the match bats FIRST in the Super Over."""
    m = conn.execute(
        'SELECT team1Name, team2Name, tossWinnerName, tossDecision FROM Matches WHERE matchID=?',
        (match_id,)).fetchone()
    if not m:
        return (None, None)
    t1, t2 = m['team1Name'], m['team2Name']
    tw = m['tossWinnerName']
    dec = (m['tossDecision'] or '').strip().lower()
    other = t2 if tw == t1 else t1
    if dec in ('bat', 'batting'):
        inn1_bat = tw
    elif dec in ('bowl', 'bowling', 'field', 'fielding'):
        inn1_bat = other
    else:
        inn1_bat = t1
    inn1_bowl = t2 if inn1_bat == t1 else t1
    # innings 1 & 4 -> team that batted first in the match; 2 & 3 -> the other side
    if innings in (1, 4):
        return (inn1_bat, inn1_bowl)
    return (inn1_bowl, inn1_bat)


def _innings_runs_wkts(conn, match_id, innings):
    """(runs, wickets, legalBalls) for one innings, straight from BallByBall."""
    row = conn.execute('''
        SELECT COALESCE(SUM(runsScored + extras), 0) AS r,
               COALESCE(SUM(wicketFallen), 0)        AS w,
               COALESCE(SUM(CASE WHEN (extraType IS NULL OR extraType NOT IN ('Wide','NoBall','Retired'))
                                 THEN 1 ELSE 0 END), 0) AS legal
        FROM BallByBall WHERE matchID=? AND inningsNumber=?
    ''', (match_id, innings)).fetchone()
    return int(row['r']), int(row['w']), int(row['legal'])


def _wickets_word(n):
    return '1 wicket' if n == 1 else f'{n} wickets'


def _runs_word(n):
    return '1 run' if n == 1 else f'{n} runs'


def evaluate_progress(conn, match_id, innings):
    """Evaluate innings-completion and the match result under ICC rules.

    Returns a dict the front-end uses to drive the target banner, the
    "innings complete -> start next" flow, the win/loss declaration, and the
    Super Over. Handles limited-overs formats only; TEST is skipped."""
    m = conn.execute('SELECT * FROM Matches WHERE matchID=?', (match_id,)).fetchone()
    if not m:
        return {}
    fmt = m['matchFormat']
    overs_limit = INNINGS_OVERS.get(fmt)

    out = {
        'format':           fmt,
        'oversLimit':       overs_limit,
        'isLimitedOvers':   overs_limit is not None,
        'innings':          innings,
        'isSuperOver':      innings >= 3,
        'runs':             0,
        'wickets':          0,
        'legalBalls':       0,
        'ballsLimit':       None,
        'ballsRemaining':   None,
        'wicketsRemaining': None,
        'target':           None,
        'runsNeeded':       None,
        'inningsComplete':  False,
        'matchComplete':    False,
        'isTie':            False,
        'winnerName':       m['winnerName'],
        'winMargin':        m['winMargin'],
        'resultText':       None,
        'phase':            'live',      # live | innings_break | super_over_pending | super_over_break | complete | test
        'nextInnings':      None,
        'battingTeam':      None,
        'bowlingTeam':      None,
    }

    if overs_limit is None:            # TEST — no auto innings/target/super-over
        out['phase'] = 'test'
        out['matchComplete'] = bool(m['winnerName'])
        return out

    is_super  = innings >= 3
    balls_limit = SUPER_OVER_BALLS if is_super else overs_limit * 6
    wkts_limit  = SUPER_OVER_WICKETS if is_super else ALL_OUT_WICKETS
    first_inn = 3 if is_super else 1
    second_inn = 4 if is_super else 2

    bat, bowl = _teams_for_innings(conn, match_id, innings)
    out['battingTeam'], out['bowlingTeam'] = bat, bowl

    r, w, legal = _innings_runs_wkts(conn, match_id, innings)
    out['runs'], out['wickets'], out['legalBalls'] = r, w, legal
    out['ballsLimit'] = balls_limit
    out['ballsRemaining'] = max(0, balls_limit - legal)
    out['wicketsRemaining'] = max(0, wkts_limit - w)

    overs_done = legal >= balls_limit
    all_out    = w >= wkts_limit

    if innings == first_inn:
        # First innings of the pair: just check whether it is over.
        if overs_done or all_out:
            out['inningsComplete'] = True
            out['phase'] = 'super_over_break' if is_super else 'innings_break'
            out['nextInnings'] = second_inn
        return out

    # ── Chasing innings (2nd of the pair) ──
    first_runs, _fw, _fl = _innings_runs_wkts(conn, match_id, first_inn)
    target = first_runs + 1
    out['target'] = target
    out['runsNeeded'] = max(0, target - r)

    if r >= target:
        # Target overtaken -> chasing side wins by wickets in hand.
        out['inningsComplete'] = True
        out['matchComplete'] = True
        out['winnerName'] = bat
        wih = wkts_limit - w
        out['winMargin'] = 'Super Over' if is_super else _wickets_word(wih)
        out['resultText'] = (f'{bat} won the Super Over' if is_super
                             else f'{bat} won by {_wickets_word(wih)}')
        out['phase'] = 'complete'
    elif overs_done or all_out:
        out['inningsComplete'] = True
        if r == first_runs:
            # Scores level.
            out['isTie'] = True
            if is_super:
                # Super Over tied -> ICC calls for another Super Over.
                out['phase'] = 'super_over_pending'
                out['resultText'] = 'Super Over tied — another Super Over required'
            else:
                out['phase'] = 'super_over_pending'
                out['resultText'] = 'Match tied — Super Over required'
        else:
            # Fell short -> team batting first wins by runs.
            out['matchComplete'] = True
            out['winnerName'] = bowl          # bowling side batted first this pair
            diff = first_runs - r
            out['winMargin'] = 'Super Over' if is_super else _runs_word(diff)
            out['resultText'] = (f'{bowl} won the Super Over' if is_super
                                 else f'{bowl} won by {_runs_word(diff)}')
            out['phase'] = 'complete'
    return out


def _persist_match_result(conn, match_id, prog):
    """Write the computed status/result back to the Matches row."""
    status_map = {
        'live':               'live',
        'innings_break':      'innings_break',
        'super_over_break':   'super_over',
        'super_over_pending': 'super_over',
        'complete':           'completed',
        'test':               'live',
    }
    status = status_map.get(prog.get('phase'), 'live')
    if prog.get('matchComplete'):
        conn.execute(
            'UPDATE Matches SET winnerName=?, winMargin=?, matchStatus=? WHERE matchID=?',
            (prog.get('winnerName'), prog.get('winMargin'), 'completed', match_id))
    else:
        conn.execute('UPDATE Matches SET matchStatus=? WHERE matchID=?', (status, match_id))


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
            SELECT px.playerID, p.playerName, p.playerRole,
                   p.battingStyle, p.bowlingStyle, p.battingOrder,
                   -- Fall back to the player's Squad team if the XI row has no
                   -- teamName recorded, so the batting/bowling split is never empty.
                   COALESCE(px.teamName,
                            (SELECT s.teamName FROM Squad s
                             WHERE s.playerID = px.playerID LIMIT 1)) AS teamName,
                   px.rowid AS xiOrder,
                   1 AS canBat,  -- any of the 11 may bat (tail-enders included)
                   CASE WHEN p.playerRole IN ('Bowler','AllRounder')
                        OR (p.bowlingStyle IS NOT NULL AND TRIM(LOWER(p.bowlingStyle)) NOT IN ('', 'none'))
                        THEN 1 ELSE 0 END AS canBowl
            FROM PlayingXI px JOIN Players p ON px.playerID = p.playerID
            WHERE px.matchID=?
            ORDER BY px.rowid
        ''', (match_id,)).fetchall()

        match = conn.execute('SELECT * FROM Matches WHERE matchID=?', (match_id,)).fetchone()

        # Innings/target/result status under ICC rules (drives the live banner)
        progress = evaluate_progress(conn, match_id, innings) if match else {}

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
            SELECT strikerID, nonStrikerID, bowlerID, freeHitPending FROM MatchState
            WHERE matchID=? AND inningsNumber=?
        ''', (match_id, innings)).fetchone()

        striker_id = state_row['strikerID'] if state_row else None
        nonstriker_id = state_row['nonStrikerID'] if state_row else None
        bowler_id = state_row['bowlerID'] if state_row else None
        free_hit_pending = bool(state_row['freeHitPending']) if state_row and state_row['freeHitPending'] else False

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

        # Single source of truth for batting/bowling sides (innings 1-4 incl. Super Over)
        toss_done = bool(
            match and match['tossWinnerName'] and (match['tossDecision'] or '').strip()
        )
        batting_team = bowling_team = None
        innings_teams = {}
        if toss_done:
            batting_team, bowling_team = _teams_for_innings(conn, match_id, innings)
            for inn in (1, 2, 3, 4):
                bat, bowl = _teams_for_innings(conn, match_id, inn)
                innings_teams[str(inn)] = {'battingTeam': bat, 'bowlingTeam': bowl}

    max_overs = MAX_OVERS_PER_BOWLER.get(match['matchFormat']) if match else None

    # ── Build ready-to-render selection lists ─────────────────────────────
    # Every eligible player is INCLUDED (so the UI can show them) but flagged
    # selectable / disabled with a reason. Sorted by Playing XI role priority.
    ROLE_PRIORITY = {'Batsman': 1, 'WicketKeeper': 2, 'AllRounder': 3, 'Bowler': 4}
    BATTING_ORDER_RANK = {'Top Order': 1, 'Middle Order': 2, 'Lower Order': 3, 'Tail': 4}
    xi_list = [dict(r) for r in xi]
    name_map = {r['playerID']: r['playerName'] for r in xi_list}

    def _overs_bowled(pid):
        return bowler_overs.get(pid, {}).get('overs', 0)

    def _at_max(pid):
        return max_overs is not None and _overs_bowled(pid) >= max_overs

    def _sort_key(p):
        return (BATTING_ORDER_RANK.get(p.get('battingOrder'), 5),
                p.get('xiOrder') or 0,
                p.get('playerName') or '')

    # Bowling pool = bowling team's XI who can bowl (role OR bowling style)
    bowling_pool = [p for p in xi_list if p['teamName'] == bowling_team and p['canBowl']] if bowling_team else []
    # Are there OTHER bowlers still available? (drives the consecutive-over bypass)
    others_available = sum(
        1 for p in bowling_pool
        if p['playerID'] != last_over_bowler_id and not _at_max(p['playerID'])
    )

    batting_options = []
    if batting_team:
        for p in sorted([x for x in xi_list if x['teamName'] == batting_team], key=_sort_key):
            pid = p['playerID']
            reason = None
            if pid in dismissed_ids:
                reason = 'out'
            elif pid == striker_id:
                reason = 'batting'
            elif pid == nonstriker_id:
                reason = 'non-striker'
            opt = dict(p)
            opt['selectable'] = reason is None
            opt['disabled'] = reason is not None
            opt['reason'] = reason
            batting_options.append(opt)

    bowling_options = []
    for p in sorted(bowling_pool, key=_sort_key):
        pid = p['playerID']
        reason = None
        if _at_max(pid):
            reason = 'overs-complete'
        elif pid == last_over_bowler_id and others_available > 0:
            reason = 'bowled-last-over'
        opt = dict(p)
        opt['oversBowled'] = _overs_bowled(pid)
        opt['ballsThisOver'] = bowler_overs.get(pid, {}).get('balls', 0)
        opt['selectable'] = reason is None
        opt['disabled'] = reason is not None
        opt['reason'] = reason
        bowling_options.append(opt)

    return jsonify({
        'nextOver':          over,
        'nextBall':          next_ball,
        'totalRuns':         agg['totalRuns']  or 0,
        'wickets':           agg['wickets']    or 0,
        'legalBalls':        agg['legalBalls'] or 0,
        'tossDone':          toss_done if match else False,
        'battingTeam':       batting_team,
        'bowlingTeam':       bowling_team,
        'inningsTeams':      innings_teams,
        'players':           xi_list,
        'battingOptions':    batting_options,
        'bowlingOptions':    bowling_options,
        'match':             dict(match) if match else {},
        'dismissedPlayerIDs': dismissed_ids,
        'bowlerOvers':       bowler_overs,
        'maxOversPerBowler': max_overs,
        'lastOverBowlerID':  last_over_bowler_id,
        'strikerID':          striker_id,
        'strikerName':        name_map.get(striker_id),
        'nonStrikerID':       nonstriker_id,
        'nonStrikerName':     name_map.get(nonstriker_id),
        'bowlerID':           bowler_id,
        'bowlerName':         name_map.get(bowler_id),
        'freeHitPending':     free_hit_pending,
        'progress':           progress,
        'matchStatus':        (dict(match).get('matchStatus') if match else None),
    })


def save_match_state(conn, match_id, innings, striker_id, nonstriker_id, bowler_id, free_hit_pending=None):
    """Upsert the current innings context (striker / non-striker / bowler / free-hit)."""
    if free_hit_pending is None:
        prev = conn.execute(
            'SELECT freeHitPending FROM MatchState WHERE matchID=? AND inningsNumber=?',
            (match_id, innings)).fetchone()
        free_hit_pending = int(prev['freeHitPending']) if prev and 'freeHitPending' in prev.keys() and prev['freeHitPending'] else 0
    else:
        free_hit_pending = 1 if free_hit_pending else 0
    conn.execute(
        "INSERT INTO MatchState (matchID, inningsNumber, strikerID, nonStrikerID, bowlerID, freeHitPending) "
        "VALUES (?,?,?,?,?,?) "
        "ON CONFLICT(matchID, inningsNumber) DO UPDATE SET "
        "strikerID=excluded.strikerID, "
        "nonStrikerID=excluded.nonStrikerID, "
        "bowlerID=excluded.bowlerID, "
        "freeHitPending=excluded.freeHitPending",
        (match_id, innings, striker_id, nonstriker_id, bowler_id, free_hit_pending),
    )


def _batting_slot(conn, match_id, innings):
    """Return 1 or 2 - whether the team batting in this innings is team1 or team2.
    Uses the shared toss helper so innings 1-4 (incl. Super Over) stay consistent."""
    match = conn.execute(
        'SELECT team1Name FROM Matches WHERE matchID=?',
        (match_id,)).fetchone()
    if not match:
        return 1 if innings == 1 else 2
    batting_team, _ = _teams_for_innings(conn, match_id, innings)
    return 1 if batting_team == match['team1Name'] else 2


def _player_on_team(conn, match_id, player_id, team_name):
    """True if player is in this match's Playing XI for the given team."""
    if not player_id or not team_name:
        return False
    row = conn.execute('''
        SELECT 1 FROM PlayingXI px
        WHERE px.matchID=? AND px.playerID=?
          AND COALESCE(px.teamName,
                       (SELECT s.teamName FROM Squad s WHERE s.playerID=px.playerID LIMIT 1)) = ?
    ''', (match_id, player_id, team_name)).fetchone()
    return bool(row)


def _player_can_bowl(conn, player_id):
    """Bowlers, all-rounders, and any player with a bowling style may bowl."""
    row = conn.execute('''
        SELECT playerRole, bowlingStyle FROM Players WHERE playerID=?
    ''', (player_id,)).fetchone()
    if not row:
        return False
    if row['playerRole'] in ('Bowler', 'AllRounder'):
        return True
    style = (row['bowlingStyle'] or '').strip().lower()
    return bool(style and style != 'none')


def _recalc_match_totals(conn, match_id, innings):
    """Recompute innings runs/wickets and store them against the team that
    actually batted this innings. Returns (runs, wickets).
    Super Over innings (3 & 4) are NOT written to the main team totals — a
    Super Over does not change the tied scores of innings 1 & 2."""
    row = conn.execute('''
        SELECT COALESCE(SUM(runsScored+extras),0) AS r,
               COALESCE(SUM(wicketFallen),0)       AS w
        FROM BallByBall WHERE matchID=? AND inningsNumber=?
    ''', (match_id, innings)).fetchone()
    if innings >= 3:
        return row['r'], row['w']
    slot = _batting_slot(conn, match_id, innings)
    if slot == 1:
        conn.execute('UPDATE Matches SET team1TotalRuns=?, team1TotalWickets=? WHERE matchID=?',
                     (row['r'], row['w'], match_id))
    else:
        conn.execute('UPDATE Matches SET team2TotalRuns=?, team2TotalWickets=? WHERE matchID=?',
                     (row['r'], row['w'], match_id))
    return row['r'], row['w']


def _has_other_available_bowler(conn, match_id, innings, match_format, current_bowler):
    """True if a bowler OTHER than current_bowler still has overs available.
    Used to bypass the consecutive-over rule when only one bowler remains."""
    slot = _batting_slot(conn, match_id, innings)   # slot of the BATTING team
    match = conn.execute('SELECT team1Name, team2Name FROM Matches WHERE matchID=?',
                         (match_id,)).fetchone()
    if not match:
        return True
    bowling_team = match['team2Name'] if slot == 1 else match['team1Name']
    cands = conn.execute('''
        SELECT p.playerID FROM PlayingXI px JOIN Players p ON px.playerID = p.playerID
        WHERE px.matchID=? AND px.teamName=?
          AND (p.playerRole IN ('Bowler','AllRounder')
               OR (p.bowlingStyle IS NOT NULL AND TRIM(LOWER(p.bowlingStyle)) NOT IN ('', 'none')))
    ''', (match_id, bowling_team)).fetchall()
    if not cands:
        return True   # can't determine the bowling XI -> enforce the rule strictly
    max_overs = MAX_OVERS_PER_BOWLER.get(match_format)
    for c in cands:
        pid = c['playerID']
        if pid == current_bowler:
            continue
        if max_overs is None:
            return True
        legal = conn.execute('''
            SELECT SUM(CASE WHEN (extraType IS NULL OR extraType NOT IN ('Wide','NoBall','Retired'))
                            THEN 1 ELSE 0 END) AS lb
            FROM BallByBall WHERE matchID=? AND inningsNumber=? AND bowlerID=?
        ''', (match_id, innings, pid)).fetchone()['lb'] or 0
        if (legal // 6) < max_overs:
            return True
    return False


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
    per-format cap on the number of overs a single bowler may deliver.
    Super-over innings (3+) have no quota restrictions per ICC rules."""
    if innings >= 3:
        return None
    if ball != 1 or over <= 1:
        return None

    prev_over_row = conn.execute('''
        SELECT bowlerID FROM BallByBall
        WHERE matchID=? AND inningsNumber=? AND overNumber=?
        ORDER BY ballID DESC LIMIT 1
    ''', (match_id, innings, over - 1)).fetchone()
    if prev_over_row and prev_over_row['bowlerID'] == bowler:
        # Bypass the consecutive-over rule if this bowler is the only one
        # with overs remaining (per the documented business rule).
        if _has_other_available_bowler(conn, match_id, innings, match_format, bowler):
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
            match_row = conn.execute(
                'SELECT matchFormat, matchStatus, winnerName, tossWinnerName, tossDecision FROM Matches WHERE matchID=?',
                (match_id,)).fetchone()
            if not match_row:
                return jsonify({'error': 'Match not found'}), 404

            if not match_row['tossWinnerName'] or not (match_row['tossDecision'] or '').strip():
                return jsonify({'error': 'Toss must be completed before recording balls'}), 400

            batting_team, bowling_team = _teams_for_innings(conn, match_id, innings)
            if not batting_team or not bowling_team:
                return jsonify({'error': 'Could not resolve batting/bowling teams from toss'}), 400

            if not _player_on_team(conn, match_id, batsman, batting_team):
                return jsonify({'error': f'Batsman must be selected from the batting team ({batting_team})'}), 400
            if not _player_on_team(conn, match_id, bowler, bowling_team):
                return jsonify({'error': f'Bowler must be selected from the bowling team ({bowling_team})'}), 400
            if not _player_can_bowl(conn, bowler):
                return jsonify({'error': 'Selected player is not eligible to bowl'}), 400
            if nonstriker and not _player_on_team(conn, match_id, nonstriker, batting_team):
                return jsonify({'error': f'Non-striker must be from the batting team ({batting_team})'}), 400

            # ── ICC guard: reject deliveries once the innings/match is decided ──
            pre = evaluate_progress(conn, match_id, innings)
            if match_row['winnerName'] and (match_row['matchStatus'] or '') == 'completed':
                return jsonify({'error': 'Match already completed'}), 400
            if pre.get('matchComplete'):
                return jsonify({'error': 'Match already completed'}), 400
            if pre.get('inningsComplete'):
                msg = ('The Super Over innings is already complete'
                       if innings >= 3 else 'This innings is already complete '
                       '(overs finished or all out)')
                return jsonify({'error': msg}), 400

            rule_error = enforce_bowler_rules(conn, match_id, innings, match_row['matchFormat'], over, ball, bowler)
            if rule_error:
                return jsonify({'error': rule_error}), 400

            # -- Free-hit state (ICC): next ball after a NoBall is a free hit --
            prev_state = conn.execute(
                'SELECT freeHitPending, nonStrikerID FROM MatchState WHERE matchID=? AND inningsNumber=?',
                (match_id, innings)).fetchone()
            free_hit_now = bool(prev_state and prev_state['freeHitPending'])
            next_free = 0

            # On a free-hit ball, most bowler dismissals are illegal; run-out still counts.
            if free_hit_now and wicket and wicket_type:
                protected = {'Bowled', 'Caught', 'CaughtAndBowled', 'LBW', 'Stumped', 'HitWicket', 'HitTwice'}
                if wicket_type in protected:
                    return jsonify({
                        'error': f'{wicket_type} is not allowed on a free hit. Only run out / obstructing field apply.'
                    }), 400

            conn.execute(
                "INSERT INTO BallByBall "
                "(matchID, inningsNumber, overNumber, ballNumber, "
                "batsmanID, bowlerID, runsScored, extras, extraType, "
                "wicketFallen, dismissedPlayerID, wicketType, fielderID) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (match_id, innings, over, ball,
                 batsman, bowler, runs, extras, extra_type,
                 wicket, dismissed, wicket_type, fielder),
            )

            # Persist current innings context so it auto-restores on reload.
            if nonstriker is None:
                if prev_state and prev_state['nonStrikerID']:
                    nonstriker = prev_state['nonStrikerID']

            # Free-hit scheduling:
            # - NoBall always arms free hit for the next delivery (even chained no-balls)
            # - Wide during an active free hit keeps free hit pending (illegal ball)
            # - Any legal delivery consumes the free hit
            if extra_type == 'NoBall':
                next_free = 1
            elif free_hit_now and extra_type == 'Wide':
                next_free = 1
            else:
                next_free = 0

            save_match_state(conn, match_id, innings, batsman, nonstriker, bowler, free_hit_pending=next_free)

            # -- update match score totals (attributed to the batting team) --
            total_runs, total_wkts = _recalc_match_totals(conn, match_id, innings)

            # -- evaluate innings completion / target / result (ICC rules) --
            prog = evaluate_progress(conn, match_id, innings)
            _persist_match_result(conn, match_id, prog)

        return jsonify({'message': 'Ball recorded', 'totalRuns': total_runs,
                        'wickets': total_wkts, 'progress': prog,
                        'freeHitPending': bool(next_free),
                        'wasFreeHit': bool(free_hit_now),
                        'battingTeam': batting_team,
                        'bowlingTeam': bowling_team}), 201

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

            # ── update match score totals (attributed to the batting team) ──
            total_runs, total_wkts = _recalc_match_totals(conn, match_id, innings)

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
            _recalc_match_totals(conn, match_id, innings)
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
def _safe_div(n, d, digits=2):
    try:
        n = float(n or 0)
        d = float(d or 0)
        if d == 0:
            return 0.0
        return round(n / d, digits)
    except Exception:
        return 0.0


def _find_player(conn, name):
    name = (name or '').strip()
    if not name:
        return None
    row = conn.execute(
        'SELECT * FROM Players WHERE LOWER(playerName) = LOWER(?)',
        (name,)
    ).fetchone()
    if row:
        return row
    return conn.execute(
        'SELECT * FROM Players WHERE LOWER(playerName) LIKE ? ORDER BY LENGTH(playerName) ASC',
        (f'%{name.lower()}%',)
    ).fetchone()


def _find_team(conn, name):
    name = (name or '').strip()
    if not name:
        return None
    row = conn.execute(
        'SELECT * FROM Team WHERE LOWER(teamName) = LOWER(?)',
        (name,)
    ).fetchone()
    if row:
        return row
    return conn.execute(
        'SELECT * FROM Team WHERE LOWER(teamName) LIKE ? ORDER BY LENGTH(teamName) ASC',
        (f'%{name.lower()}%',)
    ).fetchone()


def _player_team_for_match(conn, match_id, player_id, team1, team2):
    """Resolve which side a player represented in a match."""
    row = conn.execute(
        'SELECT teamName FROM PlayingXI WHERE matchID=? AND playerID=?',
        (match_id, player_id)
    ).fetchone()
    if row and row['teamName']:
        return row['teamName']

    sq = conn.execute(
        '''SELECT teamName FROM Squad
           WHERE playerID=? AND teamName IN (?, ?)
           LIMIT 1''',
        (player_id, team1, team2)
    ).fetchone()
    if sq:
        return sq['teamName']

    p = conn.execute(
        'SELECT playerNationality FROM Players WHERE playerID=?',
        (player_id,)
    ).fetchone()
    if p:
        nat = (p['playerNationality'] or '').lower()
        if nat and nat == (team1 or '').lower():
            return team1
        if nat and nat == (team2 or '').lower():
            return team2
    return None


def _match_result_for_team(winner_name, team_name):
    if not winner_name:
        return 'NR'
    if not team_name:
        return 'NR'
    if winner_name == team_name:
        return 'Won'
    return 'Lost'


@app.route('/api/stats/player', methods=['GET'])
def get_player_stats():
    name = request.args.get('name', '')
    if not name:
        return jsonify({'error': 'Name required'}), 400

    with get_db() as conn:
        player = _find_player(conn, name)
        if not player:
            return jsonify({'error': 'Player not found'}), 404
        pid = player['playerID']

        batting = conn.execute('''
            SELECT
                COUNT(DISTINCT matchID) AS innings,
                COUNT(*) AS balls,
                COALESCE(SUM(runsScored), 0) AS runs,
                COALESCE(SUM(CASE WHEN runsScored = 4 THEN 1 ELSE 0 END), 0) AS fours,
                COALESCE(SUM(CASE WHEN runsScored = 6 THEN 1 ELSE 0 END), 0) AS sixes,
                COALESCE(SUM(CASE WHEN dismissedPlayerID = ? OR (wicketFallen = 1 AND batsmanID = ?) THEN 1 ELSE 0 END), 0) AS dismissals
            FROM BallByBall
            WHERE batsmanID = ?
        ''', (pid, pid, pid)).fetchone()

        hs_row = conn.execute('''
            SELECT MAX(match_runs) AS highScore FROM (
                SELECT matchID, SUM(runsScored) AS match_runs
                FROM BallByBall
                WHERE batsmanID = ?
                GROUP BY matchID
            )
        ''', (pid,)).fetchone()

        milestones = conn.execute('''
            SELECT
                SUM(CASE WHEN match_runs >= 100 THEN 1 ELSE 0 END) AS hundreds,
                SUM(CASE WHEN match_runs >= 50 AND match_runs < 100 THEN 1 ELSE 0 END) AS fifties
            FROM (
                SELECT matchID, SUM(runsScored) AS match_runs
                FROM BallByBall
                WHERE batsmanID = ?
                GROUP BY matchID
            )
        ''', (pid,)).fetchone()

        bowling = conn.execute('''
            SELECT
                COUNT(DISTINCT matchID) AS innings,
                COALESCE(SUM(CASE WHEN extraType IS NULL OR extraType NOT IN ('Wide','NoBall') THEN 1 ELSE 0 END), 0) AS balls,
                COALESCE(SUM(runsScored + COALESCE(extras, 0)), 0) AS runsConceded,
                COALESCE(SUM(wicketFallen), 0) AS wickets,
                COALESCE(SUM(CASE
                    WHEN (extraType IS NULL OR extraType NOT IN ('Wide','NoBall'))
                         AND COALESCE(runsScored,0)=0 AND COALESCE(extras,0)=0 AND COALESCE(wicketFallen,0)=0
                    THEN 1 ELSE 0 END), 0) AS dots
            FROM BallByBall
            WHERE bowlerID = ?
        ''', (pid,)).fetchone()

        best = conn.execute('''
            SELECT wickets, runsConceded FROM (
                SELECT matchID,
                       SUM(wicketFallen) AS wickets,
                       SUM(runsScored + COALESCE(extras,0)) AS runsConceded
                FROM BallByBall
                WHERE bowlerID = ?
                GROUP BY matchID
            )
            ORDER BY wickets DESC, runsConceded ASC
            LIMIT 1
        ''', (pid,)).fetchone()

        matches_played = conn.execute('''
            SELECT COUNT(DISTINCT matchID) AS c FROM (
                SELECT matchID FROM BallByBall WHERE batsmanID = ? OR bowlerID = ?
                UNION
                SELECT matchID FROM PlayingXI WHERE playerID = ?
            )
        ''', (pid, pid, pid)).fetchone()['c'] or 0

        recent_matches = conn.execute('''
            SELECT m.*
            FROM Matches m
            WHERE m.matchID IN (
                SELECT DISTINCT matchID FROM BallByBall WHERE batsmanID = ? OR bowlerID = ?
                UNION
                SELECT matchID FROM PlayingXI WHERE playerID = ?
            )
            ORDER BY COALESCE(m.matchDate, '') DESC, m.matchID DESC
            LIMIT 8
        ''', (pid, pid, pid)).fetchall()

        recent = []
        for m in recent_matches:
            mid = m['matchID']
            bat_m = conn.execute('''
                SELECT COALESCE(SUM(runsScored),0) AS runs,
                       COUNT(*) AS balls,
                       COALESCE(SUM(CASE WHEN runsScored=4 THEN 1 ELSE 0 END),0) AS fours,
                       COALESCE(SUM(CASE WHEN runsScored=6 THEN 1 ELSE 0 END),0) AS sixes
                FROM BallByBall WHERE matchID=? AND batsmanID=?
            ''', (mid, pid)).fetchone()
            bowl_m = conn.execute('''
                SELECT COALESCE(SUM(wicketFallen),0) AS wickets,
                       COALESCE(SUM(runsScored + COALESCE(extras,0)),0) AS bowlRuns
                FROM BallByBall WHERE matchID=? AND bowlerID=?
            ''', (mid, pid)).fetchone()
            pteam = _player_team_for_match(conn, mid, pid, m['team1Name'], m['team2Name'])
            result = _match_result_for_team(m['winnerName'], pteam)
            runs = bat_m['runs'] or 0
            balls = bat_m['balls'] or 0
            recent.append({
                'matchID': mid,
                'matchDate': m['matchDate'],
                'matchFormat': m['matchFormat'],
                'team1Name': m['team1Name'],
                'team2Name': m['team2Name'],
                'matchLabel': f"{m['team1Name']} vs {m['team2Name']}",
                'opponent': (m['team2Name'] if pteam == m['team1Name'] else m['team1Name']) if pteam else None,
                'playerTeam': pteam,
                'runs': runs,
                'balls': balls,
                'fours': bat_m['fours'] or 0,
                'sixes': bat_m['sixes'] or 0,
                'strikeRate': _safe_div(runs * 100, balls, 1),
                'wickets': bowl_m['wickets'] or 0,
                'bowlRuns': bowl_m['bowlRuns'] or 0,
                'result': result,
                'teamResult': result,
            })

        yearly_rows = conn.execute('''
            SELECT year,
                   COUNT(DISTINCT matchID) AS matches,
                   SUM(runs) AS runs,
                   SUM(balls) AS balls,
                   SUM(dismissals) AS dismissals,
                   SUM(wickets) AS wickets,
                   SUM(bowlRuns) AS bowlRuns
            FROM (
                SELECT SUBSTR(COALESCE(m.matchDate,''), 1, 4) AS year,
                       m.matchID AS matchID,
                       COALESCE(SUM(CASE WHEN b.batsmanID = ? THEN b.runsScored ELSE 0 END), 0) AS runs,
                       COALESCE(SUM(CASE WHEN b.batsmanID = ? THEN 1 ELSE 0 END), 0) AS balls,
                       COALESCE(SUM(CASE WHEN b.dismissedPlayerID = ? OR (b.wicketFallen=1 AND b.batsmanID=?) THEN 1 ELSE 0 END), 0) AS dismissals,
                       COALESCE(SUM(CASE WHEN b.bowlerID = ? THEN b.wicketFallen ELSE 0 END), 0) AS wickets,
                       COALESCE(SUM(CASE WHEN b.bowlerID = ? THEN b.runsScored + COALESCE(b.extras,0) ELSE 0 END), 0) AS bowlRuns
                FROM BallByBall b
                JOIN Matches m ON m.matchID = b.matchID
                WHERE b.batsmanID = ? OR b.bowlerID = ?
                GROUP BY m.matchID
            )
            WHERE year IS NOT NULL AND year != ''
            GROUP BY year
            ORDER BY year ASC
        ''', (pid, pid, pid, pid, pid, pid, pid, pid)).fetchall()

        yearly = []
        for y in yearly_rows:
            runs = y['runs'] or 0
            balls = y['balls'] or 0
            dismissals = y['dismissals'] or 0
            yearly.append({
                'year': y['year'],
                'matches': y['matches'] or 0,
                'runs': runs,
                'balls': balls,
                'average': _safe_div(runs, dismissals, 2) if dismissals else float(runs),
                'strikeRate': _safe_div(runs * 100, balls, 1),
                'wickets': y['wickets'] or 0,
                'bowlRuns': y['bowlRuns'] or 0,
            })

        bat = dict(batting)
        bowl = dict(bowling)
        bat_runs = bat.get('runs') or 0
        bat_balls = bat.get('balls') or 0
        bat_dismissals = bat.get('dismissals') or 0
        bowl_balls = bowl.get('balls') or 0
        bowl_runs = bowl.get('runsConceded') or 0
        bowl_wkts = bowl.get('wickets') or 0

        best_figures = '—'
        if best and (best['wickets'] or 0) > 0:
            best_figures = f"{int(best['wickets'] or 0)}/{int(best['runsConceded'] or 0)}"

        return jsonify({
            'player': dict(player),
            'playerName': player['playerName'],
            'matchesPlayed': matches_played,
            'batting': {
                'innings': bat.get('innings') or 0,
                'runs': bat_runs,
                'balls': bat_balls,
                'fours': bat.get('fours') or 0,
                'sixes': bat.get('sixes') or 0,
                'dismissals': bat_dismissals,
                'average': _safe_div(bat_runs, bat_dismissals, 2) if bat_dismissals else float(bat_runs),
                'strikeRate': _safe_div(bat_runs * 100, bat_balls, 1),
                'highScore': (hs_row['highScore'] if hs_row else 0) or 0,
                'topScore': (hs_row['highScore'] if hs_row else 0) or 0,
                'fifties': (milestones['fifties'] if milestones else 0) or 0,
                'hundreds': (milestones['hundreds'] if milestones else 0) or 0,
            },
            'bowling': {
                'innings': bowl.get('innings') or 0,
                'balls': bowl_balls,
                'runsConceded': bowl_runs,
                'wickets': bowl_wkts,
                'dots': bowl.get('dots') or 0,
                'maidens': 0,
                'average': _safe_div(bowl_runs, bowl_wkts, 2) if bowl_wkts else 0.0,
                'economy': _safe_div(bowl_runs, (bowl_balls / 6.0), 2) if bowl_balls else 0.0,
                'bestFigures': best_figures,
            },
            'recent': recent,
            'yearly': yearly,
        })


@app.route('/api/stats/h2h', methods=['GET'])
def get_h2h():
    t1_in = request.args.get('team1', '')
    t2_in = request.args.get('team2', '')
    if not t1_in or not t2_in:
        return jsonify({'error': 'Two teams required'}), 400

    with get_db() as conn:
        t1row = _find_team(conn, t1_in)
        t2row = _find_team(conn, t2_in)
        t1 = t1row['teamName'] if t1row else t1_in.strip()
        t2 = t2row['teamName'] if t2row else t2_in.strip()

        matches = conn.execute('''
            SELECT *
            FROM Matches
            WHERE (team1Name = ? AND team2Name = ?) OR (team1Name = ? AND team2Name = ?)
            ORDER BY COALESCE(matchDate, '') DESC, matchID DESC
        ''', (t1, t2, t2, t1)).fetchall()

        def blank_side():
            return {
                'wins': 0,
                'losses': 0,
                'runsScored': 0,
                'runsConceded': 0,
                'wicketsTaken': 0,
                'wicketsLost': 0,
                'highestTotal': 0,
                'lowestTotal': None,
                'totals': [],
            }

        s1 = blank_side()
        s2 = blank_side()
        draws = 0
        history = []

        for m in matches:
            m = dict(m)
            if m['team1Name'] == t1:
                t1_runs, t1_wkts = m.get('team1TotalRuns') or 0, m.get('team1TotalWickets') or 0
                t2_runs, t2_wkts = m.get('team2TotalRuns') or 0, m.get('team2TotalWickets') or 0
            else:
                t1_runs, t1_wkts = m.get('team2TotalRuns') or 0, m.get('team2TotalWickets') or 0
                t2_runs, t2_wkts = m.get('team1TotalRuns') or 0, m.get('team1TotalWickets') or 0

            winner = m.get('winnerName')
            if winner == t1:
                s1['wins'] += 1
                s2['losses'] += 1
            elif winner == t2:
                s2['wins'] += 1
                s1['losses'] += 1
            else:
                draws += 1

            s1['runsScored'] += t1_runs
            s1['runsConceded'] += t2_runs
            s1['wicketsTaken'] += t2_wkts
            s1['wicketsLost'] += t1_wkts
            s1['totals'].append(t1_runs)

            s2['runsScored'] += t2_runs
            s2['runsConceded'] += t1_runs
            s2['wicketsTaken'] += t1_wkts
            s2['wicketsLost'] += t2_wkts
            s2['totals'].append(t2_runs)

            history.append({
                'matchID': m['matchID'],
                'matchDate': m.get('matchDate'),
                'matchFormat': m.get('matchFormat'),
                'team1Name': m.get('team1Name'),
                'team2Name': m.get('team2Name'),
                'winnerName': winner,
                'winMargin': m.get('winMargin'),
                'team1TotalRuns': m.get('team1TotalRuns') or 0,
                'team1TotalWickets': m.get('team1TotalWickets') or 0,
                'team2TotalRuns': m.get('team2TotalRuns') or 0,
                'team2TotalWickets': m.get('team2TotalWickets') or 0,
            })

        def finalize(side):
            totals = side.pop('totals')
            side['highestTotal'] = max(totals) if totals else 0
            nonzero = [x for x in totals if x is not None]
            side['lowestTotal'] = min(nonzero) if nonzero else 0
            side['avgRuns'] = _safe_div(side['runsScored'], len(matches), 1) if matches else 0
            side['winPct'] = _safe_div(side['wins'] * 100, len(matches), 1) if matches else 0
            return side

        s1 = finalize(s1)
        s2 = finalize(s2)
        played = len(matches)

        return jsonify({
            'team1': t1,
            'team2': t2,
            t1: s1['wins'],
            t2: s2['wins'],
            'draw': draws,
            'summary': {
                'played': played,
                'draws': draws,
            },
            'side1': s1,
            'side2': s2,
            'matches': history,
        })


@app.route('/api/stats/player_vs_player', methods=['GET'])
def get_pvp():
    bat_name = request.args.get('batsman', '')
    bowl_name = request.args.get('bowler', '')
    if not bat_name or not bowl_name:
        return jsonify({'error': 'batsman and bowler are required'}), 400

    with get_db() as conn:
        p1 = _find_player(conn, bat_name)
        p2 = _find_player(conn, bowl_name)
        if not p1 or not p2:
            return jsonify({'error': 'Players not found'}), 404

        bat_id = p1['playerID']
        bowl_id = p2['playerID']

        def duel_stats(batsman_id, bowler_id):
            row = conn.execute('''
                SELECT
                    COUNT(*) AS balls,
                    COALESCE(SUM(runsScored), 0) AS runs,
                    COALESCE(SUM(wicketFallen), 0) AS dismissals,
                    COALESCE(SUM(CASE WHEN runsScored = 4 THEN 1 ELSE 0 END), 0) AS fours,
                    COALESCE(SUM(CASE WHEN runsScored = 6 THEN 1 ELSE 0 END), 0) AS sixes,
                    COUNT(DISTINCT matchID) AS matches
                FROM BallByBall
                WHERE batsmanID = ? AND bowlerID = ?
            ''', (batsman_id, bowler_id)).fetchone()
            d = dict(row)
            balls = d.get('balls') or 0
            runs = d.get('runs') or 0
            d['strikeRate'] = _safe_div(runs * 100, balls, 1)
            d['economy'] = _safe_div(runs, (balls / 6.0), 2) if balls else 0.0
            return d

        duel = duel_stats(bat_id, bowl_id)
        reverse = duel_stats(bowl_id, bat_id)

        match_ids = conn.execute('''
            SELECT DISTINCT matchID FROM BallByBall
            WHERE batsmanID = ? AND bowlerID = ?
            ORDER BY matchID DESC
        ''', (bat_id, bowl_id)).fetchall()

        matches = []
        winning_perf = 0
        team_wins = 0
        team_losses = 0

        rev_winning_perf = 0
        rev_team_wins = 0
        rev_team_losses = 0

        rev_match_ids = conn.execute('''
            SELECT DISTINCT matchID FROM BallByBall
            WHERE batsmanID = ? AND bowlerID = ?
        ''', (bowl_id, bat_id)).fetchall()

        for row in match_ids:
            mid = row['matchID']
            m = conn.execute('SELECT * FROM Matches WHERE matchID=?', (mid,)).fetchone()
            if not m:
                continue
            m = dict(m)
            face = conn.execute('''
                SELECT COALESCE(SUM(runsScored),0) AS runs,
                       COUNT(*) AS balls,
                       COALESCE(SUM(wicketFallen),0) AS wickets,
                       COALESCE(SUM(CASE WHEN runsScored=4 THEN 1 ELSE 0 END),0) AS fours,
                       COALESCE(SUM(CASE WHEN runsScored=6 THEN 1 ELSE 0 END),0) AS sixes
                FROM BallByBall
                WHERE matchID=? AND batsmanID=? AND bowlerID=?
            ''', (mid, bat_id, bowl_id)).fetchone()

            bat_team = _player_team_for_match(conn, mid, bat_id, m['team1Name'], m['team2Name'])
            result = _match_result_for_team(m.get('winnerName'), bat_team)
            runs = face['runs'] or 0
            wkts = face['wickets'] or 0
            is_win_perf = (result == 'Won') and (runs >= 20 or wkts >= 1)
            if result == 'Won':
                team_wins += 1
            elif result == 'Lost':
                team_losses += 1
            if is_win_perf:
                winning_perf += 1

            matches.append({
                'matchID': mid,
                'matchDate': m.get('matchDate'),
                'matchFormat': m.get('matchFormat'),
                'team1Name': m.get('team1Name'),
                'team2Name': m.get('team2Name'),
                'matchLabel': f"{m.get('team1Name')} vs {m.get('team2Name')}",
                'runs': runs,
                'balls': face['balls'] or 0,
                'wickets': wkts,
                'fours': face['fours'] or 0,
                'sixes': face['sixes'] or 0,
                'winningPerformance': is_win_perf,
                'batsmanTeam': bat_team,
                'batsmanTeamResult': result,
                'teamResult': result,
            })

        for row in rev_match_ids:
            mid = row['matchID']
            m = conn.execute('SELECT * FROM Matches WHERE matchID=?', (mid,)).fetchone()
            if not m:
                continue
            m = dict(m)
            face = conn.execute('''
                SELECT COALESCE(SUM(runsScored),0) AS runs,
                       COALESCE(SUM(wicketFallen),0) AS wickets
                FROM BallByBall
                WHERE matchID=? AND batsmanID=? AND bowlerID=?
            ''', (mid, bowl_id, bat_id)).fetchone()
            bowl_as_bat_team = _player_team_for_match(conn, mid, bowl_id, m['team1Name'], m['team2Name'])
            result = _match_result_for_team(m.get('winnerName'), bowl_as_bat_team)
            runs = face['runs'] or 0
            wkts = face['wickets'] or 0
            is_win_perf = (result == 'Won') and (runs >= 20 or wkts >= 1)
            if result == 'Won':
                rev_team_wins += 1
            elif result == 'Lost':
                rev_team_losses += 1
            if is_win_perf:
                rev_winning_perf += 1

        duel['winningPerformances'] = winning_perf
        duel['teamWinsWhenFacing'] = team_wins
        duel['teamLossesWhenFacing'] = team_losses
        reverse['winningPerformances'] = rev_winning_perf
        reverse['teamWinsWhenFacing'] = rev_team_wins
        reverse['teamLossesWhenFacing'] = rev_team_losses

        return jsonify({
            'batsman': {
                'playerID': bat_id,
                'name': p1['playerName'],
                'role': p1['playerRole'],
            },
            'bowler': {
                'playerID': bowl_id,
                'name': p2['playerName'],
                'role': p2['playerRole'],
            },
            'balls': duel.get('balls') or 0,
            'runs': duel.get('runs') or 0,
            'dismissals': duel.get('dismissals') or 0,
            'duel': duel,
            'reverse': reverse,
            'matches': matches,
        })


@app.route('/api/stats/player_vs_team', methods=['GET'])
def get_pvt():
    player_name = request.args.get('player', '')
    team_in = request.args.get('team', '')
    if not player_name or not team_in:
        return jsonify({'error': 'player and team are required'}), 400

    with get_db() as conn:
        p = _find_player(conn, player_name)
        if not p:
            return jsonify({'error': 'Player not found'}), 404
        trow = _find_team(conn, team_in)
        team = trow['teamName'] if trow else team_in.strip()
        pid = p['playerID']

        candidates = conn.execute('''
            SELECT m.*
            FROM Matches m
            WHERE (m.team1Name = ? OR m.team2Name = ?)
              AND m.matchID IN (
                  SELECT matchID FROM BallByBall WHERE batsmanID = ? OR bowlerID = ?
                  UNION
                  SELECT matchID FROM PlayingXI WHERE playerID = ?
              )
            ORDER BY COALESCE(m.matchDate, '') DESC, m.matchID DESC
        ''', (team, team, pid, pid, pid)).fetchall()

        matches = []
        total_runs = total_balls = total_dismissals = 0
        total_fours = total_sixes = 0
        total_wkts = total_bowl_runs = 0
        team_wins = team_losses = 0
        high_score = 0
        innings = 0
        player_team_guess = None

        for m in candidates:
            m = dict(m)
            pteam = _player_team_for_match(conn, m['matchID'], pid, m['team1Name'], m['team2Name'])
            if pteam == team:
                continue
            if team not in (m['team1Name'], m['team2Name']):
                continue
            if pteam and pteam not in (m['team1Name'], m['team2Name']):
                continue
            if pteam and ((pteam == m['team1Name'] and m['team2Name'] != team) or
                          (pteam == m['team2Name'] and m['team1Name'] != team)):
                continue

            if not player_team_guess and pteam:
                player_team_guess = pteam

            bat_m = conn.execute('''
                SELECT COALESCE(SUM(runsScored),0) AS runs,
                       COUNT(*) AS balls,
                       COALESCE(SUM(CASE WHEN runsScored=4 THEN 1 ELSE 0 END),0) AS fours,
                       COALESCE(SUM(CASE WHEN runsScored=6 THEN 1 ELSE 0 END),0) AS sixes,
                       COALESCE(SUM(CASE WHEN dismissedPlayerID = ? OR (wicketFallen=1 AND batsmanID=?) THEN 1 ELSE 0 END),0) AS dismissals
                FROM BallByBall
                WHERE matchID=? AND batsmanID=?
            ''', (pid, pid, m['matchID'], pid)).fetchone()

            bowl_m = conn.execute('''
                SELECT COALESCE(SUM(wicketFallen),0) AS wickets,
                       COALESCE(SUM(runsScored + COALESCE(extras,0)),0) AS bowlRuns,
                       COALESCE(SUM(CASE WHEN extraType IS NULL OR extraType NOT IN ('Wide','NoBall') THEN 1 ELSE 0 END),0) AS balls
                FROM BallByBall
                WHERE matchID=? AND bowlerID=?
            ''', (m['matchID'], pid)).fetchone()

            runs = bat_m['runs'] or 0
            balls = bat_m['balls'] or 0
            if balls > 0 or runs > 0:
                innings += 1
            if runs > high_score:
                high_score = runs

            total_runs += runs
            total_balls += balls
            total_dismissals += bat_m['dismissals'] or 0
            total_fours += bat_m['fours'] or 0
            total_sixes += bat_m['sixes'] or 0
            total_wkts += bowl_m['wickets'] or 0
            total_bowl_runs += bowl_m['bowlRuns'] or 0

            result = _match_result_for_team(m.get('winnerName'), pteam)
            if result == 'Won':
                team_wins += 1
            elif result == 'Lost':
                team_losses += 1

            matches.append({
                'matchID': m['matchID'],
                'matchDate': m.get('matchDate'),
                'matchFormat': m.get('matchFormat'),
                'team1Name': m.get('team1Name'),
                'team2Name': m.get('team2Name'),
                'matchLabel': f"{m.get('team1Name')} vs {m.get('team2Name')}",
                'playerTeam': pteam,
                'runs': runs,
                'balls': balls,
                'fours': bat_m['fours'] or 0,
                'sixes': bat_m['sixes'] or 0,
                'strikeRate': _safe_div(runs * 100, balls, 1),
                'wickets': bowl_m['wickets'] or 0,
                'bowlRuns': bowl_m['bowlRuns'] or 0,
                'result': result,
            })

        played = len(matches)
        summary = {
            'matches': played,
            'innings': innings,
            'runs': total_runs,
            'balls': total_balls,
            'dismissals': total_dismissals,
            'average': _safe_div(total_runs, total_dismissals, 2) if total_dismissals else float(total_runs),
            'strikeRate': _safe_div(total_runs * 100, total_balls, 1),
            'fours': total_fours,
            'sixes': total_sixes,
            'highScore': high_score,
            'wickets': total_wkts,
            'bowlRuns': total_bowl_runs,
            'bowlAverage': _safe_div(total_bowl_runs, total_wkts, 2) if total_wkts else 0.0,
            'teamWins': team_wins,
            'teamLosses': team_losses,
            'winPct': _safe_div(team_wins * 100, played, 1) if played else 0.0,
        }

        return jsonify({
            'playerName': p['playerName'],
            'playerID': pid,
            'playerTeam': player_team_guess,
            'team': team,
            'runs': total_runs,
            'summary': summary,
            'matches': matches,
        })



# ─────────────────────────────────────────────────────
# GLOBAL SEARCH  —  players, teams, tournaments, matches
# ─────────────────────────────────────────────────────
@app.route('/api/search', methods=['GET'])
def global_search():
    q = (request.args.get('q') or '').strip()
    if not q or len(q) < 1:
        return jsonify({'players': [], 'teams': [], 'tournaments': [], 'matches': []})
    like = f'%{q}%'
    with get_db() as conn:
        players = conn.execute(
            "SELECT playerID, playerName, playerNationality, playerRole "
            "FROM Players WHERE playerName LIKE ? ORDER BY playerName LIMIT 8",
            (like,)).fetchall()
        teams = conn.execute(
            "SELECT teamName, country, ranking FROM Team "
            "WHERE teamName LIKE ? OR country LIKE ? ORDER BY ranking LIMIT 8",
            (like, like)).fetchall()
        tournaments = conn.execute(
            "SELECT tournamentName, format FROM Tournament "
            "WHERE tournamentName LIKE ? ORDER BY tournamentName LIMIT 8",
            (like,)).fetchall()
        matches = conn.execute(
            "SELECT matchID, tournamentName, matchFormat, team1Name, team2Name, winnerName, matchDate "
            "FROM Matches WHERE tournamentName LIKE ? OR team1Name LIKE ? OR team2Name LIKE ? "
            "ORDER BY matchID DESC LIMIT 8",
            (like, like, like)).fetchall()
    return jsonify({
        'players': [dict(r) for r in players],
        'teams': [dict(r) for r in teams],
        'tournaments': [dict(r) for r in tournaments],
        'matches': [dict(r) for r in matches],
    })


# ─────────────────────────────────────────────────────
# RECORDS BOOK  —  aggregate hall-of-fame stats
# ─────────────────────────────────────────────────────
@app.route('/api/stats/records', methods=['GET'])
def stats_records():
    fmt = (request.args.get('format') or '').strip()
    jm = " JOIN Matches m ON b.matchID = m.matchID " if fmt else ""
    fw = " AND m.matchFormat = ? " if fmt else ""
    p = (fmt,) if fmt else ()

    with get_db() as conn:
        most_runs = conn.execute(
            "SELECT p.playerName, p.playerNationality, SUM(b.runsScored) AS val "
            "FROM BallByBall b" + jm + " JOIN Players p ON p.playerID = b.batsmanID "
            "WHERE 1=1" + fw + " GROUP BY b.batsmanID HAVING val > 0 "
            "ORDER BY val DESC LIMIT 5", p).fetchall()

        most_wickets = conn.execute(
            "SELECT p.playerName, p.playerNationality, "
            "SUM(CASE WHEN b.wicketFallen=1 AND (b.wicketType IS NULL OR b.wicketType != 'RetiredOut') THEN 1 ELSE 0 END) AS val "
            "FROM BallByBall b" + jm + " JOIN Players p ON p.playerID = b.bowlerID "
            "WHERE 1=1" + fw + " GROUP BY b.bowlerID HAVING val > 0 "
            "ORDER BY val DESC LIMIT 5", p).fetchall()

        most_sixes = conn.execute(
            "SELECT p.playerName, p.playerNationality, COUNT(*) AS val "
            "FROM BallByBall b" + jm + " JOIN Players p ON p.playerID = b.batsmanID "
            "WHERE b.runsScored = 6" + fw + " GROUP BY b.batsmanID "
            "ORDER BY val DESC LIMIT 5", p).fetchall()

        most_fours = conn.execute(
            "SELECT p.playerName, p.playerNationality, COUNT(*) AS val "
            "FROM BallByBall b" + jm + " JOIN Players p ON p.playerID = b.batsmanID "
            "WHERE b.runsScored = 4" + fw + " GROUP BY b.batsmanID "
            "ORDER BY val DESC LIMIT 5", p).fetchall()

        # Highest individual score in a single match/innings
        top_knocks = conn.execute(
            "SELECT p.playerName, p.playerNationality, b.matchID, "
            "SUM(b.runsScored) AS val "
            "FROM BallByBall b" + jm + " JOIN Players p ON p.playerID = b.batsmanID "
            "WHERE 1=1" + fw + " GROUP BY b.matchID, b.inningsNumber, b.batsmanID "
            "HAVING val > 0 ORDER BY val DESC LIMIT 5", p).fetchall()

        # Best bowling in a match/innings (most wickets, then fewest runs)
        best_bowling = conn.execute(
            "SELECT p.playerName, p.playerNationality, b.matchID, "
            "SUM(CASE WHEN b.wicketFallen=1 AND (b.wicketType IS NULL OR b.wicketType != 'RetiredOut') THEN 1 ELSE 0 END) AS wkts, "
            "SUM(b.runsScored + b.extras) AS conceded "
            "FROM BallByBall b" + jm + " JOIN Players p ON p.playerID = b.bowlerID "
            "WHERE 1=1" + fw + " GROUP BY b.matchID, b.inningsNumber, b.bowlerID "
            "HAVING wkts > 0 ORDER BY wkts DESC, conceded ASC LIMIT 5", p).fetchall()

    def rows(rs):
        return [dict(r) for r in rs]

    return jsonify({
        'format': fmt or 'ALL',
        'mostRuns': rows(most_runs),
        'mostWickets': rows(most_wickets),
        'mostSixes': rows(most_sixes),
        'mostFours': rows(most_fours),
        'topKnocks': rows(top_knocks),
        'bestBowling': rows(best_bowling),
    })


@app.route('/api/stats/ai-insight', methods=['GET'])
def ai_insight():
    """Lightweight rotating insight for the nav pill."""
    import time as _t
    with get_db() as conn:
        top_bat = conn.execute("""
            SELECT p.playerName, SUM(b.runsScored) AS runs
            FROM BallByBall b JOIN Players p ON p.playerID = b.batsmanID
            GROUP BY b.batsmanID
            ORDER BY runs DESC LIMIT 1
        """).fetchone()
        top_bowl = conn.execute("""
            SELECT p.playerName, SUM(b.wicketFallen) AS wickets
            FROM BallByBall b JOIN Players p ON p.playerID = b.bowlerID
            GROUP BY b.bowlerID
            ORDER BY wickets DESC LIMIT 1
        """).fetchone()
        matches = conn.execute('SELECT COUNT(*) AS c FROM Matches').fetchone()['c'] or 0
        completed = conn.execute(
            "SELECT COUNT(*) AS c FROM Matches WHERE winnerName IS NOT NULL AND winnerName != ''"
        ).fetchone()['c'] or 0

    tips = []
    if top_bat and top_bat['runs']:
        tips.append(f"Top run-scorer: {top_bat['playerName']} ({int(top_bat['runs'])} runs)")
    if top_bowl and top_bowl['wickets']:
        tips.append(f"Leading wicket-taker: {top_bowl['playerName']} ({int(top_bowl['wickets'])} wkts)")
    tips.append(f"{completed}/{matches} matches completed in the system")
    tips.append('Use AI Stats to compare players, teams & head-to-heads')
    tip = tips[int(_t.time() // 60) % len(tips)]
    return jsonify({'insight': tip, 'tips': tips})


# Match Completion
# ─────────────────────────────────────────────────────
def compute_standings(conn, name, match_group=None):
    """Lightweight qualification ranking for auto-advance.
    Ranks teams by (points, wins, run difference) using completed matches.
    If match_group is given, only that pool's Group-Stage matches count."""
    q = ("SELECT team1Name, team2Name, team1TotalRuns, team2TotalRuns, winnerName "
         "FROM Matches WHERE tournamentName=? AND status='Completed'")
    params = [name]
    if match_group:
        q += " AND matchGroup=?"; params.append(match_group)
    rows = conn.execute(q, params).fetchall()
    tbl = {}

    def slot(t):
        if t and t != 'TBD':
            tbl.setdefault(t, {'teamName': t, 'P': 0, 'W': 0, 'L': 0, 'Pts': 0, 'diff': 0})

    for m in rows:
        t1, t2 = m['team1Name'], m['team2Name']
        slot(t1); slot(t2)
        if t1 in tbl:
            tbl[t1]['P'] += 1; tbl[t1]['diff'] += (m['team1TotalRuns'] or 0) - (m['team2TotalRuns'] or 0)
        if t2 in tbl:
            tbl[t2]['P'] += 1; tbl[t2]['diff'] += (m['team2TotalRuns'] or 0) - (m['team1TotalRuns'] or 0)
        w = m['winnerName']
        if w and w in tbl:
            tbl[w]['W'] += 1; tbl[w]['Pts'] += 2
            loser = t2 if w == t1 else t1
            if loser in tbl:
                tbl[loser]['L'] += 1
    return sorted(tbl.values(), key=lambda r: (-r['Pts'], -r['W'], -r['diff'], r['teamName']))


def compute_pool_standings(conn, name, match_group):
    return compute_standings(conn, name, match_group)


def _set_slot(conn, match_id, slot, team):
    if team and team != 'TBD':
        conn.execute(f"UPDATE Matches SET {slot}=? WHERE matchID=?", (team, match_id))


def _find_match(conn, name, match_type, group=None):
    q = "SELECT * FROM Matches WHERE tournamentName=? AND matchType=?"
    params = [name, match_type]
    if group:
        q += " AND matchGroup=?"; params.append(group)
    q += " ORDER BY sequenceNumber ASC, matchID ASC LIMIT 1"
    return conn.execute(q, params).fetchone()


def _fill_next_open_slot(conn, name, match_type, team):
    """Put team into the first TBD slot of the next matching fixture."""
    if not team:
        return
    nm = conn.execute(
        "SELECT * FROM Matches WHERE tournamentName=? AND matchType=? "
        "AND (status='Scheduled' OR status IS NULL) ORDER BY sequenceNumber ASC, matchID ASC",
        (name, match_type)).fetchall()
    for m in nm:
        if m['team1Name'] == 'TBD':
            _set_slot(conn, m['matchID'], 'team1Name', team); return
        if m['team2Name'] == 'TBD':
            _set_slot(conn, m['matchID'], 'team2Name', team); return


def _group_stage_complete(conn, name, group=None):
    q = ("SELECT COUNT(*) c FROM Matches WHERE tournamentName=? "
         "AND matchType IN ('Group-Stage','League') AND status!='Completed'")
    params = [name]
    if group:
        q += " AND matchGroup=?"; params.append(group)
    return conn.execute(q, params).fetchone()['c'] == 0


def _auto_advance(conn, name, match):
    """Fill TBD knockout slots after a match completes, based on the schedule format."""
    mtype = match['matchType']
    winner = match['winnerName']
    loser = None
    if winner:
        loser = match['team2Name'] if winner == match['team1Name'] else match['team1Name']

    # Knockout progression maps (winner/loser routing)
    KO_MAPS = {
        'SF-1':         {'w': ('Final', 'team1Name', None),      'l': ('3rd-Place-SF', 'team1Name', None)},
        'SF-2':         {'w': ('SF-Final', 'team2Name', None),   'l': ('3rd-Place-SF', 'team2Name', None)},
        '3rd-Place-SF': {'w': ('SF-Final', 'team1Name', None),   'l': None},
        'SF-Final':     {'w': ('Final', 'team2Name', None),      'l': None},
        'Qualifier-1':  {'w': ('Final', 'team1Name', None),      'l': ('Qualifier-2', 'team1Name', None)},
        'Eliminator':   {'w': ('Qualifier-2', 'team2Name', None),'l': None},
        'Qualifier-2':  {'w': ('Final', 'team2Name', None),      'l': None},
        '1st-Place-Match': {'w': ('Final', 'team1Name', None),   'l': None},
        '2nd-Place-PO':    {'w': ('Final', 'team2Name', None),   'l': None},
        'Play-off':     {'w': ('Final', 'team2Name', None),      'l': None},
        'Quarter-Final':{'w': ('Semi-Final', None, None),        'l': None},  # first open slot
        'Semi-Final':   {'w': ('Final', None, None),             'l': None},
    }
    m = KO_MAPS.get(mtype)
    if m:
        if m['w'] and winner:
            rt, slot, grp = m['w']
            if slot is None:
                _fill_next_open_slot(conn, name, rt, winner)
            else:
                tgt = _find_match(conn, name, rt, grp)
                if tgt:
                    _set_slot(conn, tgt['matchID'], slot, winner)
        if m['l'] and loser:
            rt, slot, grp = m['l']
            tgt = _find_match(conn, name, rt, grp)
            if tgt:
                _set_slot(conn, tgt['matchID'], slot, loser)

    # Group-stage completion → seed knockouts from standings
    if mtype in ('Group-Stage', 'League'):
        # Pool-based tournaments
        pool_a_done = _group_stage_complete(conn, name, 'Pool A')
        pool_b_done = _group_stage_complete(conn, name, 'Pool B')
        has_pools = conn.execute(
            "SELECT COUNT(*) c FROM Matches WHERE tournamentName=? AND matchGroup IN ('Pool A','Pool B')",
            (name,)).fetchone()['c'] > 0
        if has_pools:
            if pool_a_done and pool_b_done:
                sa = compute_pool_standings(conn, name, 'Pool A')
                sb = compute_pool_standings(conn, name, 'Pool B')
                if sa and sb:
                    # Pool Format 1: pool winners → Final
                    final = _find_match(conn, name, 'Final')
                    if final and final['team1Name'] == 'TBD' and final['team2Name'] == 'TBD' \
                       and not _find_match(conn, name, 'Semi-Final') \
                       and not _find_match(conn, name, '1st-Place-Match'):
                        _set_slot(conn, final['matchID'], 'team1Name', sa[0]['teamName'])
                        _set_slot(conn, final['matchID'], 'team2Name', sb[0]['teamName'])
                    # Pool Format 2: cross-pool semis
                    sf1 = _find_match(conn, name, 'Semi-Final', 'SF-1')
                    sf2 = _find_match(conn, name, 'Semi-Final', 'SF-2')
                    if sf1 and len(sa) >= 1 and len(sb) >= 2:
                        _set_slot(conn, sf1['matchID'], 'team1Name', sa[0]['teamName'])
                        _set_slot(conn, sf1['matchID'], 'team2Name', sb[1]['teamName'])
                    if sf2 and len(sb) >= 1 and len(sa) >= 2:
                        _set_slot(conn, sf2['matchID'], 'team1Name', sb[0]['teamName'])
                        _set_slot(conn, sf2['matchID'], 'team2Name', sa[1]['teamName'])
                    # Pool Format 3: 1st-place match + 2nd-place play-off
                    pm1 = _find_match(conn, name, '1st-Place-Match')
                    po2 = _find_match(conn, name, '2nd-Place-PO')
                    if pm1 and len(sa) >= 1 and len(sb) >= 1:
                        _set_slot(conn, pm1['matchID'], 'team1Name', sa[0]['teamName'])
                        _set_slot(conn, pm1['matchID'], 'team2Name', sb[0]['teamName'])
                    if po2 and len(sa) >= 2 and len(sb) >= 2:
                        _set_slot(conn, po2['matchID'], 'team1Name', sa[1]['teamName'])
                        _set_slot(conn, po2['matchID'], 'team2Name', sb[1]['teamName'])
        elif _group_stage_complete(conn, name):
            standings = compute_standings(conn, name)
            if standings:
                # IPL-style playoffs
                q1 = _find_match(conn, name, 'Qualifier-1')
                elim = _find_match(conn, name, 'Eliminator')
                if q1 and elim and len(standings) >= 4:
                    _set_slot(conn, q1['matchID'], 'team1Name', standings[0]['teamName'])
                    _set_slot(conn, q1['matchID'], 'team2Name', standings[1]['teamName'])
                    _set_slot(conn, elim['matchID'], 'team1Name', standings[2]['teamName'])
                    _set_slot(conn, elim['matchID'], 'team2Name', standings[3]['teamName'])
                else:
                    # Play-off (2nd v 3rd) + Final, or plain Top-2 Final
                    po = _find_match(conn, name, 'Play-off')
                    final = _find_match(conn, name, 'Final')
                    if po and final and len(standings) >= 3:
                        _set_slot(conn, final['matchID'], 'team1Name', standings[0]['teamName'])
                        _set_slot(conn, po['matchID'], 'team1Name', standings[1]['teamName'])
                        _set_slot(conn, po['matchID'], 'team2Name', standings[2]['teamName'])
                    elif final and len(standings) >= 2 \
                            and final['team1Name'] == 'TBD' and final['team2Name'] == 'TBD':
                        _set_slot(conn, final['matchID'], 'team1Name', standings[0]['teamName'])
                        _set_slot(conn, final['matchID'], 'team2Name', standings[1]['teamName'])


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
            conn.execute("UPDATE Matches SET winnerName=?, winMargin=?, status='Completed' WHERE matchID=?",
                         (winner, margin, match_id))

            # Re-read with new winner then auto-advance knockouts
            match = conn.execute('SELECT * FROM Matches WHERE matchID=?', (match_id,)).fetchone()
            tournament = match['tournamentName']
            try:
                _auto_advance(conn, tournament, match)
            except Exception as adv_err:
                app.logger.warning(f'auto-advance failed: {adv_err}')

            if match['matchType'] == 'Final':
                conn.execute("UPDATE Tournament SET status='Completed' WHERE tournamentName=?", (tournament,))
        return jsonify({'message': 'Match completed', 'winnerName': winner, 'winMargin': margin})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ─────────────────────────────────────────────────────
# Tournament Standings
# ─────────────────────────────────────────────────────
def _nrr_standings(conn, team_names, matches):
    """Compute a P/W/L/NR/Pts/NRR points table for the given set of teams and
    completed match rows. NRR uses actual legal balls from BallByBall."""
    fmt_balls = {'T10': 60, 'T20': 120, 'ODI': 300, 'TEST': 540}

    def legal_balls(match_id, innings_num, fmt):
        row = conn.execute("""
            SELECT COUNT(*) AS legal FROM BallByBall
            WHERE matchID=? AND inningsNumber=?
              AND (extraType IS NULL OR extraType NOT IN ('Wide','NoBall'))
        """, (match_id, innings_num)).fetchone()
        n = row['legal'] if row else 0
        return n if n > 0 else fmt_balls.get(fmt, 120)

    stats = {t: {'P': 0, 'W': 0, 'L': 0, 'NR': 0, 'Pts': 0,
                 'runs_for': 0, 'balls_for': 0,
                 'runs_against': 0, 'balls_against': 0} for t in team_names}

    for m in matches:
        t1, t2 = m['team1Name'], m['team2Name']
        if t1 not in stats or t2 not in stats:
            continue
        fmt = m['matchFormat']
        balls_t1 = legal_balls(m['matchID'], 1, fmt)
        balls_t2 = legal_balls(m['matchID'], 2, fmt)

        if not m['winnerName']:
            for t in (t1, t2):
                stats[t]['P'] += 1
                stats[t]['NR'] += 1
                stats[t]['Pts'] += 1
            continue

        stats[t1]['P'] += 1
        stats[t1]['runs_for'] += (m['team1TotalRuns'] or 0)
        stats[t1]['balls_for'] += balls_t1
        stats[t1]['runs_against'] += (m['team2TotalRuns'] or 0)
        stats[t1]['balls_against'] += balls_t2

        stats[t2]['P'] += 1
        stats[t2]['runs_for'] += (m['team2TotalRuns'] or 0)
        stats[t2]['balls_for'] += balls_t2
        stats[t2]['runs_against'] += (m['team1TotalRuns'] or 0)
        stats[t2]['balls_against'] += balls_t1

        winner = m['winnerName']
        loser = t2 if winner == t1 else t1
        stats[winner]['W'] += 1
        stats[winner]['Pts'] += 2
        stats[loser]['L'] += 1

    result = []
    for team, s in stats.items():
        overs_for = s['balls_for'] / 6 if s['balls_for'] > 0 else 1
        overs_against = s['balls_against'] / 6 if s['balls_against'] > 0 else 1
        rpo_for = s['runs_for'] / overs_for
        rpo_against = s['runs_against'] / overs_against
        nrr = round(rpo_for - rpo_against, 3)
        result.append({
            'teamName': team,
            'P': s['P'], 'W': s['W'], 'L': s['L'], 'NR': s['NR'],
            'Pts': s['Pts'], 'NRR': nrr,
            'RunsFor': s['runs_for'], 'RunsAgainst': s['runs_against']
        })
    result.sort(key=lambda x: (-x['Pts'], -x['NRR']))
    return result


@app.route('/api/tournaments/<path:name>/standings', methods=['GET'])
def tournament_standings(name):
    """Points table with NRR computed from actual balls faced in BallByBall.
    Only 'Completed' matches count. Returns an object:
        { overall: [...], pools: { 'Pool A': [...], 'Pool B': [...] } | null }
    For pool-format tournaments a per-pool table is included so the UI can
    show both pools. Backward compatible via the `overall` key."""
    with get_db() as conn:
        teams_in = conn.execute(
            'SELECT teamName FROM TournamentTeams WHERE tournamentName=?', (name,)
        ).fetchall()
        if not teams_in:
            return jsonify({'overall': [], 'pools': None})
        team_names = [t['teamName'] for t in teams_in]

        all_matches = conn.execute("""
            SELECT matchID, matchFormat, matchType, matchGroup,
                   team1Name, team2Name,
                   team1TotalRuns, team1TotalWickets,
                   team2TotalRuns, team2TotalWickets, winnerName
            FROM Matches
            WHERE tournamentName=? AND status='Completed'
        """, (name,)).fetchall()

        overall = _nrr_standings(conn, team_names, all_matches)

        # Detect pool structure from any (scheduled or completed) match groups.
        pool_rows = conn.execute("""
            SELECT DISTINCT matchGroup, team1Name, team2Name FROM Matches
            WHERE tournamentName=? AND matchGroup IN ('Pool A','Pool B')
        """, (name,)).fetchall()

        pools = None
        if pool_rows:
            pool_teams = {'Pool A': [], 'Pool B': []}
            for r in pool_rows:
                grp = r['matchGroup']
                for tm in (r['team1Name'], r['team2Name']):
                    if tm and tm != 'TBD' and tm not in pool_teams[grp]:
                        pool_teams[grp].append(tm)
            pools = {}
            for grp, teams_g in pool_teams.items():
                if not teams_g:
                    continue
                grp_matches = [m for m in all_matches
                               if m['matchGroup'] == grp
                               and m['matchType'] in ('Group-Stage', 'League')]
                pools[grp] = _nrr_standings(conn, teams_g, grp_matches)
            if not pools:
                pools = None

        return jsonify({'overall': overall, 'pools': pools})


# ─────────────────────────────────────────────────────────────────────
# Tournament Bracket (knockout fixtures grouped by round)
# ─────────────────────────────────────────────────────────────────────
# Logical display order for every knockout / playoff match type.
KNOCKOUT_ORDER = [
    'Quarter-Final',
    'SF-1', 'SF-2', 'Semi-Final', '3rd-Place-SF',
    'Qualifier-1', 'Eliminator', 'Qualifier-2',
    'Play-off', '1st-Place-Match', '2nd-Place-PO', 'SF-Final',
    'Final',
]


@app.route('/api/tournaments/<path:name>/bracket', methods=['GET'])
def get_bracket(name):
    with get_db() as conn:
        matches = conn.execute("""
            SELECT matchID, matchType, matchGroup, team1Name, team2Name,
                   winnerName, status, matchDate, sequenceNumber
            FROM Matches
            WHERE tournamentName=? AND matchType NOT IN ('League','Group-Stage')
            ORDER BY sequenceNumber ASC, matchID ASC
        """, (name,)).fetchall()

        def order_key(mt):
            return KNOCKOUT_ORDER.index(mt) if mt in KNOCKOUT_ORDER else 99

        bracket = {}
        for m in sorted(matches, key=lambda r: (order_key(r['matchType']),
                                                 r['sequenceNumber'] or 0,
                                                 r['matchID'])):
            mt = m['matchType']
            bracket.setdefault(mt, []).append({
                'matchID': m['matchID'], 'matchType': mt,
                'matchGroup': m['matchGroup'],
                'team1': m['team1Name'], 'team2': m['team2Name'],
                'winner': m['winnerName'], 'status': m['status'],
                'date': m['matchDate']
            })

        # Ordered list of the rounds that actually exist for this tournament.
        order = [mt for mt in KNOCKOUT_ORDER if mt in bracket]
        order += [mt for mt in bracket if mt not in order]

        # Pool composition (if any).
        pool_rows = conn.execute("""
            SELECT DISTINCT matchGroup, team1Name, team2Name FROM Matches
            WHERE tournamentName=? AND matchGroup IN ('Pool A','Pool B')
        """, (name,)).fetchall()
        pools = None
        if pool_rows:
            pools = {'Pool A': [], 'Pool B': []}
            for r in pool_rows:
                grp = r['matchGroup']
                for tm in (r['team1Name'], r['team2Name']):
                    if tm and tm != 'TBD' and tm not in pools[grp]:
                        pools[grp].append(tm)
            pools = {k: v for k, v in pools.items() if v} or None

        group_count = conn.execute(
            "SELECT COUNT(*) c FROM Matches WHERE tournamentName=? "
            "AND matchType IN ('League','Group-Stage')", (name,)
        ).fetchone()['c']

        return jsonify({'bracket': bracket, 'order': order,
                        'pools': pools, 'groupStageCount': group_count}), 200


# ─────────────────────────────────────────────────────────────────────
# Live Win Probability (2nd-innings chase, RRR vs CRR model)
# ─────────────────────────────────────────────────────────────────────
@app.route('/api/matches/<int:match_id>/win-probability', methods=['GET'])
def get_win_probability(match_id):
    import math
    with get_db() as conn:
        match = conn.execute('SELECT * FROM Matches WHERE matchID=?', (match_id,)).fetchone()
        if not match:
            return jsonify({'error': 'Not found'}), 404

        innings2_balls = conn.execute("""
            SELECT COUNT(*) AS cnt FROM BallByBall
            WHERE matchID=? AND inningsNumber=2
              AND (extraType IS NULL OR extraType NOT IN ('Wide','NoBall'))
        """, (match_id,)).fetchone()['cnt']

        innings2_runs = conn.execute("""
            SELECT COALESCE(SUM(runsScored + COALESCE(extras,0)), 0) AS total FROM BallByBall
            WHERE matchID=? AND inningsNumber=2
        """, (match_id,)).fetchone()['total'] or 0

        innings2_wickets = conn.execute("""
            SELECT COUNT(*) AS cnt FROM BallByBall
            WHERE matchID=? AND inningsNumber=2 AND wicketFallen=1
        """, (match_id,)).fetchone()['cnt']

        target = (match['team1TotalRuns'] or 0) + 1

        overs_row = conn.execute('SELECT overs FROM Tournament WHERE tournamentName=?',
                                 (match['tournamentName'],)).fetchone()
        overs_total = (overs_row['overs'] if overs_row and overs_row['overs'] else None) \
            or {'T10': 10, 'T20': 20, 'ODI': 50, 'TEST': 90}.get(match['matchFormat'], 20)

        balls_total = overs_total * 6
        balls_remaining = max(0, balls_total - innings2_balls)
        overs_remaining = balls_remaining / 6
        runs_needed = target - innings2_runs
        wickets_left = 10 - innings2_wickets

        if innings2_balls == 0:
            return jsonify({'probability': 50, 'status': 'not_started', 'target': target})
        if runs_needed <= 0:
            return jsonify({'probability': 100, 'status': 'chasing_team_won', 'target': target})
        if balls_remaining == 0 or wickets_left == 0:
            return jsonify({'probability': 0, 'status': 'defending_team_won', 'target': target})

        crr = (innings2_runs / innings2_balls) * 6
        rrr = (runs_needed / balls_remaining) * 6
        resource = (wickets_left / 10) * min(1.0, overs_remaining / (overs_total * 0.5)) if overs_total else 0
        rate_diff = crr - rrr
        prob_raw = 1 / (1 + math.exp(-rate_diff * 0.8))
        prob_adjusted = prob_raw * (0.4 + 0.6 * resource)
        prob_final = max(2, min(98, round(prob_adjusted * 100)))

        return jsonify({
            'probability': prob_final, 'target': target,
            'runs_needed': runs_needed, 'balls_remaining': balls_remaining,
            'wickets_left': wickets_left, 'crr': round(crr, 2), 'rrr': round(rrr, 2),
            'status': 'live'
        }), 200


# ─────────────────────────────────────────────────────────────────────
# Player Career Profile (yearly batting/bowling, recent matches, totals)
# ─────────────────────────────────────────────────────────────────────
@app.route('/api/players/<player_id>/career', methods=['GET'])
def get_player_career(player_id):
    with get_db() as conn:
        player = conn.execute('SELECT * FROM Players WHERE playerID=?', (player_id,)).fetchone()
        if not player:
            return jsonify({'error': 'Not found'}), 404

        batting_yearly = conn.execute("""
            SELECT strftime('%Y', m.matchDate) AS year,
                   SUM(b.runsScored) AS runs,
                   COUNT(DISTINCT b.matchID) AS innings,
                   MAX(b.runsScored) AS highScore,
                   SUM(CASE WHEN b.runsScored=4 THEN 1 ELSE 0 END) AS fours,
                   SUM(CASE WHEN b.runsScored=6 THEN 1 ELSE 0 END) AS sixes,
                   COUNT(*) AS balls,
                   SUM(CASE WHEN b.wicketFallen=1 AND b.dismissedPlayerID=? AND b.runsScored=0 THEN 1 ELSE 0 END) AS ducks
            FROM BallByBall b JOIN Matches m ON b.matchID=m.matchID
            WHERE b.batsmanID=? AND m.matchDate IS NOT NULL AND m.matchDate != 'TBD'
            GROUP BY year ORDER BY year ASC
        """, (player_id, player_id)).fetchall()

        bowling_yearly = conn.execute("""
            SELECT strftime('%Y', m.matchDate) AS year,
                   COUNT(CASE WHEN (b.extraType IS NULL OR b.extraType NOT IN ('Wide','NoBall')) THEN 1 END) AS balls,
                   SUM(b.runsScored + COALESCE(b.extras,0)) AS runs,
                   SUM(b.wicketFallen) AS wickets,
                   COUNT(DISTINCT b.matchID) AS matches
            FROM BallByBall b JOIN Matches m ON b.matchID=m.matchID
            WHERE b.bowlerID=? AND m.matchDate IS NOT NULL AND m.matchDate != 'TBD'
            GROUP BY year ORDER BY year ASC
        """, (player_id,)).fetchall()

        recent_matches = conn.execute("""
            SELECT DISTINCT m.matchID, m.matchDate, m.matchFormat, m.matchType,
                   m.tournamentName, m.team1Name, m.team2Name, m.winnerName,
                   (SELECT SUM(b2.runsScored) FROM BallByBall b2
                    WHERE b2.matchID=m.matchID AND b2.batsmanID=?) AS runsScored,
                   (SELECT COUNT(*) FROM BallByBall b2
                    WHERE b2.matchID=m.matchID AND b2.batsmanID=?) AS ballsFaced,
                   (SELECT COUNT(*) FROM BallByBall b2
                    WHERE b2.matchID=m.matchID AND b2.bowlerID=? AND b2.wicketFallen=1) AS wicketsTaken,
                   (SELECT px.teamName FROM PlayingXI px
                    WHERE px.matchID=m.matchID AND px.playerID=?) AS playerTeam
            FROM Matches m JOIN BallByBall b ON b.matchID=m.matchID
            WHERE (b.batsmanID=? OR b.bowlerID=?) AND m.status='Completed'
            GROUP BY m.matchID
            ORDER BY m.matchDate DESC, m.matchID DESC LIMIT 10
        """, (player_id, player_id, player_id, player_id, player_id, player_id)).fetchall()

        career_bat = conn.execute("""
            SELECT SUM(b.runsScored) AS totalRuns, COUNT(DISTINCT b.matchID) AS matches,
                   MAX(b.runsScored) AS highScore
            FROM BallByBall b WHERE b.batsmanID=?
        """, (player_id,)).fetchone()

        # 50s/100s per innings (grouped by match+innings)
        inns = conn.execute("""
            SELECT SUM(runsScored) AS r FROM BallByBall
            WHERE batsmanID=? GROUP BY matchID, inningsNumber
        """, (player_id,)).fetchall()
        fifties = sum(1 for x in inns if x['r'] is not None and 50 <= x['r'] < 100)
        hundreds = sum(1 for x in inns if x['r'] is not None and x['r'] >= 100)

        career_bowl = conn.execute("""
            SELECT COUNT(CASE WHEN (extraType IS NULL OR extraType NOT IN ('Wide','NoBall')) THEN 1 END) AS balls,
                   SUM(runsScored + COALESCE(extras,0)) AS runs,
                   SUM(wicketFallen) AS wickets
            FROM BallByBall WHERE bowlerID=?
        """, (player_id,)).fetchone()

        bat_totals = dict(career_bat) if career_bat else {}
        bat_totals['fifties'] = fifties
        bat_totals['hundreds'] = hundreds

        return jsonify({
            'player': dict(player),
            'battingYearly': [dict(r) for r in batting_yearly],
            'bowlingYearly': [dict(r) for r in bowling_yearly],
            'recentMatches': [dict(r) for r in recent_matches],
            'careerTotals': {
                'batting': bat_totals,
                'bowling': dict(career_bowl) if career_bowl else {}
            }
        }), 200

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
            LEFT JOIN (
                SELECT playerID, MIN(teamName) AS teamName
                FROM Squad GROUP BY playerID
            ) sq ON p.playerID = sq.playerID
            LEFT JOIN Team t ON sq.teamName = t.teamName
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
