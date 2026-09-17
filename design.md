# Design System — CricketStats Pro

## 1. Theme

Dark UI throughout. Deep matte backgrounds with high-contrast accent colors. Glass-morphism card style with backdrop blur. Stadium photo background at low opacity behind all pages.

## 2. Color Tokens (CSS Custom Properties)

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-dark` | `#020802` | Page background |
| `--bg-surface` | `#050c05` | Surface elements |
| `--card-bg` | `rgba(15,23,42,0.4)` | Glass card backgrounds |
| `--card-border` | `rgba(56,189,248,0.15)` | Card borders |
| `--text` | `#f8fafc` | Primary text |
| `--text-muted` | `#94a3b8` | Secondary/muted text |
| `--primary` | `#0ea5e9` | Primary accent (sky blue) |
| `--primary-light` | `#38bdf8` | Lighter primary |
| `--primary-dark` | `#0369a1` | Darker primary |
| `--gold` | `#fbbf24` | Gold accents |
| `--gold-bright` | `#fcd34d` | Bright gold |
| `--gold-dark` | `#f59e0b` | Dark gold |
| `--neon-green` | `#00ff87` | Success, runs, wins |
| `--red-ball` | `#ef4444` | Danger, wickets |
| `--red-ball-light` | `#f87171` | Light danger |
| `--success` | `#22c55e` | Positive actions |
| `--danger` | `#ef4444` | Negative actions |
| `--flame` | `#ff4500` | Flame accent |
| `--flame-light` | `#ffa500` | Flame light |
| `--neon-blue` | `#38bdf8` | Neon blue accent |
| `--neon-gold` | `#ffd700` | Neon gold accent |

### Gradients

| Token | Value | Usage |
|-------|-------|-------|
| `--gradient-main` | `linear-gradient(135deg, #0ea5e9, #fbbf24)` | Primary buttons, headings, top accent bars |
| `--gradient-gold` | `linear-gradient(135deg, #fbbf24, #f59e0b)` | Gold elements |
| `--gradient-green` | `linear-gradient(135deg, #22c55e, #16a34a)` | Green elements |
| `--gradient-cyber` | `linear-gradient(135deg, #38bdf8, #818cf8)` | Cyber/blue elements |
| `--gradient-red` | `linear-gradient(135deg, #ef4444, #b91c1c)` | Red elements |
| `--gradient-flame` | `linear-gradient(135deg, #ff4500, #ffa500)` | Flame elements |

### Layout Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-card` | `16px` | Card border-radius |
| `--radius-input` | `8px` | Input border-radius |
| `--transition` | `all 0.3s cubic-bezier(0.4,0,0.2,1)` | Global transition |

## 3. Typography

| Font | Weights | Usage |
|------|---------|-------|
| **Poppins** | 300, 400, 500, 600, 700, 800 | Body text, UI elements, badges, tables |
| **Orbitron** | 400, 500, 700, 900 | Headings, scores, stat numbers, profile names |

### Font Sizes (site-wide overrides)

| Element | Size | Font |
|---------|------|------|
| `h1` / `.page-hero-title` | `clamp(1.35rem, 2.6vw, 1.85rem)` | Orbitron |
| `h3` | `1.15rem` | Orbitron |
| `table th` | `0.82rem` | Poppins |
| `table td` | `1rem` | Poppins |
| `.nav-link` | `0.95rem` | Poppins |
| All buttons | `0.95rem` | Poppins |
| All form inputs | `1rem` | Poppins |

## 4. Global Components

### Stadium Background
- Fixed full-screen background image `stadium_bg.png` with low opacity
- Overlaid by a vignette gradient (`body::before`) for depth
- `.stadium-bg-overlay` class on every page body

### Container
- Max-width: `1380px`, centered, padding `2rem 2.5rem`

### Glass Card (`.glass-card`)
```css
background: rgba(15,23,42,0.4);
border: 1px solid rgba(56,189,248,0.15);
border-radius: 16px;
backdrop-filter: blur(20px);
padding: 1.8rem;
```
- Has a `::before` top accent bar (gradient-main, 2px, 70% opacity)
- Hover: border-color brightens, translates up 2px

### Glow Box (`.glow-box`)
- Subtle green/cyan glow: `box-shadow: 0 0 14px rgba(34,197,94,0.12), 0 0 4px rgba(56,189,248,0.08)`
- Green border: `1px solid rgba(34,197,94,0.18)`
- Hover: glow intensifies, border brightens

### Page Hero (`.page-hero`)
- Flex row with space-between, wraps on mobile
- Background: radial gradients over `rgba(8,16,12,0.72)`
- Border: `1px solid rgba(56,189,248,0.16)`
- Title: gradient text (sky → gold)
- Actions go in `.page-hero-actions` div

### Section Head (`.section-head`)
- Flex row: `justify-content: space-between; align-items: center`
- Used inside glass cards with h3 + badge/chip

### Muted Chip (`.muted-chip`)
- Pill badge: `background: rgba(148,163,184,0.12)`, `border-radius: 999px`
- Used for counts next to section headings

## 5. Navigation

### Two-Tier Header
- **Row 1 (`.nav-top`)**: Logo (🏏 CRICKETSTATS PRO) | AI Insight Pill | User avatar + Welcome + Sign Out
- **Row 2 (`.nav-bottom`)**: 8 centered nav links with emoji icons

### Nav Links
- Active link highlighted via `.active` class
- Links: Dashboard, Tournament, Matches, Players, Teams, Rankings, Records, AI Stats

### Auto-Hide on Scroll
- `.nav-hidden`: `transform: translateY(-105%); opacity: 0`
- Hides on scroll down past 60px, shows on scroll up

### Scroll-to-Top Button
- Fixed bottom-right, appears after scrolling past threshold
- `requestAnimationFrame` for performance

## 6. Buttons

| Class | Style | Usage |
|-------|-------|-------|
| `.btn-submit` / `.btn` / `.btn-primary` | `width: 100%`, gradient-main background, white text, `0.9rem` padding, `box-shadow: 0 4px 20px rgba(22,163,74,0.4)` | Primary actions (full-width by default) |
| `.btn-inline` | `width: auto`, `0.6rem 1.3rem` padding, inline-flex | Header action buttons (not full-width) |
| `.btn-cancel` | Red-tinted glass, `flex: 1` | Cancel/destructive actions |
| `.btn-sm` | `width: auto`, `0.35rem 0.9rem` padding, `0.78rem` font | Small inline buttons |
| `.btn-view` | Green-tinted glass, `display: inline-block` | View/navigate links |
| `.btn-edit` | Gold-tinted glass | Edit actions |
| `.btn-delete` | Red-tinted glass | Delete actions |
| `.filter-btn` | `0.45rem 1.1rem` padding, green-tinted glass, rounded `10px` | Filter/tab toggles |
| `.filter-btn.active` | Brighter green, green glow | Active filter state |

## 7. Forms

### Form Groups
- `.form-group`: `margin-bottom: 1.2rem`
- Labels: `0.8rem`, muted color, `font-weight: 600`, uppercase

### Inputs
- Inside `.glass-card`: green-tinted glass `rgba(22,163,74,0.06)`, green border
- `.form-input` (standalone): same green-tinted glass styling
- Global `select` elements: dark background `rgba(8,16,12,0.72)`, dark options `#0a150a`
- Focus: brighter border, green box-shadow ring

### Select Option Styling
- Options: `background: #0a150a`, `color: var(--text)`
- Checked: `background: rgba(34,197,94,0.18)`, `color: var(--neon-green)`
- Multi-select: dark background, checked items highlighted green

## 8. Tables

- Width: `100%`, collapsed borders
- Header row: `rgba(255,255,255,0.03)` background, muted uppercase text
- Rows: bottom border `rgba(255,255,255,0.05)`, hover `rgba(255,255,255,0.03)`
- Sticky thead inside `.table-scroll` containers
- `.table-scroll`: `overflow-x: auto`, `border-radius: 12px`, `border: 1px solid rgba(255,255,255,0.05)`

## 9. Badges

| Class | Background | Text Color | Border | Usage |
|-------|-----------|-----------|--------|-------|
| `.badge-batsman` | `rgba(22,163,74,0.2)` | `#4ade80` | Green | Batsman role |
| `.badge-bowler` | `rgba(220,38,38,0.15)` | `#f87171` | Red | Bowler role |
| `.badge-allrounder` | `rgba(251,191,36,0.15)` | `#fcd34d` | Gold | All-rounder |
| `.badge-keeper` | `rgba(59,130,246,0.15)` | `#93c5fd` | Blue | Wicket-keeper |
| `.badge-t20` | `rgba(139,92,246,0.15)` | `#c4b5fd` | Purple | T20 format |
| `.badge-odi` | `rgba(22,163,74,0.15)` | `#4ade80` | Green | ODI format |
| `.badge-test` | `rgba(251,191,36,0.15)` | `#fcd34d` | Gold | TEST format |
| `.badge-t10` | `rgba(220,38,38,0.15)` | `#f87171` | Red | T10 format |
| `.badge-won` | `rgba(22,163,74,0.2)` | `#4ade80` | — | Won result |
| `.badge-loss` | `rgba(220,38,38,0.15)` | `#f87171` | — | Lost result |

## 10. Modals

### Overlay
- Fixed fullscreen, `background: rgba(3,10,3,0.85)`, `backdrop-filter: blur(8px)`
- Centered flex, padding `1rem`

### Modal Card
- `max-width: 480px` (default), `max-height: 90vh`, overflow-y scroll
- Animation: `scaleIn 0.3s cubic-bezier(0.34,1.56,0.64,1)`
- Custom thin scrollbar: green thumb

### Close Button (`.modal-close-x`)
- `34×34px`, red-tinted glass, red hover glow

---

## 11. Page-by-Page Design

---

### 11.1 Login Page (`login.html`)

**Layout**: Centered auth card on stadium background.

**Structure**:
```
.auth-container.auth-shell
  .auth-card
    Logo block (🏏 + CRICKETSTATS + ANALYTICS PLATFORM)
    Flash message area
    #loginForm
      Email input (.form-control)
      Password input (.form-control)
      Login button (.btn.btn-primary)
    Auth footer (link to signup)
```

**Auth Card**:
- `max-width: 440px`, `padding: 3rem 2.5rem`
- `backdrop-filter: blur(24px)`
- `::before` top accent bar (gradient-main, 3px)
- `scaleIn` entrance animation

**Form Inputs**: `.form-control` class — green-tinted glass, green border, full-width, `0.8rem 1rem` padding

**Login Button**: Full-width `.btn.btn-primary`, gradient-main, `box-shadow: 0 4px 20px rgba(22,163,74,0.4)`

---

### 11.2 Signup Page (`signup.html`)

**Layout**: Same centered auth card as login.

**Structure**:
```
.auth-container
  .auth-card
    Logo block
    #signupForm
      Full Name input
      Email input
      Password input
      Role select (Fan / User or Administrator)
        → Admin key input (hidden, shown when admin selected)
      Create Account button
    Auth footer (link to login)
```

**Role Select**: `<select>` with dark theme — options: "Fan / User (Read-Only)" or "Administrator (Full Access)"

**Admin Key Group**: Conditionally shown with `slideDown 0.3s ease` animation when admin role selected

---

### 11.3 Dashboard (`index.html`)

**Layout**: Single-column, full-width sections.

**Structure**:
```
.page-hero
  Title: "Tournament Command Centre"
  Action: "Open Tournaments →" (.btn-view)

.stats-grid (6 stat boxes)
  Running | Finished | Upcoming | Total Matches | Teams | Live/Open

.dash-tour-grid (2-column grid)
  Left: Running Tournaments (.glass-card)
    .section-head with h3 + .muted-chip count
    .tour-card-list (dynamic mini-cards)
  Right: Finished Tournaments (.glass-card)
    .section-head with h3 + .muted-chip count
    .tour-card-list

Recent Match Activity (.glass-card)
  .table-scroll > table
  Columns: ID, Tournament, Format, Fixture, Score, Status, Date, Action
```

**Stats Grid**: 6 `.stat-box` cards in a row, each with label + value, gradient accent hover

**Dash Tour Grid**: `grid-template-columns: 1fr 1fr` (collapses to 1fr at 980px)

**Tour Mini Cards** (`.tour-mini-card`):
- Border: `1px solid rgba(148,163,184,0.14)`
- Background: `rgba(8,12,20,0.45)`
- Top row: title + status badge
- Meta row: format, teams, overs
- Progress bar with fill gradient
- Team chips at bottom
- Foot: action links

---

### 11.4 Tournaments Page (`tournaments.html`)

**Layout**: Full-width sections stacked vertically.

**Structure**:
```
.page-hero
  Title: "🏆 Tournaments"
  Subtitle: "Manage and view tournaments — schedules, brackets, and standings."
  Action: "+ Create Tournament" (.btn-inline)

Tournament Schedule & Hierarchy (.glass-card.tourney-schedule-shell)
  .section-head
    h3: "📅 Tournament Schedule & Hierarchy"
    Right side: tournament select dropdown + Schedule/Tree filter tabs
  #schedule-board (schedule view)
  #bracket-board (tree/bracket view, hidden by default)

Running Tournaments (.glass-card.glow-box)
  .section-head: h3 "🟢 Running Tournaments" + .muted-chip
  .table-scroll > table
  Columns: Tournament Name, Type, Format, Teams, Overs, Progress, Actions

Completed Tournaments (.glass-card)
  .section-head: h3 "🏆 Completed Tournaments"
  .table-scroll > table
  Columns: Tournament Name, Type, Format, Teams, Overs, Champion, Actions
```

**Tournament Wizard Modal** (`#tournament-wizard-modal`):
- Max-width: `860px`, 4-step wizard
- Progress bar + step labels
- Step 1: Tournament details (name, type, format)
- Step 2: Team selection (checkbox grid)
- Step 3: Schedule format (format cards)
- Step 4: Review & publish
- Nav: Back / Cancel / Next / Create buttons (`.wizard-nav`)

**Other Modals**:
- Squad Selection Modal (max-width 900px)
- Squad View Modal (max-width 800px)
- Standings Modal (max-width 700px) — points table with NRR
- Bracket Modal (max-width 900px) — visual bracket tree
- Edit Details Modal (max-width 520px)
- Edit Schedule Modal (max-width 920px)

---

### 11.5 Matches Page (`matches.html`)

**Layout**: List view and scorecard detail view (toggled via JS).

**Structure — List View**:
```
.page-hero
  Title: "📋 Matches"
  Subtitle: #match-count-label
  Action: "⚡ Activate Match" (.btn-inline)

.filter-nav
  All Formats | T20 | T10 | ODI | TEST

Match Table (.glass-card)
  .table-scroll > table
  Columns: #, Tournament, Format, Type, Team 1, Score, Team 2, Score, Winner, Date, Actions
  Actions: 📋 Scorecard button (admin: + 🗑 delete)
```

**Structure — Scorecard Detail View**:
```
Back button + "🏏 Enter Ball" button (admin-only)

.sc-mode-tabs (two-column segmented control)
  "📡 Overview" | "📋 Scorecard & Details"

Overview Mode:
  .match-overview (.mo-*) components — full match summary card

Scorecard & Details Mode:
  .innings-tab-group (8+ tabs)
    1st Innings Batting | 1st Innings Bowling
    2nd Innings Batting | 2nd Innings Bowling
    Super Over 1 | Super Over 2 (hidden unless applicable)
    Playing XI | Detailed Stats
```

**Scorecard Modes**:

- **Overview** (`.mo-*`): Match overview card with status, winner, team splits, compare cards, win probability chart
- **Scorecard tabs**: Batting/bowling tables with broadcast-style rows
- **Playing XI**: Two-column player boxes with role badges
- **Detailed Stats**: Sub-tabs for players performance + ball log

**Ball Entry** (`#live-scoring-view`):
- Two-column grid (`.be-grid`): left info + right numpad
- Left: score head, over timeline, batters, bowler
- Right: run buttons (0-6), extras (WD/NB/BYE/LB/5PEN), actions (OUT/UNDO)

---

### 11.6 Players Page (`players.html`)

**Layout**: Grid browse view + profile detail view (toggled via JS).

**Structure — Browse View**:
```
Header row (inline, no page-hero)
  Title: "🏏 Player Registry" (gradient text)
  Subtitle: #player-count-label
  Action: "+ Add Player" button (.btn-primary, admin-only)

Search + Filters row
  Search input (.search-container)
  Team select dropdown

.filter-nav (role filters)
  All Roles | 🏏 Batsman | 🎯 Bowler | ⚡ AllRounder | 🧤 WicketKeeper

#players-grid (.players-grid)
  CSS Grid: repeat(auto-fill, minmax(260px, 1fr)), gap 1.5rem
```

**Player Card** (`.player-card`):
- Border-radius: 20px, overflow hidden
- `.pc-hero` (220px height): hero image `object-fit: contain`, `#060505` background
  - Role accent stripe (`::before`)
  - Gradient mask (`::after`) fading into card body
  - Hover: image scales 1.06x
- `.pc-body`: name (Orbitron, gradient text), role badge, meta (DOB, nationality, styles)
- Admin actions: edit/delete buttons (hidden for fan users)

**Player Image Fallback Chain**:
1. `Players Pics/{Name}.png`
2. `Players Pics/{Name} crop.png`
3. `dummy.png`

**Structure — Profile View**:
```
.back button

.profile-hero (.glass-card)
  .profile-hero-img (220×220px, object-fit: contain, rounded 16px, dark bg)
  .profile-hero-info
    .profile-name (Orbitron, gradient text)
    .profile-meta (flag, nationality, role badge, bat/bowl styles)
    .profile-career-pills (Runs, Wickets, Matches, 50s)

.profile-tabs
  Batting | Bowling | Recent Matches

Batting Panel (.glass-card)
  Runs by Year (Chart.js canvas)
  Yearly batting table: Year, Inn, Runs, HS, Balls, SR, 4s, 6s, Ducks

Bowling Panel (.glass-card, hidden)
  Wickets by Year (Chart.js canvas)
  Yearly bowling table: Year, Matches, Overs, Runs, Wkts, Econ

Recent Matches Panel (.glass-card, hidden)
  Match table: Date, Tournament, Format, vs, Runs (Balls), Wkts, Result
```

**Modals**:
- Add Player Modal: form fields (Team, Name, DOB, Nationality, Bat Style, Bowl Style, Role)
- Edit Player Modal: same fields, pre-filled

---

### 11.7 Teams Page (`teams.html`)

**Layout**: List view + detail view (toggled via JS).

**Structure — List View**:
```
.page-hero
  Title: "🛡️ Teams"
  Subtitle: "ICC rankings, squads, and team match history."
  Action: "+ Add Team" (.btn-inline, admin-only)

Add Team Form (.glass-card, hidden toggle)
  Form grid: Team Name, Country, Head Coach
  Cancel + Save buttons

ICC Team Rankings (.glass-card)
  .table-scroll > table
  Columns: Rank, Team, Country, Head Coach, Action
  Action: "👥 View Roster" button (.btn-view)
```

**Structure — Detail View**:
```
Back button

Team Header (.glass-card) — filled by JS

Team Roster (.glass-card)
  .team-roster-grid (CSS Grid: 240px 1fr, collapses at 700px)
    Featured player image (280px height, object-fit: contain)
    Scrollable roster table (max-height: 280px)

Match History (.glass-card)
  .table-scroll (max-height 400px)
  Columns: ID, Tournament, Format, Opponent, Score, Result
```

**Add Team Form**: Inline glass card with form grid, toggled via "Add Team" button

---

### 11.8 Rankings Page (`rankings.html`)

**Layout**: Two-column side-by-side grid.

**Structure**:
```
.page-hero
  Title: "Global Rankings"
  Subtitle: "Teams by format · Players by batting, bowling & all-round skill"

.rankings-layout (CSS Grid: 1fr 1fr, gap 1.25rem)
  Team Rankings (.glass-card.rankings-card)
    .rankings-card-head
      h3: "🛡️ Team Rankings"
      CSV export button (.btn-view)
      Format filter tabs: T10 | T20 | ODI | TEST
    .rankings-table
      Columns: Rank, Team, Matches, Wins, Form (Last 5)

  Player Rankings (.glass-card.rankings-card)
    .rankings-card-head
      h3: "🏏 Player Rankings"
      CSV export button (.btn-view)
      Role filter tabs: Batters | Bowlers | All-Rounders
    .rankings-table
      Columns: Rank, Player, Country, [dynamic: Runs/Wickets/Combined]
```

**Rankings Layout**: Collapses to single column at 980px
**Medal Colors**: `.rank-medal-1` (gold), `.rank-medal-2` (silver), `.rank-medal-3` (bronze)
**Form Chips**: `.form-chips` — last 5 match results as colored circles (W/L/N)

---

### 11.9 Records Page (`records.html`)

**Layout**: Filter tabs in header + 3-column grid of record cards.

**Structure**:
```
.page-hero
  Title: "Records & Hall of Fame"
  Subtitle: "All-time leaders across batting and bowling — filter by format."
  Actions: Format filter tabs (All | T10 | T20 | ODI | TEST)

.records-grid (CSS Grid, responsive)
  .glass-card.record-card × 6:
    🏏 Most Runs (#rec-most-runs)
    🎯 Most Wickets (#rec-most-wickets)
    💥 Most Sixes (#rec-most-sixes)
    ⚡ Most Fours (#rec-most-fours)
    🔥 Highest Individual Scores (#rec-top-knocks)
    🎳 Best Bowling (Innings) (#rec-best-bowling)
```

Each record card: ordered list (`.record-list`) rendered by JS with player entries

---

### 11.10 AI Stats Page (`stats.html`)

**Layout**: Custom header → query card → results panels.

**Structure**:
```
.ai-stats-header (custom header, not .page-hero)
  .ai-stats-header-copy
    Kicker: "Intelligence Hub"
    Title: "AI Stats Explorer"
    Subtitle
  .ai-stats-header-badges
    4 mode chips: Player Stats, Head to Head, Player vs Player, Player vs Team

.ai-query-card (.glass-card)
  .ai-query-top
    "Build a Query" title
    .ai-type-pills (4 mode toggle buttons, pill-shaped)
      👤 Player Stats | ⚔️ Head to Head | 🎯 Player vs Player | 🏟️ Player vs Team
    Hidden <select> synced with pills

  form#stats-form (.ai-query-form)
    Input groups (flex-wrap, gap 0.9rem 1rem):
      Player Stats mode: 1 text input (player name, datalist autocomplete)
      H2H mode: 2 text inputs (team1, team2)
      PvP mode: 2 text inputs (batsman, bowler)
      PvT mode: 2 text inputs (player, team)
    .ai-query-actions: "🔍 Get Stats" button (.ai-get-btn) + Clear button

Loading state (.ai-loading): spinner + "Crunching match data…"

Results container (.ai-results)
  4 result panels (toggled by mode):
```

**Player Stats Panel**:
- Result head: tag "Player Career" + title + meta
- KPI grid (`.ai-kpi-grid`)
- Two-column split (`.ai-split`): Career Snapshot table + Recent Form (Last 8) table
- Year-by-Year chart (Chart.js canvas) + yearly data table

**Head to Head Panel**:
- Result head: tag "Team Rivalry"
- KPI grid
- Comparison Table (3-column: Metric | Team 1 | Team 2)
- Match History table (7 columns)

**Player vs Player Panel**:
- Result head: tag "Duel"
- KPI grid
- Battle Table (3-column: Metric | Player A | Player B)
- Match-by-Match Duels table (7 columns)

**Player vs Team Panel**:
- Result head: tag "Opposition Record"
- KPI grid
- Summary vs Opposition table (2-column: Metric | Value)
- Innings / Match Log table (11 columns)

---

## 12. Scorecard System

### Scorecard Header
- `.scorecard-header`: flex row with Team 1 | VS | Team 2
- Runs in Orbitron bold `2.4rem`, gradient text

### Scorecard Tabs (`.sc-mode-tabs`)
- Two-column segmented control: Overview | Scorecard & Details
- Active: gradient background (green → gold), dark text
- Container: max-width 640px, centered

### Broadcast Batting Table (`.sc-*` classes)
- 7 columns: Batsman | Dismissal | Runs | Balls | 4s | 6s | SR
- **Out rows** (`.sc-out`): gold name, pink strikethrough, white runs
- **Not out rows** (`.sc-notout`): full mint-green bar, dark text
- **Yet to bat** (`.sc-dnb`): dimmed (0.6 opacity), dash stats

### Bowling Table
- Columns: Name | O | M | R | W | Econ | Dots | 4s | 6s

### Match Overview (`.mo-*` components)
- Status pills, winner card, team split cards, compare cards
- Win probability bar with progress fill

---

## 13. Ball Entry Layout

### Two-Column Grid (`.be-grid`)
```css
grid-template-columns: 1fr 1fr;
gap: 1.5rem;
/* Collapses to 1fr at ≤900px */
```

### Left Column
| Component | Class | Content |
|-----------|-------|---------|
| Score Head | `.be-score-head` | Team badges (batting/bowling), main score (Orbitron `3.2rem`), CRR |
| Over Timeline | `.be-over` | 6 circular dots (`.be-over-dot`), color-coded by ball type |
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
- Color coding: runs (blue), 4 (gold), 6 (gold bright), wicket (red), wide (blue), noball (purple), extra (muted)

---

## 14. Match Box (Schedule View)

```css
.match-box {
    border-radius: 14px;
    border: 1px solid rgba(148,163,184,0.16);
    background: linear-gradient(180deg, rgba(15,23,42,0.82), rgba(8,12,20,0.88));
    padding: 0.8rem 0.85rem;
}
```
- Hover: translateY(-2px), blue border glow
- `.is-done`: green border
- `.is-live`: gold border

---

## 15. Bracket System

### Modal Bracket (`.bracket-container`)
- Horizontal flex layout with rounds
- Each round: vertical stack of match cards
- Connectors between rounds (vertical lines)
- Match cards: team names, scores, winner tick

### Schedule Bracket (`.bracket-board`)
- Column-based layout (`.bracket-columns`)
- Each column: title + match cards + connector lines

---

## 16. Tournament Wizard

### Format Cards (`.fmt-grid`)
- CSS Grid: `repeat(auto-fill, minmax(220px, 1fr))`
- Each card: title + description, selectable with blue border glow

### Intensity Cards (`.intensity-options`)
- Vertical stack, radio-style selection
- Selected: blue border + blue background tint

### Team Checkbox Grid (`.teams-checkbox-grid`)
- CSS Grid: `repeat(auto-fill, minmax(200px, 1fr))`
- Each card: checkbox + flag + team name
- Selected: green border + green background tint

---

## 17. Charts

- Chart.js library for bar/line/doughnut charts
- Used in: Player profile batting/bowling panels, AI Stats year-by-year, Match overview win probability
- Dark theme styling: transparent backgrounds, light text, colored datasets

## 18. Animations

### View Transitions
- All pages: `<meta name="view-transition" content="same-origin">`
- Navigation wrapped in `document.startViewTransition()`

### Flash Messages
- Toast notifications (`.flash`): success (green) or error (red)
- Auto-remove after 3.5s
- `toastIn` animation: slide from right

### Entrance Animations
- `.fadeInUp`: 0.6–0.8s ease-out with delays
- `.scaleIn`: modal card entrance

## 19. Responsive Breakpoints

| Breakpoint | Behavior |
|-----------|----------|
| ≤ 1100px | Dashboard grid collapses to single column |
| ≤ 980px | Rankings/tournament grids collapse to single column |
| ≤ 900px | Ball entry grid collapses to single column |
| ≤ 700px | Profile hero stacks vertically (180×180px image), team roster collapses, nav adjusts, bracket stacks |

## 20. Player Image System

| Path | Purpose |
|------|---------|
| `Players Pics/{Name}.png` | Primary image |
| `Players Pics/{Name} crop.png` | Cropped variant (fallback) |
| `dummy.png` | Root fallback |

### Player Card Hero (`.pc-hero`)
- Height: 220px, `object-fit: contain`, `object-position: center top`
- Background: `#060505`
- Gradient mask at bottom fading into card body
- Hover: scale 1.06x

### Player Profile Image (`.profile-hero-img`)
- 220×220px container, `border-radius: 16px`, `overflow: hidden`
- Image: `object-fit: contain`, `object-position: center top`
- Mobile: 180×180px
- Border: `1px solid rgba(56,189,248,0.25)`
- Box-shadow: `0 0 28px rgba(56,189,248,0.15)`

### Team Roster Featured Image
- Height: 280px, `object-fit: contain`

## 21. Auth Pages

### Auth Card
- `max-width: 440px`, centered vertically
- `backdrop-filter: blur(24px)`
- `::before` top accent bar (gradient-main, 3px)
- Logo: 3.5rem cricket emoji + Orbitron "CRICKETSTATS" title + "ANALYTICS PLATFORM" subtitle
- Form labels with emoji icons
- Submit button: full-width `.btn.btn-primary`
- Footer link to alternate auth page

## 22. Flash Toast System

```css
.flash {
    padding: 0.9rem 1.5rem;
    border-radius: 12px;
    font-size: 0.88rem;
    font-weight: 600;
    min-width: 260px;
    max-width: 360px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.4);
}
.flash-success { background: rgba(22,163,74,0.2); border: 1px solid rgba(34,197,94,0.4); color: #4ade80; }
.flash-error   { background: rgba(220,38,38,0.2); border: 1px solid rgba(220,38,38,0.4); color: #f87171; }
```
