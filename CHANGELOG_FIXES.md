# CricketStats Pro — Fixes & Professional UI Refresh

## Backend (`app.py`)

### Security
- **Admin key**: hardcoded `CRICKET_ADMIN_2026` only works when `CRICKET_ALLOW_DEV_ADMIN_KEY=1` (or `FLASK_DEBUG=1`). Production should set `CRICKET_ADMIN_KEY`.
- **DB reset**: `/api/dev/reset` requires admin **and** `CRICKET_ALLOW_DB_RESET=1`.
- **Token expiry**: `tokenCreated` stored on login/register; tokens expire after `CRICKET_TOKEN_TTL_SECONDS` (default 7 days).
- **Password migration**: legacy plaintext passwords still self-heal to Werkzeug hashes on login (already present, kept).
- **Seed**: first-run bootstrap remains open (empty DB); subsequent calls are no-ops.

### Cricket rules
- **Free hit after No Ball**:
  - Stored on `MatchState.freeHitPending`
  - Chained no-balls re-arm free hit
  - Wide during free hit keeps free hit pending
  - Legal delivery consumes free hit
  - Protected dismissals blocked on free hit (bowled/caught/LBW/stumped/hit wicket); run-out still allowed
- Exposed via `/api/balls` response and `/api/balls/state` as `freeHitPending`

### Data
- Venues (12) + umpires (8) already in `seed_data.py` — seed smoke-tested OK
- AI insight endpoint present and working

## Frontend

### Bug fixes
- `lsRefreshStats` now uses `authFetch`
- Dashboard / rankings / stats API calls use `authFetch`
- AI insight pill loads from `/api/stats/ai-insight`
- Free-hit badge on live scoring UI
- Removed noisy `flame-effect` from confirm dialogs
- Created missing files: `index.html`, `auth.js`, `cricket_anim.css`, `parallax.js`
- Rankings link added to main nav

### Professional UI
- Calmer **slate / steel-blue** palette (less neon green/gold overload)
- Restrained hover glow on buttons, cards, nav, inputs
- Window-style elevated cards (`--shadow-window`)
- Cleaner auth screens
- Softer scorecard not-out / out treatments
- Inter + Poppins type system; Orbitron reserved for stats/scores

## Env vars

| Variable | Purpose |
|----------|---------|
| `CRICKET_ADMIN_KEY` | Production admin signup key |
| `CRICKET_ALLOW_DEV_ADMIN_KEY=1` | Allow dev fallback key locally |
| `CRICKET_ALLOW_DB_RESET=1` | Enable `/api/dev/reset` |
| `CRICKET_TOKEN_TTL_SECONDS` | Session TTL (default 604800) |

## Run

```bash
cd cricketstats
pip install -r requirements.txt
export CRICKET_ALLOW_DEV_ADMIN_KEY=1   # local only
python app.py
# http://localhost:5001/login.html
```

First dashboard load seeds venues, umpires, teams, and players automatically.
