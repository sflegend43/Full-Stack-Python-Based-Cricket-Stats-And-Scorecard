# Complete Project Guide — CricketStats Pro

Everything about this project: every file, every function, every endpoint, every table, every style.

---

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [File Inventory](#2-file-inventory)
3. [Backend — app.py (4407 lines)](#3-backend)
4. [Database Schema (13 Tables)](#4-database-schema)
5. [Frontend — HTML Pages](#5-frontend-html-pages)
6. [Frontend — JavaScript Files](#6-frontend-javascript-files)
7. [Frontend — CSS (style.css)](#7-frontend-css)
8. [Data Files](#8-data-files)
9. [Users & Roles](#9-users--roles)
10. [Business Rules](#10-business-rules)
11. [Design System](#11-design-system)
12. [Key Decisions & Known Issues](#12-key-decisions--known-issues)
13. [Running the App](#13-running-the-app)
14. [Recent Fixes](#14-recent-fixes)

---

## 1. Project Overview

A full-stack Python/Flask cricket statistics and live scorekeeping platform. Two user roles (admin/fan), 10 international teams, 251 players, ball-by-ball scoring with Super Over support, tournament generation with full scheduling, and AI-powered stats.

**Run:** `python app.py` → `http://localhost:5001/login.html`

---

## 2. File Inventory

| File | Lines | Purpose |
|------|-------|---------|
| `app.py` | 4631 | Flask backend: 60+ API routes, DB init, auth, scoring logic, Super Over, Free Hit, tournament generation, schedule management |
| `seed_data.py` | 549 | Static data: 10 teams, 251 players, 251 squad entries, 12 venues, 8 umpires |
| `reset_db.py` | 25 | DB reset utility |
| `dump_schema.py` | 3 | Schema dump utility |
| `print_schema.py` | 8 | Schema print utility |
| `requirements.txt` | 2 | Flask, werkzeug |
| `Start_App.bat` | 1 | Windows launcher |
| `matches.html` | 930 | Match list, scorecard, live scoring, Super Over |
| `players.html` | 254 | Player roster + add/edit modals |
| `teams.html` | 146 | Team list + roster detail |
| `tournaments.html` | 354 | Tournament CRUD + standings + squads + schedule board + bracket |
| `rankings.html` | 125 | Team + player rankings |
| `records.html` | 105 | Hall of Fame — all-time records |
| `index.html` | 116 | Dashboard with stats overview |
| `stats.html` | 354 | AI stats query page (player stats, H2H, P vs P, P vs Team) |
| `signup.html` | 87 | Registration page |
| `login.html` | 58 | Auth page |
| `matches.js` | 2642 | Match list, scorecard, live scoring, Super Over, Free Hit |
| `tournaments.js` | 1053 | Tournament CRUD, wizard, squad selection, schedule board, bracket |
| `stats.js` | 629 | Stats page logic (player stats, H2H, PVP, PVT) |
| `players.js` | 517 | Player cards, search, add/edit forms |
| `teams.js` | 373 | Team list, roster, featured players |
| `rankings.js` | 216 | Rankings display + CSV export |
| `records.js` | 94 | Hall of Fame records display |
| `logic.js` | 220 | Dashboard: overview, leaderboards, AI insight |
| `transitions.js` | 287 | View transitions, scroll behavior, DataSync |
| `auth.js` | 89 | Login/signup form handling |
| `enhance.js` | 55 | Shared UX layer: AI insight refresh + CSV export |
| `cricket_scene.js` | 6 | Cricket animation |
| `parallax.js` | 17 | Parallax scroll effect |
| `style.css` | 3726 | All styles: 30+ major sections |
| `cricket_anim.css` | 6 | Cricket animations |
| `Players Pics/` | 96 files | 95 player PNGs + 1 SVG placeholder |
| `dummy.png` | 1 | Fallback player image |
| `stadium_bg.png` | 1 | Background overlay for all pages |
| `batsman.png` | 1 | Cricket animation asset |

---

## 3. Backend — app.py

### 3.1 Imports & Globals

| Line | Item | Purpose |
|------|------|---------|
| 1–13 | Standard imports | `os`, `json`, `uuid`, `secrets`, `sqlite3`, `datetime`, `random`, `hashlib`, `re`, `string`, `textwrap`, `copy`, `itertools` |
| 13 | `werkzeug.security` | `generate_password_hash`, `check_password_hash` |
| 77 | `BASE_DIR` | Script directory |
| 78 | `DB_PATH` | `cricket_stats.db` path |
| 86 | `app` | Flask instance, serves static files from BASE_DIR |
| 89 | `_ADMIN_KEY_DEV_FALLBACK` | `'CRICKET_ADMIN_2026'` |
| 507 | `import seed_data` | Static data (mid-file import) |
| 2229 | `MAX_OVERS_PER_BOWLER` | `{'T10': 2, 'T20': 4, 'ODI': 10, 'TEST': None}` |
| 2235 | `SUPER_OVER_BALLS = 6` | Max legal balls per super over |
| 2236 | `SUPER_OVER_WICKETS = 2` | Max wickets per super over |

### 3.2 Helper Functions

#### `verify_password(stored, provided)` — Line 18
Verifies password against stored hash. Falls back to plaintext comparison if `check_password_hash` throws.

#### `is_hashed(value)` — Line 29
Returns `True` if value contains 2+ `$` characters (Werkzeug hash format).

#### `get_bearer_token()` — Line 36
Extracts Bearer token from Authorization header.

#### `get_current_user()` — Line 43
Queries `users` table by token. Returns `sqlite3.Row` or `None`.

#### `requires_admin(f)` — Line 65
Decorator: returns 403 if user is not admin.

#### `get_admin_registration_key()` — Line 89
Returns `CRICKET_ADMIN_KEY` env var or `'CRICKET_ADMIN_2026'`.

#### `get_db()` — Line 104
Opens SQLite connection with `row_factory=Row`, enables WAL + foreign_keys.

#### `init_db()` — Line 112
Creates all 13 tables via `executescript`. Runs `ALTER TABLE` migrations for columns added later (including `freeHitPending` on MatchState, `tournamentType`/`status` on Tournament, `tossDecision` on Matches, `teamName` on PlayingXI, `fielderID` on BallByBall, `token` on users).

#### `_resolve_registration_role(admin_key_submitted)` — Line 396
Returns `('admin', 1)` if key matches, `('user', 0)` if no key, `(None, None)` if bad key.

#### `register_user(data)` — Line 408
Unified registration. Validates fields, hashes password, generates token via `secrets.token_hex(32)`, inserts into `users`.

#### `save_match_state(conn, match_id, innings, striker_id, nonstriker_id, bowler_id, free_hit_pending=None)` — Line 2625
Upserts `MatchState` row for persistence across page reloads. Persists free hit state.

#### `enforce_bowler_rules(conn, match_id, innings, match_format, over, ball, bowler)` — Line 2757
Returns error string or `None`. Checks: (1) consecutive overs, (2) max overs per format. Returns `None` (no enforcement) for `innings >= 3` (Super Over).

#### `get_ball_state(match_id)` — Line 2420
Returns full ball state for a given innings via `GET /api/balls/state/<match_id>?innings=N`. Key data returned:
- `players`, `battingOptions`, `bowlingOptions`: Playing XI lists with selectable/disabled flags
- `battingTeam`, `bowlingTeam`: derived from toss winner + decision
- `progress`: ICC status (overs, target, required rate, result)
- `match`, `dismissedPlayerIDs`, `bowlerOvers`, `maxOversPerBowler`
- `strikerID`, `nonStrikerID`, `bowlerID`, `freeHitPending`

#### `evaluate_progress(conn, match_id, innings)` — Line 2291
Returns dict with `overs`, `target`, `runRate`, `requiredRate`, `result` etc. For innings 1-2 uses `MAX_OVERS_PER_BOWLER`. For Super Over (innings 3-4) uses `SUPER_OVER_BALLS`/`SUPER_OVER_WICKETS`.

#### `_teams_for_innings(conn, match_id, innings)` — Line 2245
Returns `(batting_team, bowling_team)` tuple based on toss result. Correctly handles Super Over team swap.

#### `_innings_runs_wkts(conn, match_id, innings)` — Line 2271
Returns `(runs, wickets)` aggregate for an innings, excluding `Retired` marker rows from legal deliveries.

#### `_batting_slot(conn, match_id, innings, player_id)` — Line 2646
Returns a player's batting stats for an innings (runs, balls, 4s, 6s, isOut, dismissal info).

### 3.3 All API Routes

#### Auth (5 routes)

| # | Method | Route | Line | Admin | Body | Returns |
|---|--------|-------|------|-------|------|---------|
| 1 | GET | `/` | 384 | No | — | `login.html` |
| 2 | GET | `/<page>.html` | 388 | No | — | Static HTML page |
| 3 | POST | `/api/register` | 452 | No | fullname, email, password, adminKey? | 201 user+token |
| 4 | POST | `/api/signup` | 459 | No | Same as register | 201 user+token |
| 5 | POST | `/api/login` | 466 | No | email, password | 200 user+token |

#### Players (7 routes)

| # | Method | Route | Line | Admin | Body/Params | Returns |
|---|--------|-------|------|-------|-------------|---------|
| 6 | GET | `/api/players` | 599 | No | ?role=, ?nationality=, ?search= | Player array |
| 7 | GET | `/api/players/by_team` | 619 | No | — | `{team: [players]}` |
| 8 | POST | `/api/players/add_to_pool` | 636 | YES | playerName, DOB, nationality, role, teamName | 201 |
| 9 | GET | `/api/players/<id>` | 666 | No | — | player + batting + bowling stats |
| 10 | POST | `/api/players` | 693 | YES | playerID, name, DOB, nationality, role | 201 |
| 11 | PUT | `/api/players/<id>` | 716 | YES | Any subset of fields | 200 |
| 12 | DELETE | `/api/players/<id>` | 736 | YES | — | 200 (checks BallByBall first) |

#### Teams (3 routes)

| # | Method | Route | Line | Admin | Body/Params | Returns |
|---|--------|-------|------|-------|-------------|---------|
| 13 | GET | `/api/teams` | 762 | No | — | Team array sorted by ranking |
| 14 | POST | `/api/teams` | 768 | YES | teamName, countryName, headCoach? | 201 |
| 15 | GET | `/api/teams/<name>` | 794 | No | — | team + squad + matches |

#### Matches (5 routes)

| # | Method | Route | Line | Admin | Body/Params | Returns |
|---|--------|-------|------|-------|-------------|---------|
| 16 | GET | `/api/matches` | 820 | No | ?format=, ?type= | Match array |
| 17 | GET | `/api/matches/<id>` | 846 | No | — | match + ballByBall + playingXI |
| 18 | POST | `/api/matches` | 875 | YES | All match fields | 201 |
| 19 | POST | `/api/matches/<id>/xi` | 901 | YES | {players: [{playerID, matchRole, teamName}]} | 201 |
| 20 | DELETE | `/api/matches/<id>` | 926 | YES | — | 200 (cascades BallByBall, PlayingXI, MatchState) |
| 21 | PUT | `/api/matches/<id>/activate` | 1352 | YES | tossWinnerName, tossDecision | 200 |
| 22 | PUT | `/api/matches/<id>/complete` | 4027 | YES | winnerName?, winMargin? | 200 |
| 23 | GET | `/api/matches/<id>/win-probability` | 4178 | No | — | Win probability dict |

#### Balls (5 routes)

| # | Method | Route | Line | Admin | Body/Params | Returns |
|---|--------|-------|------|-------|-------------|---------|
| 24 | GET | `/api/balls/<matchId>` | 2199 | No | ?innings= | Ball array |
| 25 | GET | `/api/balls/state/<matchId>` | 2419 | No | ?innings= | Full state: players, dismissed, bowlerOvers, context |
| 26 | PUT | `/api/balls/state/<matchId>` | 2740 | YES | strikerID?, nonStrikerID?, bowlerID? | 200 |
| 27 | POST | `/api/balls` | 2789 | YES | Full ball payload | 201 + updates match totals |
| 28 | PUT | `/api/balls/<ballId>` | 2918 | YES | Full ball payload | 200 + recalculates totals |
| 29 | DELETE | `/api/balls/<ballId>` | 2963 | YES | — | 200 + recalculates totals |

#### Venues & Umpires (2 routes)

| # | Method | Route | Line | Admin | Returns |
|---|--------|-------|------|-------|---------|
| 30 | GET | `/api/venues` | 2985 | No | Venue array |
| 31 | GET | `/api/umpires` | 2992 | No | Umpire array |

#### Tournaments (11 routes)

| # | Method | Route | Line | Admin | Body | Returns |
|---|--------|-------|------|-------|------|---------|
| 32 | GET | `/api/tournaments` | 946 | No | — | Tournament array + teams |
| 33 | POST | `/api/tournaments` | 982 | YES | name, format, totalTeams, teams[] | 201 |
| 34 | DELETE | `/api/tournaments/<name>` | 1419 | YES | — | 200 (cascades everything) |
| 35 | GET | `/api/tournaments/<name>/squad` | 1443 | No | — | `{team: [players]}` |
| 36 | POST | `/api/tournaments/<name>/squad` | 1465 | YES | {squads: [{teamName, playerID}]} | 201 |
| 37 | POST | `/api/tournaments/preview-schedule` | 1210 | YES | {tournamentType, format, teams[]} | Schedule preview |
| 38 | POST | `/api/tournaments/generate` | 1246 | YES | {name, format, tournamentType, status, teams[], overs, schedule} | 201 + all matches |
| 39 | PUT | `/api/tournaments/<name>/teams` | 1519 | YES | {teams: [teamName]} | 200 (add teams, never removes played) |
| 40 | POST | `/api/tournaments/<name>/schedule` | 1548 | YES | {schedule: [{team1Name, team2Name, matchType, matchDate, matchGroup}]} | 201 (append fixtures) |
| 41 | PUT | `/api/matches/<id>/schedule` | 1596 | YES | {team1Name?, team2Name?, matchType?, matchDate?} | 200 (edit Scheduled match) |
| 42 | GET | `/api/tournaments/<name>/standings` | 4058 | No | — | P, W, L, NR, pts, NRR |
| 43 | GET | `/api/tournaments/<name>/bracket` | 4147 | No | — | Bracket/knockout tree |

#### Stats & Rankings (11 routes)

| # | Method | Route | Line | Admin | Params | Returns |
|---|--------|-------|------|-------|--------|---------|
| 44 | GET | `/api/stats/leaderboard` | 1626 | No | ?tournamentName= | Top batsmen, bowlers, distributions |
| 45 | GET | `/api/stats/scorecard/<id>` | 1684 | No | — | Full scorecard (bat, bowl, XI) |
| 46 | GET | `/api/stats/overview` | 2082 | No | ?tournamentName= | Aggregate stats |
| 47 | GET | `/api/rankings/teams` | 2110 | No | ?format= | Team wins ranking |
| 48 | GET | `/api/rankings/players` | 2155 | No | ?format= | Player rankings |
| 49 | GET | `/api/stats/player` | 3086 | No | ?name= | Recent form + yearly breakdown |
| 50 | GET | `/api/stats/h2h` | 3306 | No | ?team1=, ?team2= | Win counts |
| 51 | GET | `/api/stats/player_vs_player` | 3418 | No | ?batsman=, ?bowler= | Balls, runs, dismissals |
| 52 | GET | `/api/stats/player_vs_team` | 3573 | No | ?player=, ?team= | Runs scored |
| 53 | GET | `/api/stats/records` | 3752 | No | — | All-time records |
| 54 | GET | `/api/stats/ai-insight` | 3816 | No | — | Rotating AI insight for nav pill |

#### Search & Players Extended (4 routes)

| # | Method | Route | Line | Admin | Params | Returns |
|---|--------|-------|------|-------|--------|---------|
| 55 | GET | `/api/search` | 3717 | No | ?q= | Global search (players, teams, tournaments, matches) |
| 56 | GET | `/api/players/<id>/career` | 4241 | No | — | Career stats across formats |
| 57 | GET | `/api/players/stats` | 4329 | No | — | All player stats |

#### Dev/Seed (2 routes)

| # | Method | Route | Line | Admin | Returns |
|---|--------|-------|------|-------|---------|
| 58 | POST | `/api/dev/reset` | 512 | YES | Drops all tables, recreates |
| 59 | POST | `/api/seed` | 531 | No | Seeds 10 teams, 251 players, 251 squads (venues/umpires must be seeded separately) |

---

## 4. Database Schema

### Table: `users`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| fullname | TEXT NOT NULL | |
| email | TEXT UNIQUE NOT NULL | |
| password | TEXT NOT NULL | Hashed via werkzeug |
| isAdmin | INTEGER DEFAULT 0 | 1 = admin |
| created | TEXT DEFAULT datetime('now') | |
| token | TEXT | Bearer auth token (migration) |

### Table: `Players`
| Column | Type | Notes |
|--------|------|-------|
| playerID | TEXT PK | Auto-generated `"P" + uuid[:8].upper()` |
| playerName | TEXT NOT NULL | |
| playerDOB | TEXT NOT NULL | |
| playerNationality | TEXT NOT NULL | |
| battingStyle | TEXT | 'Right-Hand Bat', 'Left-Hand Bat' |
| bowlingStyle | TEXT | Free text |
| playerRole | TEXT | CHECK: Batsman/Bowler/AllRounder/WicketKeeper |

### Table: `Team`
| Column | Type | Notes |
|--------|------|-------|
| teamName | TEXT PK | e.g. 'Pakistan Cricket Team' |
| country | TEXT NOT NULL | |
| headCoach | TEXT | |
| teamCaptain | TEXT | |
| ranking | INTEGER NOT NULL | |

### Table: `Venue`
| Column | Type |
|--------|------|
| venueID | INTEGER PK |
| venueName | TEXT NOT NULL |
| venueCity | TEXT NOT NULL |
| venueCountry | TEXT NOT NULL |
| venueCapacity | INTEGER NOT NULL |

### Table: `Umpire`
| Column | Type |
|--------|------|
| umpireID | INTEGER PK |
| umpireName | TEXT NOT NULL |
| umpireNationality | TEXT NOT NULL |
| umpireExperienceMatches | INTEGER NOT NULL |

### Table: `Matches`
| Column | Type | Notes |
|--------|------|-------|
| matchID | INTEGER PK | |
| tournamentName | TEXT NOT NULL | |
| matchFormat | TEXT NOT NULL | CHECK: T20/ODI/TEST/T10 |
| matchType | TEXT NOT NULL | CHECK: League/Semi-Final/Final/Group-Stage |
| isDayNight | INTEGER DEFAULT 0 | |
| team1Name | TEXT NOT NULL | FK→Team |
| team2Name | TEXT NOT NULL | FK→Team |
| venueID | INTEGER NOT NULL | FK→Venue |
| matchDate | TEXT | |
| winnerName | TEXT | FK→Team |
| tossWinnerName | TEXT | FK→Team |
| tossDecision | TEXT | 'bat' or 'bowl' (migration) |
| winMargin | TEXT | |
| onFieldUmpire1ID | INTEGER NOT NULL | FK→Umpire |
| onFieldUmpire2ID | INTEGER NOT NULL | FK→Umpire |
| thirdUmpireID | INTEGER | FK→Umpire |
| team1TotalRuns | INTEGER DEFAULT 0 | |
| team1TotalWickets | INTEGER DEFAULT 0 | |
| team2TotalRuns | INTEGER DEFAULT 0 | |
| team2TotalWickets | INTEGER DEFAULT 0 | |
| matchStatus | TEXT DEFAULT 'upcoming' | upcoming/live/completed (migration) |

### Table: `BallByBall`
| Column | Type | Notes |
|--------|------|-------|
| ballID | INTEGER PK AUTO | |
| matchID | INTEGER NOT NULL | FK→Matches |
| inningsNumber | INTEGER NOT NULL | CHECK: 1–4 |
| overNumber | INTEGER NOT NULL | |
| ballNumber | INTEGER NOT NULL | CHECK: ≥1 |
| batsmanID | TEXT NOT NULL | FK→Players |
| bowlerID | TEXT NOT NULL | FK→Players |
| runsScored | INTEGER NOT NULL | |
| extras | INTEGER DEFAULT 0 | |
| extraType | TEXT | Wide/NoBall/Bye/LegBye/Penalty/Retired |
| wicketFallen | INTEGER DEFAULT 0 | |
| dismissedPlayerID | TEXT | FK→Players |
| wicketType | TEXT | |
| fielderID | TEXT | FK→Players (migration) |

### Table: `Squad`
| Column | Type | Notes |
|--------|------|-------|
| teamName | TEXT NOT NULL | FK→Team |
| playerID | TEXT NOT NULL | FK→Players |
| PK: (teamName, playerID) | | |

### Table: `PlayingXI`
| Column | Type | Notes |
|--------|------|-------|
| matchID | INTEGER NOT NULL | FK→Matches |
| playerID | TEXT NOT NULL | FK→Players |
| matchRole | TEXT | CHECK: Player/Captain/WicketKeeper/Captain & WK |
| teamName | TEXT | (migration) |
| PK: (matchID, playerID) | | |

### Table: `Tournament`
| Column | Type | Notes |
|--------|------|-------|
| tournamentName | TEXT PK | |
| format | TEXT NOT NULL | T20/ODI/TEST/T10 |
| totalTeams | INTEGER | |
| overs | INTEGER | |
| tournamentType | TEXT | round-robin/series/knockout (migration) |
| status | TEXT | upcoming/running/completed (migration) |

### Table: `TournamentTeams`
| Column | Type | Notes |
|--------|------|-------|
| tournamentName | TEXT NOT NULL | FK→Tournament |
| teamName | TEXT NOT NULL | FK→Team |
| PK: (tournamentName, teamName) | | |

### Table: `TournamentSquad`
| Column | Type | Notes |
|--------|------|-------|
| tournamentName | TEXT NOT NULL | FK→Tournament |
| teamName | TEXT NOT NULL | FK→Team |
| playerID | TEXT NOT NULL | FK→Players |
| PK: (tournamentName, teamName, playerID) | | |

### Table: `MatchState`
| Column | Type | Notes |
|--------|------|-------|
| matchID | INTEGER NOT NULL | FK→Matches |
| inningsNumber | INTEGER NOT NULL | CHECK: 1–4 (3‑4 = Super Over) |
| strikerID | TEXT | |
| nonStrikerID | TEXT | |
| bowlerID | TEXT | |
| freeHitPending | INTEGER DEFAULT 0 | 1 if free hit is active |
| PK: (matchID, inningsNumber) | | |

---

## 5. Frontend — HTML Pages

### 5.1 login.html (50 lines)
- Auth card with cricket branding, email/password form
- Calls `auth.js` for login logic

### 5.2 signup.html (75 lines)
- Registration form with fullname, email, password, admin key fields

### 5.3 index.html (108 lines) — Dashboard
- Tournament filter dropdown
- 6 stat boxes: Matches, Teams, Runs, Wickets, Sixes, Fours
- Completed Tournaments table
- Top Run Scorers + Top Wicket Takers (side by side)
- Recent Matches table
- Loads Chart.js from CDN
- Calls `logic.js`

### 5.4 matches.html (930 lines) — Most Complex Page

**Three major views:**

**A. Match List View** (lines ~58–100)
- Header: "Match Centre" + "Add Match" button (admin-only)
- Format filter: All/T20/T10/ODI/TEST
- Table: ID, Tournament, Format, Type, Team1, Score1, Team2, Score2, Winner, Date, Actions

**B. Scorecard Detail View** (hidden by default)
- "Back to Matches" + "Enter Ball" (admin-only)
- Scorecard header (JS-populated)
- 6 main tabs (or 10 for Super Over): 1st Innings Batting, 1st Innings Bowling, 2nd Innings Batting, 2nd Innings Bowling, Playing XI, Detailed Stats
- Super Over (innings 3‑4): extra tabs shown dynamically with `batList`/`bowlList` variables
- Broadcast-style batting card with 3 row states (out/not out/yet to bat) via `sc-*` CSS classes
- Detailed Stats → two sub-tabs:
  - **Players Performance** → 2 sub-sub-tabs (1st/2nd Innings Bowling)
  - **Ball Log** → over-by-over visual + detailed table

**C. Live Scoring View** (hidden by default)
- Toolbar: "Back to Scorecard", match title, LIVE badge
- Two-column grid:
  - LEFT: Score head (team badges, score, overs, CRR), Over timeline (6 dots), Batters (striker/non-striker with swap), Bowler (name, OV/M/R/W)
  - RIGHT: Numpad (runs 0–6, extras WD/NB/BYE/LB/PEN/Retire, OUT/UNDO)
  - Below: Live scoring card tabs (Batting/Bowling) with broadcast-style scorecard

**5 Modals:**
1. Context Modal: Striker/Non-Striker/Bowler selection (mode: innings_start, wicket, new_over, manual_swap)
2. Extras Modal: Extra run selection (+0 to +6)
3. Wicket Modal: Dismissed player, type (12 types), fielder (with WK tagging), optional extra
4. Retire Modal: Batter selection, reason
5. Add Match Wizard: 3-step (Details → Toss → Playing XI)

### 5.5 players.html (254 lines)
- Search bar + Team dropdown + Role filter (All/Batsman/Bowler/AllRounder/WicketKeeper)
- Player grid (JS-populated with cards)
- Add Player modal: team, name, DOB, nationality, batting style, bowling style, role
- Edit Player modal: same fields

### 5.6 teams.html (146 lines)
- Teams table: Rank, Team, Country, Coach, "View Roster" button
- Add Team form (inline, admin-only)
- Team Detail view: Header (flag, name, ranking, coach, squad size), Roster (featured player hero + scrollable table), Match History

### 5.7 tournaments.html (354 lines)
- "Create Tournament" button (admin-only)
- Tournament Wizard (multi-step): Series/Tournament toggle, Tournament Type (round-robin/series/knockout), format, overs, team selection
- Schedule preview + generation
- Running + Completed tournament tables
- Squad Selection Modal (wizard: team-by-team, 16 players each)
- Squad View Modal (player grid for selected team)
- Standings Modal (P, W, L, NR, Pts, NRR table)
- Bracket Modal (knockout tree visualization)
- Schedule Board: tabbed view (Schedule / Table / Bracket)

### 5.8 rankings.html (119 lines)
- Format filter dropdown
- Team Rankings: Team, Matches, Wins
- Player Rankings: Player, Role, Runs, Wickets

### 5.9 stats.html (354 lines)
- Stat Type selector: Player Stats, Head to Head, Player vs Player, Player vs Team
- Dynamic input fields based on selection
- Results: Player Stats card (recent form table + year-by-year chart) or Generic card

### 5.10 records.html (100 lines)
- Hall of Fame page showing all-time records
- Displays top performers across categories

---

## 6. Frontend — JavaScript Files

### 6.1 auth.js (82 lines)
Handles login/signup form submissions. Stores user object + token in `localStorage.cricketUser`. Redirects to `matches.html` on success.

### 6.2 logic.js (195 lines) — Dashboard
| Function | Purpose |
|----------|---------|
| `loadDashboardStats()` | Fetches `/api/stats/overview`, populates 6 stat boxes |
| `loadLeaderboards()` | Fetches `/api/stats/leaderboard`, renders top batsmen/bowlers |
| `loadRecentMatches()` | Fetches `/api/matches`, renders last 10 |
| `loadCompletedTournaments()` | Fetches tournaments, renders completed ones |
| `refreshAIInsight()` | Fetches `/api/stats/ai-insight`, updates pill text |

### 6.3 matches.js (2642 lines) — Largest File

**Global Variables:**
| Variable | Purpose |
|----------|---------|
| `allMatches` | All loaded match objects |
| `currentFormat` | Active format filter |
| `currentScorecard` | Current scorecard data |
| `beMatchId` | Match ID being scored |
| `beInnings` | Current innings (1 or 2) |
| `bePlayers` | Players for current match/innings |
| `currentStriker/NonStriker/Bowler` | Active crease context |
| `beDismissedIDs` | Array of dismissed player IDs (merged server + local) |
| `beBowlerOvers` | Bowler over counts (legal balls per player) |
| `beMaxOversPerBowler` | Max overs limit by format |
| `beLastOverBowlerID` | Previous over's bowler |
| `pendingNewBatter` | Flag: new batter required (blocks ball entry) |
| `lsCurrentOver/Ball` | Current ball position |
| `lsExtraType/lsExtraRuns` | Extra being entered |
| `contextMode` | Context modal mode (innings_start/wicket/new_over/manual_swap) |
| `wicketAtEndOver` | Wicket fell at over end |
| `beRuns` | Current pending runs |
| `beDelType` | Current delivery type |

**Key Functions:**

| Function | Purpose |
|----------|---------|
| `authFetch()` | Wrapper adding Bearer token |
| `getUser()` | Parse localStorage user |
| `logout()` | Clear auth, redirect |
| `showToast()` | Flash notification |
| `loadMatches()` | Fetch + render match list |
| `setFormatFilter()` | Toggle format filter |
| `renderMatchList()` | Build match table HTML |
| `viewScorecard()` | Load + show scorecard |
| `backToList()` | Return to match list |
| `renderScorecard()` | Build full scorecard, calls `pickBattingXI()` |
| `renderBatTable()` | Broadcast-style batting card (sc-out/sc-notout/sc-dnb + formatDismissal) |
| `renderBatTableClassic()` | Old-style batting table for Detailed Stats sub-sub-tabs |
| `buildPickerRow()` | Inline new-batter picker after last dismissed row |
| `renderBowlTable()` | Bowling stats table |
| `renderXIBoxes()` | Playing XI display |
| `switchInnings()` | Main tab switching (6 tabs) |
| `switchDetailTab()` | Detailed Stats sub-tab switching |
| `switchPerfTab()` | Players Performance sub-sub-tab switching |
| `formatDismissal()` | Composes c {f} b {b}, st {f} b {b}, run out ({f}), etc. |
| `pickBattingXI()` | Infers batting team XI by matching batsmanIDs |
| `undoLastBall()` | Delete last ball |
| `deleteMatch()` | Delete match with confirm |
| `populateSelectDropdowns()` | Fill match wizard dropdowns |
| `openAddMatchModal()` | Show match wizard |
| `handleMatchWizard()` | Submit new match + XI |
| `openBallEntry()` | Enter live scoring mode — fetches ball state from API |
| `closeLiveScoring()` | Return to scorecard |
| `applyBallState()` | Applies server ball state to UI (score, players, context) |
| `filterContextPlayers()` | Populate context dropdowns — excludes dismissed/active players |
| `openContextModal()` | Show striker/bowler selection |
| `cancelContextModal()` | Cancel with enforcement toast |
| `confirmContext()` | Apply context selection |
| `persistContext()` | Save context to server |
| `manualSwapStriker()` | Swap striker/non-striker |
| `updateScoreboardStrip()` | Update score display |
| `lsRefreshStats()` | Refresh batter/bowler stats |
| `lsSwitchScorecardTab()` | Switch live card (bat/bowl) |
| `lsPickNewBatter()` | Sets striker, clears pendingNewBatter, calls lsRefreshStats |
| `lsOpenWicketModal()` | WK fielder tagging with data-wk attribute |
| `lsOnWicketTypeChange()` | Auto-select WK for Stumped |
| `updateTimeline()` | Render current over dots |
| `lsRecordRun()` | Record runs (0–6) |
| `lsOpenExtraModal()` | Open extras dialog |
| `lsConfirmExtra()` | Submit extras |
| `lsConfirmWicket()` | Submit wicket |
| `lsSubmitBall()` | Core function: validate, POST ball, handle wicket, advance ball, swap strikes, persist, broadcast |
| `loadBallLog()` | Fetch + render ball log |
| `renderBallLogViz()` | Over-by-over colored chips |
| `renderBallLogTable()` | Detailed ball log table |
| `playCrowdSound()` | Web Audio API crowd noise |
| `customConfirm()` | Promise-based confirm modal |

### 6.4 tournaments.js (1053 lines)

**Global Variables:**
| Variable | Purpose |
|----------|---------|
| `currentTournamentForSquads` | Tournament being squad-selected |
| `teamsForSquads` | Teams in current tournament |
| `currentSquadTeamIndex` | Current team in squad wizard |
| `playersByTeam` | Players grouped by team |
| `finalSquadSelection` | Selected squads: [{teamName, playerID}] |
| `wizardState` | Multi-step wizard state |
| `scheduleView` | Active view: schedule/table/bracket |
| `allTournamentsCache` | Cached tournament list |
| `scheduleMatchesCache` | Cached matches for schedule board |

**Key Functions:**

| Function | Purpose |
|----------|---------|
| `authFetch()` | Wrapper adding Bearer token |
| `getUser()` | Parse localStorage user |
| `logout()` | Clear auth, redirect |
| `showToast()` | Flash notification |
| `toggleForm()` | Show/hide create form |
| `loadTeamsOptions()` | Populate team checkboxes |
| `loadTournaments()` | Fetch + render (running vs completed) |
| `viewStandings()` | Fetch + show standings modal |
| `viewBracket()` | Fetch + show bracket/knockout tree |
| `deleteTournament()` | Delete with confirm |
| `saveTournament()` | Create tournament via wizard |
| `startSquadSelection()` | Initialize squad wizard |
| `renderSquadTeam()` | Show current team's player grid |
| `updateSquadCounter()` | Count selected players |
| `nextSquadTeam()` | Advance to next team |
| `submitAllSquads()` | POST all squads |
| `viewTournamentSquad()` | View registered squad |
| `customConfirm()` | Promise-based confirm |
| `setScheduleView()` | Switch schedule/board view |
| `hydrateScheduleSelector()` | Load tournament selector for schedule board |
| `renderScheduleBoard()` | Render matches as schedule grid or bracket |
| `matchBoxHTML()` | Individual match box for schedule |
| `buildScheduleGrid()` | Grid layout for schedule |
| `buildBracketTree()` | Bracket tree for knockout |
| **Wizard functions:** | |
| `resetWizard()` | Reset wizard state |
| `openWizardModal()` | Open tournament creation wizard |
| `closeWizardModal()` | Close wizard |
| `setSeriesOrTournament()` | Toggle series vs tournament mode |
| `setTournamentType()` | Select round-robin/series/knockout |
| `updateWizardProgress()` | Progress bar update |
| `renderWizardStep()` | Render current wizard step |
| `wizardNext()` / `wizardBack()` | Navigate wizard steps |
| `validateWizardStep()` | Validate current step |
| `populateTeamCheckboxes()` | Load teams for selection |
| `toggleWizTeam()` | Toggle team selection |
| `renderScheduleOptions()` | Show format/overs options |
| `updateMatchCountPreview()` | Preview number of matches |
| `fetchAndRenderSchedulePreview()` | Fetch schedule from server |
| `renderScheduleReviewTable()` | Show generated schedule |
| `startWizardSquads()` | Start squad selection phase |
| `wizRenderSquadTeam()` | Render squad for current team |
| `wizUpdateSquadCounter()` | Count selected |
| `wizCaptureSquad()` | Save current team's squad |
| `wizNextSquadTeam()` | Advance to next team |
| `submitTournamentWizard()` | Final submit — POST all data |

### 6.5 players.js (517 lines)

| Function | Purpose |
|----------|---------|
| `teamSortKey()` | Sort teams by `TEAM_ORDER` |
| `loadPlayers()` | Fetch players + stats |
| `applyFilters()` | Filter by role/search/team |
| `setRoleFilter()` | Toggle role filter |
| `renderPlayers()` | Build player card grid |
| `getCountryCode()` | Country → flagcdn code |
| `openAddModal()` | Show add player form |
| `openEditModal()` | Populate + show edit form |
| `deletePlayer()` | Delete with confirm |
| `setupForms()` | Attach add/edit form handlers |

**Global Constants:**
- `TEAM_ORDER`: Pakistan → India → Australia → SA → NZ → WI → rest alphabetical
- `ROLE_EMOJI`: {Batsman: '🏏', Bowler: '⚡', AllRounder: '🔄', WicketKeeper: '🧤'}

### 6.6 teams.js (337 lines)

| Function | Purpose |
|----------|---------|
| `loadTeams()` | Fetch + render team list |
| `rankBadge()` | Rank 1/2/3 special badges |
| `getCountryCode()` | Country → flag code |
| `renderTeams()` | Build team table |
| `toggleAddTeamForm()` | Show/hide add form |
| `saveTeam()` | Submit new team |
| `viewTeam()` | Load team detail |
| `renderTeamDetail()` | Build header, roster, match history |

### 6.7 stats.js (629 lines)
Full stats page logic covering Player Stats, Head-to-Head, Player vs Player, Player vs Team queries.

### 6.8 rankings.js (190 lines)

| Function | Purpose |
|----------|---------|
| `loadRankings()` | Fetch team + player rankings |
| `fmtRole()` | Format role with badge |

### 6.9 records.js (86 lines)
- Fetches and displays all-time Hall of Fame records

### 6.10 enhance.js (48 lines)
- Shared UX layer loaded on every page
- `refreshAIInsight()`: fetches `/api/stats/ai-insight`, updates `#ai-insight-text` nav pill

### 6.11 transitions.js (246 lines)
- `DataSync` object: BroadcastChannel + localStorage fallback
- Events: `ball-recorded`, `match-completed`, `match-created`, `data-changed`
- Scroll-to-top button visibility
- Nav auto-hide on scroll (hide down, show up)
- `document.startViewTransition()` wrapper

### 6.12 cricket_scene.js (6 lines)
- Cricket animation asset loading

### 6.13 parallax.js (17 lines)
- Parallax scroll effect for background

---

## 7. Frontend — CSS (style.css, 3726 lines)

### Section Catalog

| Lines | Section | Key Elements |
|-------|---------|-------------|
| 1–8 | Imports | Google Fonts: Poppins (300–800), Orbitron (400–900) |
| 9–41 | Design Tokens | 38 CSS custom properties: colors, gradients, neon accents |
| 43–56 | Reset + Body | Dark bg (`#0f0f1a`), Poppins font, overflow hidden |
| 67–72 | Layout | `.container` max-width 1380px |
| 74–283 | **Two-Tier Navbar** | Sticky, blur backdrop, Row 1 (logo + AI pill + user), Row 2 (7 nav links) |
| 284–322 | **Glass Card** | `rgba(15,20,40,0.65)` bg, blur(20px), gradient top-line, hover lift |
| 324–396 | **Stats Cards** | `.stats-grid` auto-fit, `.stat-box` with colored bottom-line variants |
| 398–410 | Dashboard Grid | 2-column: 360px + 1fr, collapse at 1100px |
| 412–452 | Form Inputs | Green-tinted bg, focus glow |
| 454–564 | **Buttons** | Submit (gradient), cancel (red), edit (gold), delete (red), view (green) |
| 566–604 | Search Bar | Green-tinted, rounded 12px |
| 606–640 | **Filter Tabs** | Green-tinted, active glow state |
| 642–704 | **Tables** | Scrollable, zebra rows, empty states |
| 706–729 | **Badges** | Role (batsman/bowler/allrounder/keeper), Format (t20/odi/test/t10) |
| 731–765 | Charts | Chart.js integration wrappers |
| 767–845 | **Modal** | Fixed overlay, blur, scaleIn animation, custom scrollbar |
| 847–914 | **Scorecard** | Header layout, innings tabs |
| 916–957 | **Toast Notifications** | Fixed top-right, fadeIn animation, success/error variants |
| 959–1054 | **Auth Pages** | Centered card, gradient top-line, form groups |
| 1056–1345 | **Player Cards** | Auto-fill grid (minmax 260px), hero image (220px), role badge, flag, telemetry panel |
| 1347–1364 | **Rank Badges** | Circular: gold(1), silver(2), bronze(3) |
| 1366–1375 | Scrollbar | WebKit: 8px, green-tinted thumb |
| 1377–1397 | Animations | fadeInUp, shimmer keyframes |
| 1399–1428 | Responsive | Breakpoints: 768px, 480px |
| 1481–1521 | Ball Entry Buttons | Run buttons (Orbitron), delivery type toggles |
| 1523–1561 | Ball Log Chips | Colored over groups: dot/four/six/wicket/wide/noball/run |
| 1563–1608 | Numpad Base | Large buttons, pulsing dot animation |
| 1610–1882 | **Ball Entry Layout** | Two-column grid, score head (3.2rem score), timeline dots, batter rows, bowler panel, numpad (runs + extras + actions), responsive at 900px |
| 1884–1918 | Custom Confirm | Promise-based confirm dialog |
| 1920–1942 | Flame Effects | Orange/red pulsing animation |
| 1944–2091 | **View Transitions** | `view-transition-name` on nav elements, morph/fade/pill animations |
| 2093–2142 | **Scroll-to-Top** | Fixed bottom-right, 44px, blur bg, visibility toggle |
| 2144–2156 | **Nav Auto-Hide** | `translateY(-105%)` on scroll down |
| 2158–2214 | **Team Roster** | Grid 240px + 1fr, featured player hero (280px), scrollable list |
| 2228–2309 | **Broadcast Scorecard** | `.sc-bat-row`, `.sc-out`, `.sc-notout`, `.sc-dnb`, `.sc-name`, `.sc-dismissal`, `.sc-num`, `.sc-picker-row`, `.sc-picker-select` |
| ~3670 | **Stadium Overlay** | `.stadium-bg-overlay` — fixed background overlay for all pages |
| ~3690–3820 | **Records Page** | `.records-grid`, `.record-card`, `.record-list`, `.record-row` — Hall of Fame layout |

---

## 8. Data Files

### 8.1 seed_data.py
- `teams`: 10 entries (Pakistan, India, Australia, SA, NZ, England, WI, Sri Lanka, Bangladesh, Afghanistan)
- `players`: 251 entries (25 per team), each with playerID, name, DOB, nationality, battingStyle, bowlingStyle, playerRole
- `squads`: 251 entries mapping each player to their team
- **Note:** Venues and Umpires are NOT in seed_data. The `/api/seed` endpoint only seeds teams, players, and squads. Venues/umpires must be populated manually or via separate script.

### 8.2 Players Pics/ (96 entries)
- 95 PNG files named `PlayerName.png` (e.g., `Babar Azam.png`, `Virat Kohli.png`)
- 1 `player-placeholder.svg`
- Fallback chain: `{Name}.png` → `{Name} crop.png` → `dummy.png`

### 8.3 Static Assets
- `dummy.png`: Root-level fallback for missing player images
- `stadium_bg.png`: Background overlay for all pages
- `batsman.png`: Cricket animation asset

---

## 9. Users & Roles

| Role | Capabilities |
|------|-------------|
| **Admin** | Full CRUD: create/manage teams, players, tournaments, matches; enter ball-by-ball live scoring; delete data; generate tournaments with full scheduling |
| **Fan (default)** | Read-only: browse dashboards, view scorecards, view player/team stats, view leaderboards |

Authentication uses email + password with Bearer token. Signup stores password with Werkzeug hashing. Admin signup requires a shared admin key (`CRICKET_ADMIN_2026`).

---

## 10. Business Rules

### 10.1 Bowler Rules

| Format | Max Overs |
|--------|-----------|
| T10 | 2 |
| T20 | 4 |
| ODI | 10 |
| TEST | Unlimited (null) |

- A bowler **cannot bowl two consecutive overs**. If only one bowler has overs remaining, the rule is bypassed.
- Checked server-side in `enforce_bowler_rules()` (line 2757) before every ball insert
- Checked client-side before showing bowler selection
- Bowlers filtered by: `playerRole IN ('Bowler','AllRounder') OR (bowlingStyle IS NOT NULL AND TRIM(LOWER(bowlingStyle)) NOT IN ('', 'none'))`

### 10.2 Wicket Rules

**Dismissal Types:** `Bowled`, `Caught`, `CaughtAndBowled`, `LBW`, `RunOut`, `Stumped`, `HitWicket`, `ObstructingField`, `HandledBall`, `TimedOut`, `HitTwice`

**New Batter Enforcement:**
- After a wicket: `pendingNewBatter` flag set to `true`
- All ball entry blocked until a new batter is selected
- Context modal re-opens automatically on cancel
- On page reload: if restored striker is in `beDismissedIDs`, modal re-opens
- Cancel clears the striker and shows an enforcement toast

**Retire:** `RetiredHurt` = batter leaves temporarily; `RetiredOut` = counts as wicket

### 10.3 Extra Rules

| Type | Runs off bat | Ball counts |
|------|-------------|-------------|
| Wide (WD) | 0+ | No |
| NoBall (NB) | 0+ | No |
| Bye (BYE) | 0+ | Yes |
| LegBye (LB) | 0+ | Yes |
| Penalty (PEN) | Always 5 | Yes |

Wide and NoBall do NOT count as a legal delivery. Bye, LegBye, and Penalty DO count.

### 10.4 Batting Order Rules (Scorecard)

- **Batted players**: sorted by XI position (batting arrival order), position never changes once set
- **Active-but-not-batted**: new striker just selected (no row yet) — synthetic "playing" row inserted right after last batted row (B update)
- **Yet-to-bat**: XI players in strict XI position order (not role-sorted)
- **New batter picker**: excludes dismissed players (out) AND any player currently at crease not dismissed (both striker and non-striker)

### 10.5 Auth Rules

- `admin`: Full access (requires admin key at signup)
- `fan` (default): Read-only access
- Admin-only actions: POST/PUT/DELETE on Players, Teams, Venues, Umpires, Matches, Tournaments; ball entry; deleting balls; match wizard
- Admin UI stripping: `document.querySelectorAll('.admin-only').forEach(el => el.remove())` for non-admin users

### 10.6 Bowling Figures Calculation

```sql
-- Excludes Wide/NoBall/Retired from legal deliveries
SUM(CASE WHEN (extraType IS NULL OR extraType NOT IN ('Wide','NoBall','Retired'))
         THEN 1 ELSE 0 END) AS ballsBowled
-- runsConceded includes ALL runs (bat runs + extras + penalties)
-- maidens: over where wicketFallen=0, runsScored=0, extras=0 OR IS NULL for all 6 balls
```

### 10.7 Tournament Generation

**Tournament Types:**
- **Round-Robin**: Every team plays every other team once
- **Series**: Same as round-robin (every team plays each other)
- **Knockout**: Bracket-style elimination (quarterfinals → semifinals → final)

**Generation Flow (`POST /api/tournaments/generate`):**
1. Create Tournament row with `tournamentType`, `status='running'`
2. Create TournamentTeams rows for all selected teams
3. If round-robin/series: generate all pairings (round-robin schedule)
4. If knockout: generate bracket with byes for non-power-of-2 sizes
5. Create Match rows for each pairing with cycling venue/umpire IDs
6. Create PlayingXI rows for each match (empty — filled later)

**Venue/Umpire Cycling:**
- Matches cycle through all available venues and umpires from the Venue and Umpire tables
- `venueID`, `onFieldUmpire1ID`, `onFieldUmpire2ID` are all NOT NULL in the Matches schema
- If no venues or umpires exist, match creation will fail

**Match Activation (`PUT /api/matches/<id>/activate`):**
- Requires: tossWinnerName, tossDecision ('bat' or 'bowl')
- Sets matchStatus to 'live'
- Updates toss data on the match

**Schedule Management (3 additional routes):**
- `PUT /api/tournaments/<name>/teams` — Add participating teams after creation (never removes played teams)
- `POST /api/tournaments/<name>/schedule` — Append Scheduled fixtures (team1Name, team2Name, matchType, matchDate, matchGroup)
- `PUT /api/matches/<id>/schedule` — Edit a Scheduled fixture before activation (only allowed when matchStatus is 'Scheduled')

### 10.8 Super Over

| Feature | Implementation |
|---------|---------------|
| Team swap | `get_ball_state()` uses `innings in (1, 4)` — innings 4 correctly assigns `team2Name` as batting team |
| Max balls | `SUPER_OVER_BALLS = 6` legal deliveries per innings (3‑4) |
| Max wickets | `SUPER_OVER_WICKETS = 2` wickets ends the innings early |
| Bowler enforcement | `enforce_bowler_rules()` returns `None` for `innings >= 3` (no quota in Super Over) |
| Scorecard | `lsRefreshStats()` uses `batList`/`bowlList` variables instead of hardcoded `innings1Bat`/`innings2Bat` |
| Innings tabs | Dynamic tab rendering: innings 1‑2 (normal) or 3‑4 (Super Over) shown based on match data |

---

## 11. Design System

### 11.1 Theme
Dark UI throughout. Deep matte backgrounds with high-contrast accent colors.

### 11.2 Color Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#0f0f1a` | Page background |
| `--card-bg` | `rgba(15,20,40,0.65)` | Glass card backgrounds |
| `--text` | `#e2e8f0` | Primary text |
| `--text-muted` | `#64748b` | Secondary/muted text |
| `--primary` | `#38bdf8` | Primary accent (sky blue) |
| `--gold` | `#f59e0b` | Gold accents |
| `--gold-bright` | `#fbbf24` | Bright gold |
| `--neon-green` | `#22c55e` | Success, runs, wins |
| `--red-ball` | `#ef4444` | Danger, wickets |

### 11.3 Typography

| Font | Weight | Usage |
|------|--------|-------|
| **Poppins** | 300–800 | Body text, UI elements, badges |
| **Orbitron** | 400–900 | Headings, scores, stat numbers |

### 11.4 Components

**Glass Card:**
```css
background: rgba(15,20,40,0.65);
border: 1px solid rgba(255,255,255,0.06);
border-radius: 16px;
backdrop-filter: blur(20px);
```

**Badges:** `.badge-batsman` (blue), `.badge-bowler` (red), `.badge-allrounder` (gold), `.badge-keeper` (green), `.badge-t20` (cyan), `.badge-odi` (purple), `.badge-test` (orange), `.badge-t10` (pink)

**Buttons:** `.btn-submit` (gradient blue), `.btn-cancel` (red), `.btn-view` (green), `.btn-delete` (red), `.filter-btn` (tab toggle)

### 11.5 Ball Entry Layout

**Two-column grid** (`.be-grid`): `1fr 1fr` collapse to `1fr` at 900px.

| Component | Content |
|-----------|---------|
| Score Head | Team badges, main score, CRR |
| Over Timeline | 6 circular indicators |
| Batters | Striker + non-striker with runs/balls |
| Bowler | Name, OV/M/R/W stats |

**Numpad (right):** Runs 0–6, Extras (WD/NB/BYE/LB/PEN/Retire), Actions (OUT/UNDO)

### 11.6 Scorecard Tabs

**6 Main Tabs (up to 10 for Super Over):** 1st Innings Batting, 1st Innings Bowling, 2nd Innings Batting, 2nd Innings Bowling (plus innings 3‑4 Batting/Bowling for Super Over), Playing XI, Detailed Stats

**Broadcast Batting Table (7 columns):** `Batsman | Dismissal | Runs | Balls | 4s | 6s | SR`

| Row state | CSS class | Visual |
|-----------|-----------|--------|
| Out | `sc-out` | Gold name + pink strikethrough, white runs |
| Not out | `sc-notout` | Full mint-green `#b9f6ca` bar, dark text |
| Yet to bat | `sc-dnb` | Dimmed name (0.6 opacity), dash stats |

**Detailed Stats (2 sub-tabs):**
- **Players Performance** → 4 sub-sub-tabs: 1st/2nd Innings Batting (old-style), 1st/2nd Innings Bowling
- **Ball Log** → over-by-over visual + detailed table

### 11.7 Live Scoring Card Tabs

Below ball entry, centered tab bar (`ls-sc-tab-bat`/`ls-sc-tab-bowl`) switches between panels.

- **Batting card**: uses `renderBatTable()` with `activeIds` + `pendingWicket` opts
- **Bowling card**: 6 columns (Bowler, O, M, R, W, Econ); active bowler highlighted

### 11.8 WK Fielder Tagging

- Fielder dropdown populated from bowling team players
- Designated WK (`playerRole === 'WicketKeeper'`) gets `data-wk` attribute + `(WK)` label
- Auto-selects WK when Stumped chosen via `lsOnWicketTypeChange()`

### 11.9 Dismissal Format (formatDismissal)

| Scenario | Output |
|----------|--------|
| Caught | `c {fielder} b {bowler}` |
| Caught & Bowled | `c & b {bowler}` |
| Bowled | `b {bowler}` |
| LBW | `lbw b {bowler}` |
| Stumped | `st {fielder} b {bowler}` |
| Run Out | `run out ({fielder})` |
| Hit Wicket | `hit wicket b {bowler}` |
| No dismissal | `not out` |

### 11.10 Animations & Navigation

- **View Transitions**: all pages `<meta name="view-transition" content="same-origin">` + `document.startViewTransition()`
- **Two-tier header**: Row 1 (logo + AI pill + welcome/logout), Row 2 (7 centered nav links)
- **Auto-hide**: `.nav-hidden` on scroll down past 60px, show on scroll up
- **Scroll-to-top**: fixed bottom-right, teal hover glow, `requestAnimationFrame`
- **Toast notifications**: `.flash` class, auto-remove after 3.5s

### 11.11 Responsive Breakpoints

| Breakpoint | Behavior |
|-----------|----------|
| > 900px | Full two-column layout |
| ≤ 900px | Ball entry grid collapses to single column |
| ≤ 700px | Team roster grid collapses, nav adjusts |

---

## 12. Key Decisions & Known Issues

### 12.1 Backend Decisions

- **SQLite with WAL**: Simple, no external DB server needed
- **`get_db()` per request**: Fresh connection per request, auto-commits via `with`
- **`requires_admin` decorator**: Wraps routes to check `user['isAdmin']`
- **`enforce_bowler_rules()`**: Server-side validation for consecutive overs + max overs per format
- **`save_match_state()`**: Persists striker/non-striker/bowler/freeHitPending to `MatchState` after every ball (line 2625)
- **`get_ball_state()`**: Returns complete match context including playing XI with selectable/disabled flags, derived batting/bowling team from toss data, and free hit state (line 2420)

### 12.2 Frontend Decisions

- **No framework**: Vanilla JS with `fetch`/`authFetch`. All rendering via `innerHTML` templates
- **`authFetch()`**: Wrapper adding `Authorization: Bearer <token>`
- **`window.DataSync`**: BroadcastChannel with localStorage fallback for cross-tab sync
- **`pendingNewBatter` block**: Local flag prevents ball entry until new batter selected after wicket
- **Tournament Wizard**: Multi-step modal for tournament creation with schedule preview

### 12.3 Known Issues / Tech Debt

**Critical:**
1. **`seed_data.py` missing venues/umpires**: `/api/seed` endpoint will crash on first run if venues/umpires are needed. These must be populated separately.
2. **No CSRF protection**: Token-based auth via localStorage, no CSRF tokens

**Moderate:**
3. **`dummy.png` and `player-placeholder.svg`**: Two different fallback systems for player images

**Low:**
4. **Inline styles**: Many components use extensive inline styles rather than CSS classes
5. **No password hashing migration**: Older accounts may have plaintext passwords (new ones use Werkzeug hashing)

---

## 13. Running the App

```bash
python app.py
```

Server: `http://localhost:5001`
Navigate to: `http://localhost:5001/login.html`

### Database Reset

```bash
python reset_db.py
python app.py
# Then hit /api/seed (note: venues/umpires must be populated manually)
```

---

## 14. Recent Fixes

### 14.1 Venue/Umpire NOT NULL on Tournament Match Creation
**Problem:** `generate_tournament()` in `tournaments.js` created matches with `venueID=NULL`, `onFieldUmpire1ID=NULL`, `onFieldUmpire2ID=NULL`, but the actual database schema (from `init_db()` migrations) has these columns as `NOT NULL`.

**Fix:** Updated `generate_tournament()` in `tournaments.js` to:
1. Fetch venues from `GET /api/venues` before generating matches
2. Fetch umpires from `GET /api/umpires` before generating matches
3. Cycle through available venues and umpires: `venueID = (i % venues.length) + 1`, `onFieldUmpire1ID = (i % umpires.length) + 1`, `onFieldUmpire2ID = ((i + 1) % umpires.length) + 1`

### 14.2 `free_hit_pending` Undefined in `get_ball_state()`
**Problem:** The `get_ball_state()` function (line 2420) referenced `free_hit_pending` but never defined the variable, causing a `NameError` → HTTP 500 error. This prevented the frontend from loading batter/bowler selection lists, resulting in empty dropdowns ("No batters available" / "No eligible bowlers").

**Fix:** Updated the MatchState query at line 2502 to include `freeHitPending`:
```python
SELECT strikerID, nonStrikerID, bowlerID, freeHitPending FROM MatchState
WHERE matchID=? AND inningsNumber=?
```
And added the variable assignment:
```python
free_hit_pending = bool(state_row['freeHitPending']) if state_row and state_row['freeHitPending'] else False
```

### 14.3 Status
After both fixes, the server must be restarted for changes to take effect. Verify with:
```bash
curl http://localhost:5001/api/balls/state/2001?innings=1
```
This should return valid JSON with 22 players in `battingOptions` and `bowlingOptions`.
