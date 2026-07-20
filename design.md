# Design System — CricketStats Pro

## 1. Theme
Dark UI throughout. Deep matte backgrounds with high-contrast accent colors.

## 2. Color Tokens (CSS Custom Properties)

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#0f0f1a` | Page background |
| `--card-bg` | `rgba(15,20,40,0.65)` | Glass card backgrounds |
| `--text` | `#e2e8f0` | Primary text |
| `--text-muted` | `#64748b` | Secondary/muted text |
| `--primary` | `#38bdf8` | Primary accent (sky blue) |
| `--primary-light` | `#7dd3fc` | Lighter primary |
| `--gold` | `#f59e0b` | Gold accents |
| `--gold-bright` | `#fbbf24` | Bright gold |
| `--neon-green` | `#22c55e` | Success, runs, wins |
| `--red-ball` | `#ef4444` | Danger, wickets |
| `--red-ball-light` | `#fca5a5` | Light danger |

## 3. Typography

| Font | Weight | Usage |
|------|--------|-------|
| **Poppins** | 300–800 | Body text, UI elements, badges |
| **Orbitron** | 400–900 | Headings, scores, stat numbers |

Imported via Google Fonts: `fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&family=Orbitron:wght@400;700;900`

## 4. Components

### Glass Card
```css
.glass-card {
    background: rgba(15,20,40,0.65);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px;
    backdrop-filter: blur(20px);
}
```

### Badges
| Class | Color | Usage |
|-------|-------|-------|
| `.badge-batsman` | Blue | Batsman role |
| `.badge-bowler` | Red | Bowler role |
| `.badge-allrounder` | Gold | All-rounder role |
| `.badge-keeper` | Green | Wicket keeper |
| `.badge-t20` | Cyan | T20 format |
| `.badge-odi` | Purple | ODI format |
| `.badge-test` | Orange | TEST format |
| `.badge-t10` | Pink | T10 format |

### Buttons
| Class | Usage |
|-------|-------|
| `.btn-submit` | Primary action (gradient blue) |
| `.btn-cancel` | Destructive/cancel |
| `.btn-view` | View/navigate |
| `.btn-delete` | Delete action (red) |
| `.filter-btn` | Filter/tab toggle |

### Player Card (`.player-card`)
- Hero image with `object-fit: contain` on `#060505` background
- Role badge overlay
- Name, DOB, batting/bowling style
- Admin actions (edit/delete) hidden for fans
- `dummy.png` fallback chain: `name.png` → `name crop.png` → `dummy.png`

### Player Hero (`.pc-hero`)
- Height: 260px, `object-fit: contain`
- `object-position: center center`
- Background: `#060505`
- Flag/name overlap: `.pc-body` margin `-10px`

### Team Roster (`.team-roster-grid`)
- CSS Grid: `240px 1fr` (collapses to `1fr` at 700px)
- Featured player image: 280px height, `object-fit: contain`
- Scrollable roster table: `max-height: 280px`
- `FEATURED_PLAYERS` map: 10 teams → star player names

## 5. Ball Entry Layout

### Two-Column Grid (`.be-grid`)
```css
.be-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    align-items: start;
}
/* Mobile: collapses to 1fr */
```

### Left Column Components
| Component | Class | Content |
|-----------|-------|---------|
| Score Head | `.be-score-head` | Team badges, main score, CRR |
| Over Timeline | `.be-over` | 6 circular indicators (`.be-over-dot`) |
| Batters | `.be-batters` | Striker + non-striker with runs/balls |
| Bowler | `.be-bowler` | Name, OV/M/R/W stats |

### Right Column: Numpad
| Group | Buttons |
|-------|---------|
| Runs | 0, 1, 2, 3, 4 (gold), 6 (gold) |
| Extras | WD, NB, BYE, LB, 5 PEN, Retire |
| Actions | OUT (red gradient), UNDO (muted) |

### Over Timeline Dots
- 6 fixed circular indicators per over
- Filled sequentially as balls are bowled
- Previous over dots shown faded
- Current over dots at full opacity

## 6. Scorecard Tabs

### Main Tabs
- 6 tabs: 1st Innings Batting, 1st Innings Bowling, 2nd Innings Batting, 2nd Innings Bowling, Playing XI, Detailed Stats
- **Batting tabs** (inn1/inn2): broadcast-style card with `sc-*` CSS classes
  - 7 columns: `Batsman | Dismissal | Runs | Balls | 4s | 6s | SR`
  - `pickBattingXI()` determines batting team XI from batsmanIDs
  - **Out rows** (`sc-out`): gold name with pink strikethrough, white runs, muted SR
  - **Not out rows** (`sc-notout`): full mint-green bar, dark text
  - **Yet to bat rows** (`sc-dnb`): dimmed name, dash stats
- Bowling tabs → placeholder (design pending)

### Detailed Stats Sub-Tabs
- **Players Performance** → 2 sub-sub-tabs (1st/2nd Innings Bowling) — batting lives on main tabs
- **Ball Log** → over-by-over visual + detailed table

### Broadcast Scorecard CSS (`sc-*` classes)
- `.sc-bat-row td`: tight padding `0.7rem 1rem`
- `.sc-name`: bold uppercase, broadcast style
- `.sc-dismissal`: muted 0.78rem, nowrap
- `.sc-num`: right-aligned, Orbitron tabular-nums
- `sc-out`: gold name + pink strikethrough, white runs, gold fours, red sixes, muted SR
- `sc-notout`: full mint-green `#b9f6ca` row, dark text, bold "NOT OUT" dismissal
- `sc-dnb`: dimmed name (0.8 opacity), dash stats (0.35 opacity), no hover

## 7. Live Scoring Card Tabs

Below ball entry, centered tab bar switches between Batting and Bowling cards.

### Batting Card Design
- 5 columns: `Batter (2.5fr) | Fielder (1.2fr) | Info (1.2fr) | R (0.8fr) | B (0.8fr)`
- **Out row**: White name + magenta strikethrough, muted grey dismissal, green runs, pink balls
- **Active row**: Solid white background, all text black
- **DNB row**: White name, stats hidden

### Bowling Card Design
- 6 columns: `Bowler | O | M | R | W | Econ`
- Active bowler row highlighted

## 7. Match Scorecard (Full)

### Bowling Table Headers
`Name | O | M | R | W | Econ | Dots | 4s | 6s`

### Extra Type Labels
Format: `totalRunsWD`, `totalRunsNB`, `totalRunsBY`, `totalRunsLB`, `5PEN` (no parentheses)

## 8. Navigation

### Two-Tier Header
- **Row 1**: Logo + AI Insight pill + Welcome/Sign Out
- **Row 2**: 7 centered nav links (Dashboard, Tournament, Matches, Players, Teams, AI Stats, Rankings)

### Auto-Hide on Scroll
- `.nav-hidden`: `transform: translateY(-105%); opacity: 0`
- Hides on scroll down past 60px
- Shows on scroll up

### Scroll-to-Top Button
- Fixed bottom-right, teal hover glow
- Shows after scrolling past threshold (8px)
- Uses `requestAnimationFrame` for performance
- `dataset.fb` fallback chain for compatibility

## 9. Animations

### View Transitions
All pages: `<meta name="view-transition" content="same-origin">`
Navigation wrapped in `document.startViewTransition()`

### Stadium Background
Low-opacity overlay: `stadium-bg-overlay` class

### Flash Messages
Toast notifications: `.flash` class, auto-remove after 3.5s

## 10. Responsive Breakpoints

| Breakpoint | Behavior |
|-----------|----------|
| > 900px | Full two-column layout |
| ≤ 900px | Ball entry grid collapses to single column |
| ≤ 700px | Team roster grid collapses, nav adjusts |

## 11. Player Image System

| Path | Purpose |
|------|---------|
| `Players Pics/{Name}.png` | Primary image |
| `Players Pics/{Name} crop.png` | Cropped variant |
| `dummy.png` | Root fallback |
| `player-placeholder.svg` | Players page hero fallback |

Image URL construction (no `encodeURIComponent`):
```js
src="Players Pics/${name}.png"
onerror="this.src='dummy.png'"
```
