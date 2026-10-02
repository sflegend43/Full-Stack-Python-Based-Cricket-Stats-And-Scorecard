# Business Rules — CricketStats Pro

## 1. Bowler Rules

### 1.1 Maximum Overs Per Bowler
| Format | Max Overs |
|--------|-----------|
| T10 | 2 |
| T20 | 4 |
| ODI | 10 |
| TEST | Unlimited (null) |

### 1.2 Consecutive Overs
A bowler **cannot bowl two consecutive overs**. If only one bowler has overs remaining, the rule is bypassed.

### 1.3 Enforcement
- Checked server-side in `enforce_bowler_rules()` before every ball insert
- Checked client-side before showing bowler selection
- Bowlers filtered by: `playerRole IN ('Bowler','AllRounder') OR (bowlingStyle IS NOT NULL AND TRIM(LOWER(bowlingStyle)) NOT IN ('', 'none'))`
- **Bypassed for Super Over**: `innings >= 3` skips all bowler enforcement

## 2. Wicket Rules

### 2.1 Dismissal Types
`Bowled`, `Caught`, `CaughtAndBowled`, `LBW`, `RunOut`, `Stumped`, `HitWicket`, `ObstructingField`, `HandledBall`, `TimedOut`, `HitTwice`

### 2.2 New Batter Enforcement
After a wicket falls:
- `pendingNewBatter` flag is set to `true`
- All ball entry (runs, extras, wicket) is blocked until a new batter is selected
- The context modal re-opens automatically
- On page reload: if restored striker is in `beDismissedIDs`, the modal re-opens
- Cancel clears the striker and shows an enforcement toast

### 2.3 Retire
- `RetiredHurt`: Batter leaves temporarily, may return
- `RetiredOut`: Counts as a wicket, batter is out permanently

## 3. Extra Rules

### 3.1 Extra Types
| Type | Runs off bat | Ball counts |
|------|-------------|-------------|
| Wide (WD) | 0+ | No |
| NoBall (NB) | 0+ | No |
| Bye (BYE) | 0+ | Yes |
| LegBye (LB) | 0+ | Yes |
| Penalty (PEN) | Always 5 | Yes |

### 3.2 Ball Counting
- Wide and NoBall do NOT count as a legal delivery
- Bye, LegBye, and Penalty DO count as a legal delivery
- `extraType='Retired'` does NOT count as a ball

## 4. Free Hit Rules

### 4.1 Trigger
- Free hit is armed when a **No Ball** is bowled
- `MatchState.freeHitPending` is set to `1`
- Chained no-balls re-arm the free hit (pending stays true)

### 4.2 During Free Hit
- **Protected dismissals** (Bowled, Caught, LBW, Stumped, HitWicket) are **blocked** — batter cannot be dismissed
- **Run Out** is still allowed on a free hit
- A **Wide** during a free hit keeps `freeHitPending = 1` (free hit carries over)
- Any legal delivery (non-Wide, non-NoBall) consumes the free hit (`freeHitPending → 0`)

### 4.3 UI Indication
- A free-hit badge is shown in the live scoring view when `freeHitPending = true`
- Exposed via `/api/balls` response and `/api/balls/state` as `freeHitPending`

## 5. Batting Statistics Rules

### 5.1 Bowling Figures (get_bowling)
- `ballsBowled`: Excludes Wide, NoBall, and Retired deliveries
- `runsConceded`: Includes ALL runs (bat runs + extras + penalties)
- `maidens`: Over where `wicketFallen=0`, `runsScored=0`, `extras=0 OR IS NULL` for all 6 balls

### 5.2 Batting Statistics (get_batting)
- `balls`: Excludes Retired deliveries
- `dismissal`: Derived from `dismissedPlayerID` matching `batsmanID`
- `fielderName` and `bowlerName`: Subqueried from the specific dismissal ball via JOIN on BallByBall

### 5.3 Scorecard Batting Order
- Batted players sorted by **XI position** (batting arrival order), never changes once set
- Active-but-not-batted (new striker just selected, no row yet) inserted right after last batted row
- Yet-to-bat players sorted by **XI position** (not role) — strict arrival order
- Picker dropdown excludes: dismissed players (out), any player currently at crease not dismissed (both striker and non-striker)

## 6. Match Rules

### 6.1 Toss
- `tossWinnerName`: One of the two teams
- `tossDecision`: "bat" or "bowl"
- Determines which team bats first in each innings

### 6.2 Innings
- T20/T10/ODI: 1 or 2 innings (typically 2)
- TEST: Up to 4 innings
- `inningsNumber` CHECK between 1 and 4

### 6.3 Match State Persistence
- `MatchState` table stores: matchID, inningsNumber, strikerID, nonStrikerID, bowlerID, freeHitPending
- Updated on every ball submission
- Restored on page reload to resume live scoring

## 7. Super Over Rules

### 7.1 Activation
- Super Over is innings 3 or 4 (NOT a separate match)
- Activated when a regular match ends in a tie and admin selects Super Over continuation

### 7.2 Super Over Limits
- **Maximum balls**: `SUPER_OVER_BALLS = 6` legal deliveries
- **Maximum wickets**: `SUPER_OVER_WICKETS = 2`
- Wide and NoBall do not count toward the 6 legal balls (same extra rules apply)

### 7.3 Team Order
- Batting order swaps for Super Over: the team that bowled in innings 2 bats in innings 3
- `_teams_for_innings()` correctly handles this swap

### 7.4 Bowler Rules in Super Over
- `enforce_bowler_rules()` is **bypassed** for innings >= 3 (Super Over)
- Any bowler may bowl the Super Over regardless of prior overs

## 8. Playing XI Rules

### 8.1 Selection
- Exactly 11 players per team selected from tournament squad
- Must assign Captain and Wicket Keeper per team
- Roles: `Captain`, `WicketKeeper`, `Captain & WK`, or null

### 8.2 Sort Order
Batters displayed in Playing XI by role priority:
`Batsman (1) → WicketKeeper (2) → AllRounder (3) → Bowler (4)`

## 9. Auth Rules

### 9.1 Roles
- `admin`: Full access (requires admin key at signup)
- `fan` (default): Read-only access

### 9.2 Admin-Only Actions
- All POST/PUT/DELETE on: Players, Teams, Venues, Umpires, Matches, Tournaments
- Ball entry (recording balls, wickets, extras)
- Deleting specific balls from ball log
- Match wizard (create match, set Playing XI)

### 9.3 Admin UI Stripping
On every page load: `document.querySelectorAll('.admin-only').forEach(el => el.remove())` for non-admin users. Inline `getUser()?.isAdmin` checks for conditional rendering.

### 9.4 Token Expiry
- Tokens stored in `localStorage.cricketUser` as Bearer token
- Server-side expiry: `CRICKET_TOKEN_TTL_SECONDS` (default 604800 = 7 days)
- On expiry: token cleared from DB, next request returns 401

## 10. Bowling Figures Calculation (Scorecard)

```sql
-- BallByBall query excludes Wide/NoBall/Retired from legal deliveries
SUM(CASE WHEN (extraType IS NULL OR extraType NOT IN ('Wide','NoBall','Retired'))
         THEN 1 ELSE 0 END) AS ballsBowled
```

## 11. Bowling Figures Calculation (Player Stats Endpoint)

Same exclusion logic as scorecard. Additionally:
- `bowlingAverage = runsConceded / wicketsTaken`
- `economy = (runsConceded / ballsBowled) * 6`
- Players with 0 balls bowled excluded from bowling results

## 12. Top Bowlers Query

```sql
-- Excludes Wide/NoBall/Retired from balls bowled
-- Only includes players with at least 1 wicket
WHERE b.wicketFallen=1 AND (b.wicketType IS NULL OR b.wicketType != 'RetiredOut')
```

## 13. Super Over Progress Calculation

```python
# evaluate_progress() uses different limits for Super Over
if innings >= 3:
    max_balls = SUPER_OVER_BALLS   # 6
    max_wkts  = SUPER_OVER_WICKETS # 2
else:
    max_balls = MAX_OVERS_PER_BOWLER[format] * 6  # regular match
```
