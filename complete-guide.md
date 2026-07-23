# Complete Project Guide — CricketStats Pro

Everything about this project: every file, every function, every endpoint, every table, every style.

---

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [File Inventory](#2-file-inventory)
3. [Backend — app.py (1749 lines)](#3-backend)
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

---

## 1. Project Overview

A full-stack Python/Flask cricket statistics and live scorekeeping platform. Two user roles (admin/fan), 10 international teams, 251 players, ball-by-ball scoring, and AI-powered stats.

**Run:** `python app.py` → `http://localhost:5001/login.html`

---

## 2. File Inventory

| File | Lines | Purpose |
|------|-------|---------|
| `app.py` | 1749 | Flask backend: 47 API routes, DB init, auth, scoring logic |
| `seed_data.py` | ~500 | Static data: 10 teams, 251 players, 251 squad entries |
| `reset_db.py` | ~20 | DB reset utility |
| `dump_schema.py` | ~15 | Schema dump utility |
| `requirements.txt` | 2 | Flask, werkzeug |
| `Start_App.bat` | 1 | Windows launcher |
| `matches.html` | 644 | Match list, scorecard, live scoring |
| `players.html` | 203 | Player roster + add/edit modals |
| `teams.html` | 150 | Team list + roster detail |
| `tournaments.html` | 196 | Tournament CRUD + standings + squads |
| `rankings.html` | 110 | Team + player rankings |
| `index.html` | 173 | Dashboard with stats overview |
| `stats.html` | 134 | AI stats query page |
| `login.html` | 57 | Auth page |
| `matches.js` | 1859 | Match list, scorecard, live scoring logic |
| `players.js` | 431 | Player cards, search, add/edit forms |
| `teams.js` | 364 | Team list, roster, featured players |
| `tournaments.js` | 413 | Tournament CRUD, squad wizard, standings |
| `rankings.js` | 107 | Rankings display |
| `logic.js` | ~300 | Dashboard: overview, leaderboards, AI insight |
| `transitions.js` | ~200 | View transitions, scroll behavior, DataSync |
| `auth.js` | ~80 | Login/signup form handling |
| `style.css` | 2309 | All styles: 28 major sections |
| `cricket_anim.css` | ~27 | Cricket animations |
| `Players Pics/` | 96 files | 95 player PNGs + 1 SVG placeholder |
| `dummy.png` | 1 | Fallback player image |
| `player-placeholder.svg` | 1 | Players page hero fallback |

---

## 3. Backend — app.py

### 3.1 Imports & Globals

| Line | Item | Purpose |
|------|------|---------|
| 7 | `Flask, request, jsonify, send_from_directory` | Flask core |
| 8 | `sqlite3` | Database |
| 11 | `secrets` | Token generation |
| 12 | `wraps` | Decorator preservation |
| 13 | `generate_password_hash, check_password_hash` | Password hashing |
| 398 | `import seed_data` | Static data (mid-file import) |
| 63 | `BASE_DIR` | Script directory |
| 64 | `DB_PATH` | `cricket_stats.db` path |
| 67 | `_ADMIN_KEY_DEV_FALLBACK` | `'CRICKET_ADMIN_2026'` |
| 69 | `app` | Flask instance, serves static files from BASE_DIR |
| 1122 | `MAX_OVERS_PER_BOWLER` | `{'T10': 2, 'T20': 4, 'ODI': 10, 'TEST': None}` |

### 3.2 Helper Functions

#### `verify_password(stored, provided)` — Line 18
Verifies password against stored hash. Falls back to plaintext comparison if `check_password_hash` throws.

#### `is_hashed(value)` — Line 29
Returns `True` if value contains 2+ `$` characters (Werkzeug hash format).

#### `get_bearer_token()` — Line 36
Extracts Bearer token from Authorization header.

#### `get_current_user()` — Line 43
Queries `users` table by token. Returns `sqlite3.Row` or `None`.

#### `requires_admin(f)` — Line 51
Decorator: returns 403 if user is not admin.

#### `get_admin_registration_key()` — Line 72
Returns `CRICKET_ADMIN_KEY` env var or `'CRICKET_ADMIN_2026'`.

#### `get_db()` — Line 80
Opens SQLite connection with `row_factory=Row`, enables WAL + foreign_keys.

#### `init_db()` — Line 88
Creates all 13 tables via `executescript`. Runs 4 `ALTER TABLE` migrations for columns added later.

#### `_resolve_registration_role(admin_key_submitted)` — Line 289
Returns `('admin', 1)` if key matches, `('user', 0)` if no key, `(None, None)` if bad key.

#### `register_user(data)` — Line 301
Unified registration. Validates fields, hashes password, generates token via `secrets.token_hex(32)`, inserts into `users`.

#### `save_match_state(conn, match_id, innings, striker_id, nonstriker_id, bowler_id)` — Line 1266
Upserts `MatchState` row for persistence across page reloads.

#### `enforce_bowler_rules(conn, match_id, innings, match_format, over, ball, bowler)` — Line 1295
Returns error string or `None`. Checks: (1) consecutive overs, (2) max overs per format.

### 3.3 All 47 API Routes

#### Auth (4 routes)

| # | Method | Route | Line | Admin | Body | Returns |
|---|--------|-------|------|-------|------|---------|
| 1 | GET | `/` | 277 | No | — | `login.html` |
| 2 | GET | `/<page>.html` | 281 | No | — | Static HTML page |
| 3 | POST | `/api/register` | 345 | No | fullname, email, password, adminKey? | 201 user+token |
| 4 | POST | `/api/signup` | 352 | No | Same as register | 201 user+token |
| 5 | POST | `/api/login` | 359 | No | email, password | 200 user+token |

#### Players (7 routes)

| # | Method | Route | Line | Admin | Body/Params | Returns |
|---|--------|-------|------|-------|-------------|---------|
| 6 | GET | `/api/players` | 453 | No | ?role=, ?nationality=, ?search= | Player array |
| 7 | GET | `/api/players/by_team` | 473 | No | — | `{team: [players]}` |
| 8 | POST | `/api/players/add_to_pool` | 490 | YES | playerName, DOB, nationality, role, teamName | 201 |
| 9 | GET | `/api/players/<id>` | 520 | No | — | player + batting + bowling stats |
| 10 | POST | `/api/players` | 547 | YES | playerID, name, DOB, nationality, role | 201 |
| 11 | PUT | `/api/players/<id>` | 570 | YES | Any subset of fields | 200 |
| 12 | DELETE | `/api/players/<id>` | 590 | YES | — | 200 (checks BallByBall first) |

#### Teams (3 routes)

| # | Method | Route | Line | Admin | Body/Params | Returns |
|---|--------|-------|------|-------|-------------|---------|
| 13 | GET | `/api/teams` | 616 | No | — | Team array sorted by ranking |
| 14 | POST | `/api/teams` | 622 | YES | teamName, countryName, headCoach? | 201 |
| 15 | GET | `/api/teams/<name>` | 648 | No | — | team + squad + matches |

#### Matches (5 routes)

| # | Method | Route | Line | Admin | Body/Params | Returns |
|---|--------|-------|------|-------|-------------|---------|
| 16 | GET | `/api/matches` | 674 | No | ?format=, ?type= | Match array |
| 17 | GET | `/api/matches/<id>` | 691 | No | — | match + ballByBall + playingXI |
| 18 | POST | `/api/matches` | 720 | YES | All match fields | 201 |
| 19 | POST | `/api/matches/<id>/xi` | 746 | YES | {players: [{playerID, matchRole, teamName}]} | 201 |
| 20 | DELETE | `/api/matches/<id>` | 771 | YES | — | 200 (cascades BallByBall, PlayingXI, MatchState) |

#### Balls (4 routes)

| # | Method | Route | Line | Admin | Body/Params | Returns |
|---|--------|-------|------|-------|-------------|---------|
| 21 | GET | `/api/balls/<matchId>` | 1092 | No | ?innings= | Ball array |
| 22 | GET | `/api/balls/state/<matchId>` | 1125 | No | ?innings= | Full state: players, dismissed, bowlerOvers, context |
| 23 | POST | `/api/balls` | 1321 | YES | Full ball payload | 201 + updates match totals |
| 24 | PUT | `/api/balls/state/<matchId>` | 1278 | YES | strikerID?, nonStrikerID?, bowlerID? | 200 |
| 25 | PUT | `/api/balls/<ballId>` | 1397 | YES | Full ball payload | 200 + recalculates totals |
| 26 | DELETE | `/api/balls/<ballId>` | 1459 | YES | — | 200 + recalculates totals |

#### Venues (1 route)

| # | Method | Route | Line | Admin | Returns |
|---|--------|-------|------|-------|---------|
| 27 | GET | `/api/venues` | 1491 | No | Venue array |

#### Umpires (1 route)

| # | Method | Route | Line | Admin | Returns |
|---|--------|-------|------|-------|---------|
| 28 | GET | `/api/umpires` | 1498 | No | Umpire array |

#### Tournaments (5 routes)

| # | Method | Route | Line | Admin | Body | Returns |
|---|--------|-------|------|-------|------|---------|
| 29 | GET | `/api/tournaments` | 791 | No | — | Tournament array + teams |
| 30 | POST | `/api/tournaments` | 803 | YES | name, format, teams[] | 201 |
| 31 | DELETE | `/api/tournaments/<name>` | 825 | YES | — | 200 (cascades everything) |
| 32 | GET | `/api/tournaments/<name>/squad` | 849 | No | — | `{team: [players]}` |
| 33 | POST | `/api/tournaments/<name>/squad` | 871 | YES | {squads: [{teamName, playerID}]} | 201 |

#### Stats & Rankings (7 routes)

| # | Method | Route | Line | Admin | Params | Returns |
|---|--------|-------|------|-------|--------|---------|
| 34 | GET | `/api/stats/scorecard/<id>` | 956 | No | — | Full scorecard (bat, bowl, XI) |
| 35 | GET | `/api/stats/overview` | 1017 | No | ?tournamentName= | Aggregate stats |
| 36 | GET | `/api/stats/leaderboard` | 901 | No | ?tournamentName= | Top batsmen, bowlers, distributions |
| 37 | GET | `/api/stats/player` | 1508 | No | ?name= | Recent form + yearly breakdown |
| 38 | GET | `/api/stats/h2h` | 1543 | No | ?team1=, ?team2= | Win counts |
| 39 | GET | `/api/stats/player_vs_player` | 1563 | No | ?batsman=, ?bowler= | Balls, runs, dismissals |
| 40 | GET | `/api/stats/player_vs_team` | 1580 | No | ?player=, ?team= | Runs scored |
| 41 | GET | `/api/rankings/teams` | 1045 | No | ?format= | Team wins ranking |
| 42 | GET | `/api/rankings/players` | 1066 | No | ?format= | Player rankings |
| 43 | PUT | `/api/matches/<id>/complete` | 1599 | YES | winnerName?, winMargin? | 200 |
| 44 | GET | `/api/tournaments/<name>/standings` | 1619 | No | — | P, W, L, NR, pts, NRR |

#### Dev/Seed (2 routes)

| # | Method | Route | Line | Admin | Returns |
|---|--------|-------|------|-------|---------|
| 45 | POST | `/api/dev/reset` | 403 | YES | Drops all tables, recreates |
| 46 | POST | `/api/seed` | 418 | No | Seeds 10 teams, 251 players, 251 squads |
| 47 | GET | `/api/debug/players` | — | No | Debug player list |

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
| Column | Type |
|--------|------|
| tournamentName | TEXT PK |
| format | TEXT NOT NULL |
| totalTeams | INTEGER |
| overs | INTEGER |

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
| inningsNumber | INTEGER NOT NULL | CHECK: 1–4 |
| strikerID | TEXT | |
| nonStrikerID | TEXT | |
| bowlerID | TEXT | |
| PK: (matchID, inningsNumber) | | |

---

## 5. Frontend — HTML Pages

### 5.1 login.html (57 lines)
- Auth card with cricket branding, email/password form
- Calls `auth.js` for login logic
- Links to `signup.html`

### 5.2 index.html (173 lines) — Dashboard
- Tournament filter dropdown
- 6 stat boxes: Matches, Teams, Runs, Wickets, Sixes, Fours
- Completed Tournaments table
- Top Run Scorers + Top Wicket Takers (side by side)
- Recent Matches table
- Loads Chart.js from CDN
- Calls `logic.js`

### 5.3 matches.html (644 lines) — Most Complex Page
**Three major views:**

**A. Match List View** (lines 58–100)
- Header: "Match Centre" + "Add Match" button (admin-only)
- Format filter: All/T20/T10/ODI/TEST
- Table: ID, Tournament, Format, Type, Team1, Score1, Team2, Score2, Winner, Date, Actions

**B. Scorecard Detail View** (lines 102–262, hidden by default)
- "Back to Matches" + "Enter Ball" (admin-only)
- Scorecard header (JS-populated)
- 6 main tabs: 1st Innings Batting, 1st Innings Bowling, 2nd Innings Batting, 2nd Innings Bowling, Playing XI, Detailed Stats
- 1st/2nd Innings Batting tabs: broadcast-style batting card with 3 row states (out/not out/yet to bat) via `sc-*` CSS classes; `pickBattingXI()` determines which XI batted
- 1st/2nd Innings Bowling tabs → placeholder (design pending)
- Playing XI: two-column team boxes
- Detailed Stats → two sub-tabs:
  - **Players Performance** → 2 sub-sub-tabs (1st/2nd Innings Bowling) — batting lives on main tabs
  - **Ball Log** → same as before (over-by-over visual + detailed table)

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

### 5.4 players.html (203 lines)
- Search bar + Team dropdown + Role filter (All/Batsman/Bowler/AllRounder/WicketKeeper)
- Player grid (JS-populated with cards)
- Add Player modal: team, name, DOB, nationality, batting style, bowling style, role
- Edit Player modal: same fields

### 5.5 teams.html (150 lines)
- Teams table: Rank, Team, Country, Coach, "View Roster" button
- Add Team form (inline, admin-only)
- Team Detail view: Header (flag, name, ranking, coach, squad size), Roster (featured player hero + scrollable table), Match History

### 5.6 tournaments.html (196 lines)
- "Create Tournament" button (admin-only)
- Create form: name, format, total teams, overs, team checkboxes
- Running + Completed tournament tables
- Squad Selection Modal (wizard: team-by-team, 16 players each)
- Squad View Modal (player grid for selected team)
- Standings Modal (P, W, L, NR, Pts, NRR table)

### 5.7 rankings.html (110 lines)
- Format filter dropdown
- Team Rankings: Team, Matches, Wins
- Player Rankings: Player, Role, Runs, Wickets

### 5.8 stats.html (134 lines)
- Stat Type selector: Player Stats, Head to Head, Player vs Player, Player vs Team
- Dynamic input fields based on selection
- Results: Player Stats card (recent form table + year-by-year chart) or Generic card

---

## 6. Frontend — JavaScript Files

### 6.1 auth.js (~80 lines)
Handles login/signup form submissions. Stores user object + token in `localStorage.cricketUser`. Redirects to `matches.html` on success.

### 6.2 logic.js (~300 lines) — Dashboard
| Function | Line | Purpose |
|----------|------|---------|
| `loadDashboardStats()` | — | Fetches `/api/stats/overview`, populates 6 stat boxes |
| `loadLeaderboards()` | — | Fetches `/api/stats/leaderboard`, renders top batsmen/bowlers |
| `loadRecentMatches()` | — | Fetches `/api/matches`, renders last 10 |
| `loadCompletedTournaments()` | — | Fetches tournaments, renders completed ones |
| `refreshAIInsight()` | — | Fetches `/api/stats/ai-insight`, updates pill text |

### 6.3 matches.js (1859 lines) — Largest File

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
| `beInnings` | Current innings (1 or 2) |
| `beRuns` | Current pending runs |
| `beDelType` | Current delivery type

**Key Functions:**

| Function | Line | Purpose |
|----------|------|---------|
| `authFetch()` | 2 | Wrapper adding Bearer token |
| `getUser()` | 42 | Parse localStorage user |
| `logout()` | 53 | Clear auth, redirect |
| `showToast()` | 57 | Flash notification |
| `loadMatches()` | 111 | Fetch + render match list |
| `setFormatFilter()` | 122 | Toggle format filter |
| `renderMatchList()` | 130 | Build match table HTML |
| `viewScorecard()` | 164 | Load + show scorecard |
| `backToList()` | 184 | Return to match list |
| `renderScorecard()` | 190 | Build full scorecard, calls `pickBattingXI()` |
| `renderBatTable()` | 244 | Broadcast-style batting card (sc-out/sc-notout/sc-dnb + formatDismissal) |
| `renderBatTableClassic()` | 397 | Old-style batting table for Detailed Stats sub-sub-tabs |
| `buildPickerRow()` | — | Inline new-batter picker after last dismissed row |
| `renderBowlTable()` | — | Bowling stats table |
| `renderXIBoxes()` | — | Playing XI display |
| `switchInnings()` | — | Main tab switching (6 tabs) |
| `switchDetailTab()` | — | Detailed Stats sub-tab switching (Players Performance / Ball Log) |
| `switchPerfTab()` | — | Players Performance sub-sub-tab switching (1st/2nd Bat old-style + 1st/2nd Bowl) |
| `formatDismissal()` | 227 | Composes c {f} b {b}, st {f} b {b}, run out ({f}), etc. |
| `pickBattingXI()` | 208 | Infers batting team XI by matching batsmanIDs |
| `undoLastBall()` | — | Delete last ball |
| `deleteMatch()` | — | Delete match with confirm |
| `populateSelectDropdowns()` | — | Fill match wizard dropdowns |
| `openAddMatchModal()` | — | Show match wizard |
| `handleMatchWizard()` | — | Submit new match + XI |
| `openBallEntry()` | — | Enter live scoring mode |
| `closeLiveScoring()` | — | Return to scorecard |
| `filterContextPlayers()` | 1037 | Populate context dropdowns — newBatterOpts excludes both striker+non-striker at crease |
| `openContextModal()` | 1106 | Show striker/bowler selection |
| `cancelContextModal()` | 1148 | Cancel with enforcement toast |
| `confirmContext()` | 1157 | Apply context selection |
| `persistContext()` | 1190 | Save context to server |
| `manualSwapStriker()` | 1206 | Swap striker/non-striker |
| `updateScoreboardStrip()` | 1214 | Update score display |
| `lsRefreshStats()` | 1229 | Refresh batter/bowler stats — calls renderBatTable+renderBowlTable with activeIds |
| `lsSwitchScorecardTab()` | 1301 | Switch live card (bat/bowl) |
| `lsPickNewBatter()` | — | Sets striker, clears pendingNewBatter, calls lsRefreshStats |
| `lsOpenWicketModal()` | — | WK fielder tagging with data-wk attribute |
| `lsOnWicketTypeChange()` | — | Auto-select WK for Stumped |
| `updateTimeline()` | — | Render current over dots |
| `lsRecordRun()` | — | Record runs (0–6) |
| `lsOpenExtraModal()` | — | Open extras dialog |
| `lsConfirmExtra()` | — | Submit extras |
| `lsOpenWicketModal()` | — | Open wicket dialog |
| `lsConfirmWicket()` | — | Submit wicket |
| `lsSubmitBall()` | 1483 | **Core function**: validate, POST ball, handle wicket, advance ball, swap strikes, persist, broadcast |
| `loadBallLog()` | — | Fetch + render ball log |
| `renderBallLogViz()` | — | Over-by-over colored chips |
| `renderBallLogTable()` | — | Detailed ball log table |
| `playCrowdSound()` | — | Web Audio API crowd noise |
| `customConfirm()` | — | Promise-based confirm modal |

### 6.4 players.js (431 lines)

| Function | Line | Purpose |
|----------|------|---------|
| `teamSortKey()` | 29 | Sort teams by `TEAM_ORDER` |
| `loadPlayers()` | 101 | Fetch players + stats |
| `applyFilters()` | 132 | Filter by role/search/team |
| `setRoleFilter()` | 157 | Toggle role filter |
| `renderPlayers()` | 164 | Build player card grid |
| `getCountryCode()` | 256 | Country → flagcdn code |
| `openAddModal()` | 273 | Show add player form |
| `openEditModal()` | 297 | Populate + show edit form |
| `deletePlayer()` | 319 | Delete with confirm |
| `setupForms()` | 333 | Attach add/edit form handlers |

**Global Constants:**
- `TEAM_ORDER`: Pakistan → India → Australia → SA → NZ → WI → rest alphabetical
- `ROLE_EMOJI`: {Batsman: '🏏', Bowler: '⚡', AllRounder: '🔄', WicketKeeper: '🧤'}

### 6.5 teams.js (364 lines)

| Function | Line | Purpose |
|----------|------|---------|
| `loadTeams()` | 100 | Fetch + render team list |
| `rankBadge()` | 111 | Rank 1/2/3 special badges |
| `getCountryCode()` | 118 | Country → flag code |
| `renderTeams()` | 134 | Build team table |
| `toggleAddTeamForm()` | 168 | Show/hide add form |
| `saveTeam()` | 173 | Submit new team |
| `viewTeam()` | 206 | Load team detail |
| `renderTeamDetail()` | 226 | Build header, roster, match history |

**Constants:**
- `FLAG_MAP`: {Pakistan: '🇵🇰', India: '🇮🇳', Australia: '🇦🇺', ...}
- `FEATURED_PLAYERS`: 10 teams → star player (Babar Azam, Virat Kohli, Steve Smith, Kane Williamson, Rovman Powell, Aiden Markram, Rashid Khan, Litton Das, Harry Brook, Dasun Shanaka)

### 6.6 tournaments.js (413 lines)

| Function | Line | Purpose |
|----------|------|---------|
| `toggleForm()` | 61 | Show/hide create form |
| `loadTeamsOptions()` | 66 | Populate team checkboxes |
| `loadTournaments()` | 82 | Fetch + render (running vs completed) |
| `viewStandings()` | 138 | Fetch + show standings modal |
| `deleteTournament()` | 192 | Delete with confirm |
| `saveTournament()` | 205 | Create + start squad wizard |
| `startSquadSelection()` | 249 | Initialize squad wizard |
| `renderSquadTeam()` | 275 | Show current team's player grid |
| `updateSquadCounter()` | 313 | Count selected players |
| `nextSquadTeam()` | 319 | Advance to next team |
| `submitAllSquads()` | 338 | POST all squads |
| `viewTournamentSquad()` | 359 | View registered squad |

### 6.7 rankings.js (107 lines)

| Function | Line | Purpose |
|----------|------|---------|
| `loadRankings()` | 28 | Fetch team + player rankings |
| `fmtRole()` | 15 | Format role with badge |

### 6.8 transitions.js (~200 lines)
- `DataSync` object: BroadcastChannel + localStorage fallback
- Events: `ball-recorded`, `match-completed`, `match-created`, `data-changed`
- Scroll-to-top button visibility
- Nav auto-hide on scroll (hide down, show up)
- `document.startViewTransition()` wrapper

---

## 7. Frontend — CSS (style.css, 2214 lines)

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
| 2228–2309 | **Broadcast Scorecard** | `.sc-bat-row`, `.sc-out` (gold+pink strikethrough), `.sc-notout` (mint-green bar), `.sc-dnb` (dimmed), `.sc-name` (1.05rem), `.sc-dismissal` (0.88rem muted), `.sc-num` (1.15rem Orbitron bold), `.sc-table thead th` (0.88rem), `.sc-picker-row`, `.sc-picker-select` |

---

## 8. Data Files

### 8.1 seed_data.py
- `teams`: 10 entries (Pakistan, India, Australia, SA, NZ, England, WI, Sri Lanka, Bangladesh, Afghanistan)
- `players`: 251 entries (25 per team), each with playerID, name, DOB, nationality, battingStyle, bowlingStyle, playerRole
- `squads`: 251 entries mapping each player to their team

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
| **Admin** | Full CRUD: create/manage teams, players, tournaments, matches; enter ball-by-ball live scoring; delete data |
| **Fan (default)** | Read-only: browse dashboards, view scorecards, view player/team stats, view leaderboards |

Authentication uses email + password with Bearer token. Signup stores password with Werkzeug hashing. Admin signup requires a shared admin key (`CRICKET_ADMIN_2026`).

## 10. Business Rules

### 10.1 Bowler Rules

| Format | Max Overs |
|--------|-----------|
| T10 | 2 |
| T20 | 4 |
| ODI | 10 |
| TEST | Unlimited (null) |

- A bowler **cannot bowl two consecutive overs**. If only one bowler has overs remaining, the rule is bypassed.
- Checked server-side in `enforce_bowler_rules()` before every ball insert
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

**6 Main Tabs:** 1st Innings Batting, 1st Innings Bowling (placeholder), 2nd Innings Batting, 2nd Innings Bowling (placeholder), Playing XI, Detailed Stats

**Broadcast Batting Table (7 columns):** `Batsman | Dismissal | Runs | Balls | 4s | 6s | SR`

| Row state | CSS class | Visual |
|-----------|-----------|--------|
| Out | `sc-out` | Gold name + pink strikethrough, white runs |
| Not out | `sc-notout` | Full mint-green `#b9f6ca` bar, dark text |
| Yet to bat | `sc-dnb` | Dimmed name (0.6 opacity), dash stats |

**Scorecard text sizes:**
| Element | Size | Font |
|---------|------|------|
| Table headers | 0.88rem | Poppins |
| Player name | 1.05rem | Poppins bold |
| Dismissal/status | 0.88rem | Poppins |
| Numbers | 1.15rem | Orbitron bold |
| Card heading | 1.25rem | Orbitron |

**Detailed Stats (2 sub-tabs):**
- **Players Performance** → 4 sub-sub-tabs: 1st/2nd Innings Batting (old-style), 1st/2nd Innings Bowling
- **Ball Log** → over-by-over visual + detailed table

### 11.7 Live Scoring Card Tabs

Below ball entry, centered tab bar (`ls-sc-tab-bat`/`ls-sc-tab-bowl`) switches between panels.

- **Batting card**: uses `renderBatTable()` with `activeIds` + `pendingWicket` opts; same broadcast-style as main tabs
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

## 12. Key Decisions & Known Issues

### 12.1 Backend Decisions

- **SQLite with WAL**: Simple, no external DB server needed
- **`get_db()` per request**: Fresh connection per request, auto-commits via `with`
- **`requires_admin` decorator**: Wraps routes to check `user['isAdmin']`
- **`enforce_bowler_rules()`**: Server-side validation for consecutive overs + max overs per format
- **`save_match_state()`**: Persists striker/non-striker/bowler to `MatchState` after every ball

### 12.2 Frontend Decisions

- **No framework**: Vanilla JS with `fetch`/`authFetch`. All rendering via `innerHTML` templates
- **`authFetch()`**: Wrapper adding `Authorization: Bearer <token>`
- **`window.DataSync`**: BroadcastChannel with localStorage fallback for cross-tab sync
- **`pendingNewBatter` block**: Local flag prevents ball entry until new batter selected after wicket

### 12.3 Known Issues / Tech Debt

**Critical:**
1. **`seed_data.py` missing venues/umpires**: `/api/seed` endpoint will crash on first run
2. **No CSRF protection**: Token-based auth via localStorage, no CSRF tokens

**Moderate:**
3. **`lsRefreshStats` uses plain `fetch`**: No auth header, relies on `?_t=` cache-busting
4. **`dummy.png` and `player-placeholder.svg`**: Two different fallback systems for player images

**Low:**
5. **Inline styles**: Many components use extensive inline styles rather than CSS classes
6. **No password hashing migration**: Older accounts may have plaintext passwords (new ones use Werkzeug hashing)

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
# Then hit /api/seed (note: will fail on venues/umpires due to seed_data bug)
```
