# Product Requirements Document — CricketStats Pro

## 1. Overview
CricketStats Pro is a full-stack, Python/Flask cricket statistics and live scorekeeping platform. It serves as both a data entry tool for administrators and a read-only statistics viewer for fans, with an AI-powered insights layer.

## 2. Users & Roles

| Role | Capabilities |
|------|-------------|
| **Admin** | Full CRUD: create/manage teams, players, tournaments, matches; enter ball-by-ball live scoring; delete data |
| **Fan (default)** | Read-only: browse dashboards, view scorecards, view player/team stats, view leaderboards |

Authentication uses email + password with Bearer token. Signup stores a plaintext password (no hashing). Admin signup requires a shared admin key.

## 3. Pages

| Page | Purpose | Role Access |
|------|---------|-------------|
| `login.html` | Email/password auth, signup with role toggle | All |
| `index.html` | Dashboard: overview stats, leaderboards, AI insights | All |
| `matches.html` | Match list, scorecard detail, ball-by-ball live scoring | All (live scoring = admin) |
| `players.html` | Player roster grid, detail modal, hero cards, search/filter | All (add/edit = admin) |
| `teams.html` | Team list, roster view with featured player image, match history | All (add = admin) |
| `tournaments.html` | Tournament list, standings, create tournament | All (create = admin) |
| `rankings.html` | Team and player rankings by format | All |
| `stats.html` | Natural language AI queries against match data | All |

## 4. Core Features

### 4.1 Match Management
- Create match via wizard: select tournament, teams, toss, format (T10/T20/ODI/TEST), venue, umpires
- Playing XI selection with role-based categories (Openers, Middle Order, AllRounders, Spinners, Fast Bowlers)
- Captain + Wicket Keeper assignment per team
- Match completion with winner selection

### 4.2 Live Ball-by-Ball Scoring
- Two-column layout: left = scorecard + timeline, right = numpad keypad
- Record runs (0–6), extras (Wide, NoBall, Bye, LegBye, Penalty), wickets (12 dismissal types)
- Current over timeline with 6 circular indicators
- Striker/non-striker swap, context modal for opener/wicket/bowler changes
- Enforced bowler rules: max overs per bowler by format, no consecutive overs
- Retire batter support (Retired Hurt / Retired Out)
- UNDO last ball, delete specific balls (admin only)
- Persisted match state (striker, non-striker, bowler) across page reloads

### 4.3 Scorecard
- Full batting card: runs, balls, 4s, 6s, SR, dismissal info with fielder + bowler
- Full bowling card: overs, maidens, runs, wickets, economy
- Ball-by-ball log with over-by-over run summary
- Scorecard tabs: 1st/2nd Innings Batting (broadcast-style with out/not-out/dnb rows), 1st/2nd Innings Bowling (placeholder), Playing XI, Detailed Stats
- Detailed Stats: Players Performance (bowling tables) + Ball Log (over-by-over visual + detailed table)
- Batting card uses `pickBattingXI()` to determine batting team; yet-to-bat players listed from Playing XI
- Live scoring tabs below ball entry: Batting card + Bowling card with state-based row styling

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

### 4.7 Rankings
- Team rankings: calculated from match wins, filterable by format
- Player rankings: batting (SR, avg) and bowling (wickets, avg, economy), filterable by format

### 4.8 AI Stats
- Natural language query page (stats.html)
- Parses queries for player names, team names, match types, date ranges
- Returns structured statistics

### 4.9 Cross-Page Sync
- BroadcastChannel (`window.DataSync`) with localStorage fallback
- Events: `ball-recorded`, `match-completed`, `match-created`, `data-changed`
- Auto-refresh on all pages when data changes

## 5. Non-Functional Requirements
- Dark theme throughout with CSS custom properties
- Google Fonts: Poppins (body) + Orbitron (headings)
- Responsive down to 700px (mobile layout collapses grid to single column)
- Player images served from `Players Pics/` folder (95 PNG files)
- `dummy.png` as fallback for missing player images
- `player-placeholder.svg` for players page hero fallback
- Server runs on `localhost:5001`
- SQLite database: `cricket_stats.db` with WAL journaling
