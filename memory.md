# Project Memory — CricketStats Pro

## Current State
Working full-stack cricket stats app with live ball-by-ball scoring, Super Over support, Free Hit enforcement, and Hall of Fame records. Running on `localhost:5001`.

## Key Decisions & Rationale

### Backend
- **SQLite with WAL**: Simple, no external DB server needed. WAL mode for concurrent read/write.
- **`get_db()` per request**: Each request gets a fresh connection (no connection pooling). Auto-commits via `with` context manager.
- **`requires_admin` decorator**: Wraps routes to check `user['isAdmin']` from Bearer token. Returns 403 if not admin.
- **`enforce_bowler_rules()`**: Server-side validation prevents: same bowler two consecutive overs, bowler exceeding max overs for format. **Bypassed for Super Over (innings >= 3).**
- **`save_match_state()`**: Persists striker/non-striker/bowler/freeHitPending to `MatchState` table after every ball. Restored on reload.
- **Passwords**: All passwords hashed with Werkzeug (`generate_password_hash`). Legacy plaintext passwords self-heal to hashed on next login.

### Frontend
- **No framework**: Vanilla JS with `fetch`/`authFetch`. All rendering via `innerHTML` string templates.
- **`authFetch()`**: Wrapper that adds `Authorization: Bearer <token>` header. Used everywhere.
- **`window.DataSync`**: BroadcastChannel with localStorage fallback for cross-tab sync.
- **`viewScorecard()`**: Navigates from match list → scorecard detail. Sets `beMatchId` for ball entry.
- **`openBallEntry()`**: Transitions from scorecard → live scoring view. Fetches match state, populates context.

### Auth Flow
1. User signs up with email/password + optional admin key
2. Login returns token stored in `localStorage.cricketUser`
3. Every page checks `localStorage` on load, redirects to `login.html` if missing
4. Non-admin users: `.admin-only` elements stripped from DOM on DOMContentLoaded

## Known Issues / Tech Debt

### Resolved ✅
1. ~~**`seed_data.py` missing venues/umpires**~~: Venues (12) + umpires (8) now present in `seed_data.py`. Seed smoke-tested OK.
2. ~~**No password hashing**~~: Passwords are now hashed with Werkzeug on signup; legacy plaintext passwords self-heal on login.
3. ~~**`MatchState` delete on match deletion**~~: Fixed — included in both single match delete and tournament cascade delete.
4. ~~**Scorecard endpoint indentation**~~: `return jsonify(...)` moved inside the `with get_db()` block.
5. ~~**`lsRefreshStats` uses plain `fetch`**~~: Now uses `authFetch` for consistency.
6. ~~**Duplicate `confirmDeleteBall`**~~: Removed duplicate function definition.

### Moderate
7. **No CSRF protection**: Token-based auth via localStorage, no CSRF tokens. Acceptable for this use case.
8. **Inline styles**: Many components use extensive inline styles rather than CSS classes.
9. **`dummy.png` and `player-placeholder.svg`**: Two different fallback systems for player images depending on context. Low priority.

### Low
10. **`enhance.js` duplicates `refreshAIInsight`**: Both `logic.js` and `enhance.js` define this function. `enhance.js` is the canonical version used on all pages; `logic.js` version is used by `refreshDashboard()` locally. Harmless but worth consolidating.

## File Edit History

### Bug Fixes Applied (Previous Sessions)
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

### Bug Fixes Applied (Session 2026-09-17)
- `auth.js`: Fixed role ID mismatch — `getElementById('role')` → `getElementById('role-select') || getElementById('role')`. **Critical fix**: admin signup via form was always creating 'user' accounts.
- `logic.js`: Removed dead `const running = ...` variable with operator-precedence bug (`||` vs `&&`); was never used.
- `teams.js`: Reordered `getUser()` before `authFetch()` to eliminate temporal dead zone; moved file header comment to line 1.
- `signup.html`: Moved `toggleAdminKey()` inline `<script>` out of `<form>` element to before `</body>` — invalid HTML placement.

### Features Added (Previous Sessions)
- Live scoring card tabs (Batting/Bowling) below ball entry
- Scorecard tab restructure: 6 main tabs + super over tabs
- Broadcast batting card with `formatDismissal()` helper
- Batting order enforcement with XI position tracking
- WK fielder tagging with `data-wk` attribute; auto-selects WK on Stumped
- New batter picker with `pendingNewBatter` flag system
- Free Hit badge in live scoring UI
- Super Over support (innings 3-4)
- Hall of Fame records page (`records.html` + `records.js`)
- Tournament schedule board + bracket view
- AI Stats page with 4 query modes (Player, H2H, PvP, PvT)

## Running the App
```
python app.py
```
Server: `http://localhost:5001`
Navigate to: `http://localhost:5001/login.html`

**Dev admin signup key:** `CRICKET_ADMIN_2026` (only works when `CRICKET_ALLOW_DEV_ADMIN_KEY=1` or `FLASK_DEBUG=1`)

## Database Reset
```
python reset_db.py
python app.py
# First dashboard load auto-seeds venues, umpires, teams, and players
```

## Environment Variables
| Variable | Purpose |
|----------|---------|
| `CRICKET_ADMIN_KEY` | Production admin signup key |
| `CRICKET_ALLOW_DEV_ADMIN_KEY=1` | Allow dev fallback key locally |
| `CRICKET_ALLOW_DB_RESET=1` | Enable `/api/dev/reset` |
| `CRICKET_TOKEN_TTL_SECONDS` | Session TTL (default 604800 = 7 days) |
