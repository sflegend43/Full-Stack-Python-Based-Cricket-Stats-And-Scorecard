# Product Requirements Document — CricketStats Pro

## 1. Overview
CricketStats Pro is a full-stack Python/Flask cricket statistics and live scorekeeping platform. It serves as both a data entry tool for administrators and a read-only statistics viewer for fans, with an AI-powered insights layer.

## 2. Users & Roles

| Role | Capabilities |
|------|-------------|
| **Admin** | Full CRUD: create/manage teams, players, tournaments, matches; enter ball-by-ball live scoring; delete data |
| **Fan (default)** | Read-only: browse dashboards, view scorecards, view player/team stats, view leaderboards |

Authentication uses email + password with Bearer token. Passwords are stored as **Werkzeug hashes** (bcrypt-backed). Admin signup requires a shared admin key (`CRICKET_ADMIN_2026` dev fallback; override via `CRICKET_ADMIN_KEY` env var).

## 3. Pages

| Page | Purpose | Role Access |
|------|---------|-------------|
| `login.html` | Email/password auth, signup with role toggle | All |
| `index.html` | Dashboard: overview stats, leaderboards, AI insights | All |
| `matches.html` | Match list, scorecard detail, ball-by-ball live scoring, Super Over | All (live scoring = admin) |
| `players.html` | Player roster grid, detail modal, hero cards, search/filter | All (add/edit = admin) |
| `teams.html` | Team list, roster view with featured player image, match history | All (add = admin) |
| `tournaments.html` | Tournament list, standings, create tournament, schedule board, bracket view | All (create = admin) |
| `rankings.html` | Team and player rankings by format | All |
| `records.html` | Hall of Fame — all-time records across batting and bowling | All |
| `stats.html` | Natural language AI queries against match data | All |

## 4. Core Features

### 4.1 Match Management
- Create match via wizard: select tournament, teams, toss, format (T10/T20/ODI/TEST), venue, umpires
- Playing XI selection with role-based categories (Openers, Middle Order, AllRounders, Spinners, Fast Bowlers)
- Captain + Wicket Keeper assignment per team
- Match completion with winner selection
- **Super Over** support: innings 3-4 with 6 legal balls max and 2 wickets max per super over

### 4.2 Live Ball-by-Ball Scoring
- Two-column layout: left = scorecard + timeline, right = numpad keypad
- Record runs (0–6), extras (Wide, NoBall, Bye, LegBye, Penalty), wickets (12 dismissal types)
- Current over timeline with 6 circular indicators
- Striker/non-striker swap, context modal for opener/wicket/bowler changes
- Enforced bowler rules: max overs per bowler by format, no consecutive overs
- Retire batter support (Retired Hurt / Retired Out)
- UNDO last ball, delete specific balls (admin only)
- Persisted match state (striker, non-striker, bowler) across page reloads
- **Free Hit** after No Ball: protected dismissals blocked; re-armed on chained no-balls
- **Super Over** flow: innings 3+ bypasses bowler enforcement; team batting order swaps correctly

### 4.3 Scorecard
- Full batting card: runs, balls, 4s, 6s, SR, dismissal info with fielder + bowler
- Full bowling card: overs, maidens, runs, wickets, economy
- Ball-by-ball log with over-by-over run summary
- Scorecard tabs: 6 main tabs — 1st/2nd Innings Batting (broadcast-style), 1st/2nd Innings Bowling, Playing XI, Detailed Stats
- **Broadcast batting** (`renderBatTable`): 7 columns (Batsman, Dismissal, Runs, Balls, 4s, 6s, SR); 3 row states (`sc-out` gold+pink strikethrough, `sc-notout` mint-green bar, `sc-dnb` dimmed); `formatDismissal()` composes `c {f} b {b}`, `st {f} b {b}`, `run out ({f})`, `lbw b {b}`, `b {b}`, etc.
- **Batting order**: batted→XI position; active-but-not-batted→right after batted; yet-to-bat→XI order (strict arrival order)
- Detailed Stats → 2 sub-tabs:
  - **Players Performance** → 4 sub-sub-tabs (1st/2nd Innings Batting old-style, 1st/2nd Innings Bowling)
  - **Ball Log** → over-by-over visual + detailed table
- Batting card uses `pickBattingXI()` to determine batting team; accepts `opts.activeIds` and `opts.pendingWicket` for live updates
- Live scoring tabs below ball entry: Batting card + Bowling card with state-based row styling; WK fielder tagging with `data-wk`

### 4.4 Player Management
- Player cards with hero image, role badge, flag, batting/bowling style, DOB
- Role filter, search by name, sort by nationality (TEAM_ORDER)
- Add/Edit modal (admin)
- Player stats endpoint: batting avg, strike rate, bowling avg, economy

### 4.5 Team Management
- Featured player hero image per team (10 teams mapped)
- Roster table with scrollable list
- Match history per team
- Ranking badge system

### 4.6 Tournament Management
- Create tournament with format, teams, start/end dates
- Tournament squad registration
- Standings modal: P, W, L, NR, pts, NRR
- Cascade delete (matches + balls + playingXI + matchState)
- Schedule board with visual bracket/tree view

### 4.7 Rankings
- Team rankings: calculated from match wins, filterable by format (T10/T20/ODI/TEST)
- Player rankings: batting (runs), bowling (wickets), all-rounders (combined), filterable by role
- CSV export for both team and player rankings

### 4.8 Records & Hall of Fame
- All-time records across: Most Runs, Most Wickets, Most Sixes, Most Fours, Highest Individual Scores, Best Bowling (Innings)
- Filterable by format (All/T10/T20/ODI/TEST)

### 4.9 AI Stats
- Natural language query page (stats.html)
- Parses queries for player names, team names, match types, date ranges
- Modes: Player Stats, Head to Head, Player vs Player, Player vs Team
- Returns structured statistics with KPI grids and charts

### 4.10 Cross-Page Sync
- BroadcastChannel (`window.DataSync`) with localStorage fallback
- Events: `ball-recorded`, `match-completed`, `match-created`, `data-changed`
- Auto-refresh on all pages when data changes

## 5. Non-Functional Requirements
- Dark theme throughout with CSS custom properties
- Google Fonts: Poppins (body) + Orbitron (headings/scores)
- Responsive down to 700px (mobile layout collapses grid to single column)
- Player images served from `Players Pics/` folder (95 PNG files)
- `dummy.png` as fallback for missing player images
- Server runs on `localhost:5001`
- SQLite database: `cricket_stats.db` with WAL journaling
- Token-based sessions with 7-day TTL (configurable via `CRICKET_TOKEN_TTL_SECONDS`)
