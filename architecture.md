# Architecture — CricketStats Pro

## 1. Stack

```
┌─────────────────────────────────────────────┐
│              Browser (SPA-like)              │
│  HTML + CSS + Vanilla JS (no framework)     │
│  BroadcastChannel for cross-tab sync         │
└──────────────────┬──────────────────────────┘
                   │ HTTP (fetch / authFetch)
┌──────────────────▼──────────────────────────┐
│           Flask (Python) on :5001            │
│  auth: Bearer token (stored in localStorage)│
│  CORS: enabled for all routes               │
└──────────────────┬──────────────────────────┘
                   │ sqlite3
┌──────────────────▼──────────────────────────┐
│         SQLite: cricket_stats.db             │
│  WAL journal mode, foreign_keys=ON          │
└─────────────────────────────────────────────┘
```

## 2. File Structure

```
/
├── app.py                  # Flask app: all API routes, DB init, seed
├── seed_data.py            # Static data: 10 teams, 251 players, 251 squads
├── reset_db.py             # DB reset utility
├── dump_schema.py          # Schema dump utility
├── cricket_stats.db        # SQLite database
├── requirements.txt        # Python deps
├── Start_App.bat           # Windows launcher
│
├── index.html              # Dashboard
├── login.html              # Auth page
├── matches.html            # Match list + scorecard + live scoring
├── players.html            # Player roster + detail modal
├── teams.html              # Team list + roster + match history
├── tournaments.html        # Tournament list + standings
├── rankings.html           # Team + player rankings
├── stats.html              # AI stats query
│
├── style.css               # Global styles (~2309 lines)
├── cricket_anim.css        # Animations
├── transitions.js          # View transitions + scroll behavior + DataSync
├── auth.js                 # Shared auth helpers (authFetch, getUser)
├── logic.js                # Dashboard logic (overview, leaderboards, AI insight)
├── matches.js              # Match list, scorecard, live scoring (~1859 lines)
├── players.js              # Player cards, search, hero images (~430 lines)
├── teams.js                # Team list, roster, featured player
├── tournaments.js          # Tournament CRUD, standings
├── rankings.js             # Team + player rankings
│
├── Players Pics/           # 95 player PNG images + 1 SVG placeholder
├── dummy.png               # Fallback player image
├── player-placeholder.svg  # Players page hero fallback
├── stadium_bg.png          # Background overlay
└── batsman.png             # Cricket animation asset
```

## 3. Database Schema (13 Tables)

```
users ─────────────── Auth (id, fullname, email, password, role, isAdmin, token)
Players ───────────── Player profile (playerID PK, name, role, DOB, battingStyle, bowlingStyle, nationality, ...)
Team ──────────────── Team registry (teamName PK, country, ranking, headCoach)
Venue ─────────────── Venues (venueID PK, name, location)
Umpire ────────────── Umpires (umpireID PK, name, country)
Matches ───────────── Match record (matchID PK, teams, scores, toss, format, winner, FK→Team, FK→Venue)
BallByBall ────────── Ball events (ballID PK, matchID FK→Matches, over, ball, batsman, bowler, runs, extras, wicket)
Squad ─────────────── Team rosters (teamName FK→Team, playerID FK→Players, PK=compound)
PlayingXI ─────────── Match squads (matchID FK→Matches, playerID FK→Players, matchRole)
MatchState ────────── Live scoring state (matchID FK→Matches, innings, striker, nonStriker, bowler)
Tournament ────────── Tournament registry (tournamentName PK, format, startDate, endDate)
TournamentTeams ───── Tournament participants (tournamentName FK, teamName FK)
TournamentSquad ───── Tournament squads (tournamentName FK, teamName FK, playerID FK)
```

## 4. API Endpoints (47 Routes)

### Auth
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/auth/login` | None | Login, returns token |
| POST | `/api/auth/signup` | None | Register user |
| GET | `/api/auth/me` | Token | Current user profile |
| PUT | `/api/auth/update-profile` | Token | Update name/email |

### Players (7)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/players` | None | List all players |
| POST | `/api/players` | Admin | Create player |
| GET | `/api/players/<id>` | None | Player detail + stats |
| PUT | `/api/players/<id>` | Admin | Update player |
| DELETE | `/api/players/<id>` | Admin | Delete player (checks BallByBall) |
| GET | `/api/players/top-batsmen` | None | Top batsmen by format |
| GET | `/api/players/top-bowlers` | None | Top bowlers by format |

### Teams (4)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/teams` | None | List all teams with rankings |
| POST | `/api/teams` | Admin | Create team |
| GET | `/api/teams/<name>` | None | Team detail + squad + match history |

### Matches (6)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/matches` | None | List all matches |
| POST | `/api/matches` | Admin | Create match + Playing XI |
| GET | `/api/matches/<id>` | None | Match detail |
| DELETE | `/api/matches/<id>` | Admin | Delete match (cascades BallByBall, PlayingXI, MatchState) |
| PUT | `/api/matches/<id>/complete` | Admin | Set winner |
| POST | `/api/matches/<id>/xi` | Admin | Save Playing XI |

### Balls (4)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/balls` | Admin | Record a ball (validates bowler rules) |
| GET | `/api/balls/<matchId>` | None | All balls for an innings |
| DELETE | `/api/balls/<ballId>` | Admin | Delete a ball |
| PUT | `/api/balls/state/<matchId>` | Admin | Get/set match state |

### Venues (3)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/venues` | None | List all venues |
| POST | `/api/venues` | Admin | Create venue |
| DELETE | `/api/venues/<id>` | Admin | Delete venue |

### Umpires (3)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/umpires` | None | List all umpires |
| POST | `/api/umpires` | Admin | Create umpire |
| DELETE | `/api/umpires/<id>` | Admin | Delete umpire |

### Tournaments (4)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/tournaments` | None | List tournaments with team counts |
| POST | `/api/tournaments` | Admin | Create tournament |
| GET | `/api/tournaments/<name>/standings` | None | League standings |
| DELETE | `/api/tournaments/<name>` | Admin | Delete (cascades matches) |

### Stats (6)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/stats/scorecard/<matchId>` | None | Full scorecard (batting + bowling + Playing XI) |
| GET | `/api/stats/overview` | None | Dashboard aggregates |
| GET | `/api/stats/players/stats` | None | Per-player batting + bowling stats |
| GET | `/api/stats/ai-insight` | None | AI insight text |
| POST | `/api/stats/ai-query` | None | Natural language query |
| GET | `/api/rankings/teams` | None | Team rankings |
| GET | `/api/rankings/players` | None | Player rankings |

### Utility
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/seed` | None | Seed initial data |
| GET | `/api/debug/players` | None | Debug: list all players |

## 5. Data Flow — Ball Entry

```
User taps numpad → lsRecordRun(n) / lsOpenExtraModal() / lsOpenWicketModal()
    → lsSubmitBall(payload) → authFetch(POST /api/balls)
        → Backend: enforce_bowler_rules() validates over limits
        → Backend: INSERT INTO BallByBall + save_match_state()
        → Backend: update match totals (team1TotalRuns etc.)
    → Frontend: local state update (scoreboard, timeline, batters)
    → If wicket: add to beDismissedIDs, set pendingNewBatter=true, openContextModal('wicket')
    → Frontend: lsRefreshStats() → GET /api/stats/scorecard
        → renderBatTable('ls-bat-body', allBat, allXI, { activeIds, pendingWicket, excludeFromPick })
        → renderBowlTable('ls-bowl-body', allBowl)
    → Frontend: DataSync.dataChanged('ball-recorded') → broadcast to other tabs
```

## 6. Batting Scorecard Rendering

```
renderBatTable(tbId, rows, xiRows, opts):
    1. Sort batted rows by XI position (xiPos map from xiRows)
    2. Compute battedIDs set
    3. Compute activeNotBatted = activeIds - battedIDs (B update: new striker without row)
    4. yetToBat = xiRows - battedIDs - activeNotBatted (in XI order)
    5. Render batted rows → sc-out / sc-notout with formatDismissal()
       - If pendingWicket: insert picker row after last dismissed batter
    6. Render activeNotBatted → synthetic sc-notout "playing" row
    7. Render yetToBat → sc-dnb dimmed rows
```

## 7. Wicket Flow — New Batter Selection

```
lsSubmitBall(isWicket=true):
    → local beDismissedIDs.push(dismissedPlayer)
    → POST /api/balls → fetch state
    → swap striker if odd runs/over-end
    → pendingNewBatter = true
    → openContextModal('wicket')
        → filterContextPlayers('wicket'):
            → newBatterOpts excludes: dismissed (out), any player at crease not out (both striker + non-striker)
    → User selects → confirmContext():
        → currentStriker = selectedPlayerID
        → pendingNewBatter = false
        → lsRefreshStats() → renderBatTable picks up activeIds
```

## 8. WK Fielder Tagging

```
lsOpenWicketModal():
    → Populate fielder dropdown from bowling team players
    → Designated WK gets data-wk attribute + "(WK)" label
lsOnWicketTypeChange():
    → If Stumped: auto-select option[data-wk]
```

## 9. Data Flow — Cross-Page Sync

```
Tab A records ball → DataSync.dataChanged('ball-recorded')
    → BroadcastChannel.postMessage({ type, timestamp })
    → localStorage fallback: setItem('dataSync', JSON.stringify(...))
    → Tab B listener fires → loadMatches() / loadTeams() / etc.
```

## 10. View Transitions API

All 7 pages include `<meta name="view-transition" content="same-origin">`. Navigation uses `document.startViewTransition()` wrapped in `transitions.js` for animated page switches.
