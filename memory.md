# Project Memory — CricketStats Pro

## Current State
Working full-stack cricket stats app with live ball-by-ball scoring, running on `localhost:5001`.

## Key Decisions & Rationale

### Backend
- **SQLite with WAL**: Simple, no external DB server needed. WAL mode for concurrent read/write.
- **`get_db()` per request**: Each request gets a fresh connection (no connection pooling). Auto-commits via `with` context manager.
- **`requires_admin` decorator**: Wraps routes to check `user['isAdmin']` from Bearer token. Returns 403 if not admin.
- **`enforce_bowler_rules()`**: Server-side validation prevents: same bowler two consecutive overs, bowler exceeding max overs for format.
- **`save_match_state()`**: Persists striker/non-striker/bowler to `MatchState` table after every ball. Restored on reload.

### Frontend
- **No framework**: Vanilla JS with `fetch`/`authFetch`. All rendering via `innerHTML` string templates.
- **`authFetch()`**: Wrapper that adds `Authorization: Bearer <token>` header. Used everywhere except `lsRefreshStats` (which uses plain `fetch` with cache-busting `?_t=` param).
- **`window.DataSync`**: BroadcastChannel with localStorage fallback for cross-tab sync.
- **`viewScorecard()`**: Navigates from match list → scorecard detail. Sets `beMatchId` for ball entry.
- **`openBallEntry()`**: Transitions from scorecard → live scoring view. Fetches match state, populates context.

### Auth Flow
1. User signs up with email/password + optional admin key
2. Login returns token stored in `localStorage.cricketUser`
3. Every page checks `localStorage` on load, redirects to `login.html` if missing
4. Non-admin users: `.admin-only` elements stripped from DOM on DOMContentLoaded

## Known Issues / Tech Debt

### Critical
1. **`seed_data.py` missing venues/umpires**: `app.py:439-442` references `seed_data.venues` and `seed_data.umpires` which don't exist. The `/api/seed` endpoint will crash on first run.
2. **No password hashing**: Passwords stored as plaintext in the `users` table.
3. **`MatchState` delete on match deletion**: Fixed (was causing 500 errors), now included in both single match delete and tournament cascade delete.

### Moderate
4. **Scorecard endpoint indentation**: `return jsonify(...)` in `/api/stats/scorecard/<match_id>` was outside the `with get_db()` block. Fixed by moving inside.
5. **`lsRefreshStats` uses plain `fetch`**: No auth header, relies on cache-busting `?_t=` to avoid caching. Should use `authFetch` for consistency.
6. **Duplicate `confirmDeleteBall`**: Had two definitions due to JS hoisting. Fixed by removing the old one.

### Low
7. **`dummy.png` and `player-placeholder.svg`**: Two different fallback systems for player images depending on context.
8. **No CSRF protection**: Token-based auth via localStorage, no CSRF tokens.
9. **Inline styles**: Many components use extensive inline styles rather than CSS classes.

## File Edit History (This Session)

### Bug Fixes Applied
- `app.py`: Fixed scorecard endpoint indentation (return inside `with` block)
- `app.py`: Added `DELETE FROM MatchState` to match deletion + tournament cascade
- `app.py`: Added `try/except` to delete_match with error logging
- `app.py`: Updated `get_batting` query to include `fielderName` and `bowlerName` subqueries
- `matches.js`: Fixed duplicate `confirmDeleteBall` function
- `matches.js`: Fixed `openBallEntry()` display code moved inside try block
- `matches.js`: Added `pendingNewBatter` enforcement after wickets
- `matches.js`: Added `cancelContextModal()` function
- `matches.js`: Fixed `ls-wicket-who` dropdown population (was empty, caused dismissed player ID to never send)
- `teams.js`: Added 4 missing featured players (Afghanistan, Bangladesh, England, Sri Lanka)
- `style.css`: Fixed team roster grid sizing (280px → 240px column, 320px → 280px image height)

### Features Added
- Live scoring card tabs (Batting/Bowling) below ball entry
- Scorecard tab restructure: 6 main tabs (1st/2nd Innings Bat/Bowl, Playing XI, Detailed Stats); batting on main tabs with broadcast-style `sc-*` classes (`sc-out`, `sc-notout`, `sc-dnb`); Detailed Stats has Players Performance (bowling only) + Ball Log; `pickBattingXI()` + `renderBatTable(tbId, rows, xiRows)` rewrite
- `beDismissedIDs` local tracking with server merge
- `pendingNewBatter` flag system
- `cancelContextModal()` with enforcement toast

## Running the App
```
python app.py
```
Server: `http://localhost:5001`
Navigate to: `http://localhost:5001/login.html`

## Database Reset
```
python reset_db.py
python app.py
# Then hit /api/seed (note: will fail on venues/umpires due to seed_data bug)
```
