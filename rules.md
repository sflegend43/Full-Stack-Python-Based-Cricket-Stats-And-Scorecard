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

## 4. Batting Statistics Rules

### 4.1 Bowling Figures (get_bowling)
- `ballsBowled`: Excludes Wide, NoBall, and Retired deliveries
- `runsConceded`: Includes ALL runs (bat runs + extras + penalties)
- `maidens`: Over where `wicketFallen=0`, `runsScored=0`, `extras=0 OR IS NULL` for all 6 balls

### 4.2 Batting Statistics (get_batting)
- `balls`: Excludes Retired deliveries
- `dismissal`: Derived from `dismissedPlayerID` matching `batsmanID`
- `fielderName` and `bowlerName`: Subqueried from the specific dismissal ball

## 5. Match Rules

### 5.1 Toss
- `tossWinnerName`: One of the two teams
- `tossDecision`: "bat" or "bowl"
- Determines which team bats first in each innings

### 5.2 Innings
- T20/T10/ODI: 1 or 2 innings (typically 2)
- TEST: Up to 4 innings
- `inningsNumber` CHECK between 1 and 4

### 5.3 Match State Persistence
- `MatchState` table stores: matchID, inningsNumber, strikerID, nonStrikerID, bowlerID
- Updated on every ball submission
- Restored on page reload to resume live scoring

## 6. Playing XI Rules

### 6.1 Selection
- Exactly 11 players per team selected from tournament squad
- Must assign Captain and Wicket Keeper per team
- Roles: `Captain`, `WicketKeeper`, `Captain & WK`, or null

### 6.2 Sort Order
Batters displayed in Playing XI by role priority:
`Batsman (1) → WicketKeeper (2) → AllRounder (3) → Bowler (4)`

## 7. Auth Rules

### 7.1 Roles
- `admin`: Full access (requires admin key at signup)
- `fan` (default): Read-only access

### 7.2 Admin-Only Actions
- All POST/PUT/DELETE on: Players, Teams, Venues, Umpires, Matches, Tournaments
- Ball entry (recording balls, wickets, extras)
- Deleting specific balls from ball log
- Match wizard (create match, set Playing XI)

### 7.3 Admin UI Stripping
On every page load: `document.querySelectorAll('.admin-only').forEach(el => el.remove())` for non-admin users. Inline `getUser()?.isAdmin` checks for conditional rendering.

## 8. Bowling Figures Calculation (Scorecard)

```sql
-- BallByBall query excludes Wide/NoBall/Retired from legal deliveries
SUM(CASE WHEN (extraType IS NULL OR extraType NOT IN ('Wide','NoBall','Retired'))
         THEN 1 ELSE 0 END) AS ballsBowled
```

## 9. Bowling Figures Calculation (Player Stats Endpoint)

Same exclusion logic as scorecard. Additionally:
- `bowlingAverage = runsConceded / wicketsTaken`
- `economy = (runsConceded / ballsBowled) * 6`
- Players with 0 balls bowled excluded from bowling results

## 10. Top Bowlers Query

```sql
-- Excludes Wide/NoBall/Retired from balls bowled
-- Only includes players with at least 1 wicket
WHERE b.wicketFallen=1 AND (b.wicketType IS NULL OR b.wicketType != 'RetiredOut')
```
