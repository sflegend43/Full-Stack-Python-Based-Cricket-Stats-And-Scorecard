
async function authFetch(url, options = {}) {
    const user = getUser();
    const headers = options.headers || {};
    if (user && user.token) {
        headers['Authorization'] = `Bearer ${user.token}`;
    }
    return fetch(url, { ...options, headers });
}

// matches.js — CricketStats Pro | Matches Page + Ball-by-Ball Entry

const API = 'http://localhost:5001';

const BATTING_ORDER_RANK = { 'Top Order': 1, 'Middle Order': 2, 'Lower Order': 3, 'Tail': 4 };

function escHtml(v) {
    return String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}


// ── Data Sync: refresh matches list when other tabs make changes ──
if (window.DataSync) {
    DataSync.on('ball-recorded', () => { loadMatches(); });
    DataSync.on('match-completed', () => { loadMatches(); });
    DataSync.on('data-changed', (d) => {
        if (d && d.section === 'matches') loadMatches();
    });
}

// ── State ──────────────────────────────────────────────
let allMatches      = [];
let currentFormat   = '';
let currentScorecard = null;

// Ball Entry state
let beMatchId   = null;
let beInnings   = 1;
let beRuns      = 0;
let beDelType   = 'Normal';   // Normal | Wide | NoBall
let beLastBallId = null;
let bePlayers   = [];
let currentStriker = null;
let currentNonStriker = null;
let currentBowler = null;
let contextMode = '';
let beProgress = null;      // latest ICC innings/target/result status from the server
let moWormChart = null;       // scorecard worm chart instance

// ── Helpers ─────────────────────────────────────────────
function getUser() {
    try { return JSON.parse(localStorage.getItem('cricketUser')); }
    catch { return null; }
}

document.addEventListener('DOMContentLoaded', () => {
    const _user = getUser();
    if (!_user || !_user.isAdmin) {
        document.querySelectorAll('.admin-only').forEach(el => el.remove());
    }
});
function logout() {
    localStorage.removeItem('cricketUser');
    window.location.href = 'login.html';
}
function showToast(msg, type = 'success') {
    const c = document.getElementById('flash-container');
    if (!c) return;
    const d = document.createElement('div');
    d.className = `flash flash-${type}`;
    d.textContent = msg;
    c.appendChild(d);
    setTimeout(() => d.remove(), 3500);
}
function fmtBadge(fmt) {
    const map = { T20:'badge-t20', ODI:'badge-odi', TEST:'badge-test', T10:'badge-t10' };
    return `<span class="badge ${map[fmt]||'badge-t20'}">${fmt}</span>`;
}
function shortTeam(name) {
    return (name || '—').replace(' Cricket Team', '');
}

// ── Init ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const user = getUser();
    if (!user) { window.location.href = 'login.html'; return; }

    const nameEl   = document.getElementById('user-name-display');
    const avatarEl = document.getElementById('user-avatar');
    if (nameEl)   nameEl.textContent   = user.fullname || user.email;
    if (avatarEl) avatarEl.textContent = (user.fullname || 'A')[0].toUpperCase();

    await loadMatches();

    const params  = new URLSearchParams(window.location.search);
    const matchId = params.get('id');
    if (matchId) viewScorecard(parseInt(matchId));

    // Wait, populateSelectDropdowns shouldn't be called directly on load. It's now handled by openAddMatchModal.

    // Ball entry: live preview on any form change
    ['be-over','be-ball','be-extras'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', updatePreview);
    });
    ['be-batsman','be-bowler','be-dismissal','be-extra-type','be-dismissed','be-fielder'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', updatePreview);
    });
    document.getElementById('be-wicket')?.addEventListener('change', updatePreview);

    // Close modals on overlay click
    document.getElementById('ballEntryModal')?.addEventListener('click', function(e) {
        if (e.target === this) closeBallEntry();
    });
    document.getElementById('addMatchModal')?.addEventListener('click', function(e) {
        if (e.target === this) closeAddMatchModal();
    });
});

// ── Load matches list ───────────────────────────────────
async function loadMatches() {
    try {
        const res = await authFetch(`${API}/api/matches?exclude=Scheduled`);
        allMatches = await res.json();
        renderMatchList(allMatches);
    } catch {
        document.getElementById('matches-tbody').innerHTML =
            '<tr><td colspan="11" class="empty-state">⚠️ Could not connect to server.</td></tr>';
    }
}

function setFormatFilter(btn, fmt) {
    currentFormat = fmt;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const filtered = fmt ? allMatches.filter(m => m.matchFormat === fmt) : allMatches;
    renderMatchList(filtered);
}

function renderMatchList(matches) {
    const tb    = document.getElementById('matches-tbody');
    const label = document.getElementById('match-count-label');
    if (label) label.textContent = `${matches.length} match${matches.length !== 1 ? 'es' : ''} found`;

    if (!matches.length) {
        tb.innerHTML = `<tr><td colspan="11" class="empty-state"><span class="empty-icon">🏏</span>No matches found.</td></tr>`;
        return;
    }
    tb.innerHTML = matches.map(m => {
        const winner = m.winnerName
            ? `<span style="color:var(--neon-green); font-weight:700;">${shortTeam(m.winnerName)}</span>`
            : `<span style="color:var(--text-muted);">TBD</span>`;
        return `
        <tr>
            <td><strong style="color:var(--gold);">#${m.matchID}</strong></td>
            <td style="font-size:0.82rem;">${m.tournamentName}</td>
            <td>${fmtBadge(m.matchFormat)}</td>
            <td><span class="badge badge-odi">${m.matchType}</span></td>
            <td>${shortTeam(m.team1Name)}</td>
            <td><strong style="color:var(--neon-green);">${m.team1TotalRuns}/${m.team1TotalWickets}</strong></td>
            <td>${shortTeam(m.team2Name)}</td>
            <td><strong style="color:var(--neon-green);">${m.team2TotalRuns}/${m.team2TotalWickets}</strong></td>
            <td>${winner}</td>
            <td style="color:var(--text-muted); font-size:0.78rem;">${m.matchDate || '—'}</td>
            <td style="display:flex; gap:0.4rem;">
                <button class="btn-view" onclick="viewScorecard(${m.matchID})">📋 Scorecard</button>
                ${getUser()?.isAdmin ? `<button class="btn-delete" onclick="deleteMatch(${m.matchID})">🗑</button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

// ── Scorecard view ──────────────────────────────────────
async function viewScorecard(matchId) {
    try {
        const res  = await authFetch(`${API}/api/stats/scorecard/${matchId}`);
        const data = await res.json();
        if (res.ok) {
            currentScorecard = data;
            beMatchId = matchId;
            // Reset live-scoring state so opening a different match never carries
            // over a stale innings/context from a previously scored match.
            beInnings = 1;
            currentStriker = currentNonStriker = currentBowler = null;
            pendingNewBatter = false;
            beProgress = null;
            scPageMode = 'overview';
            renderScorecard(data);
            document.getElementById('list-view').style.display     = 'none';
            document.getElementById('scorecard-view').style.display = 'block';
            document.getElementById('be-match-label').textContent   = `#${matchId}`;
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            showToast(data.error || 'Scorecard not available', 'error');
        }
    } catch {
        showToast('Failed to load scorecard.', 'error');
    }
}

function backToList() {
    document.getElementById('scorecard-view').style.display = 'none';
    document.getElementById('list-view').style.display      = 'block';
    history.replaceState({}, '', 'matches.html');
}


// ── Match Overview (below score vs score) ─────────────────────────────
const TEAM_COLOR_PALETTE = [
    '#22c55e', '#38bdf8', '#fbbf24', '#f87171', '#a78bfa',
    '#34d399', '#fb7185', '#2dd4bf', '#eab308', '#60a5fa'
];

function teamColor(name) {
    const s = String(name || 'team');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
    return TEAM_COLOR_PALETTE[Math.abs(h) % TEAM_COLOR_PALETTE.length];
}

function moEsc(v) {
    return String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function moBatLine(p, onStrike) {
    if (!p) {
        return `<div class="mo-player-name" style="opacity:.55;">—</div>
                <div class="mo-player-meta">waiting</div>`;
    }
    const star = onStrike ? ' ★' : '';
    return `<div class="mo-player-name">${moEsc(p.playerName)}${star}</div>
            <div class="mo-player-meta"><strong>${p.runs ?? 0}</strong> (${p.balls ?? 0})
            · SR ${p.strikeRate ?? 0}</div>`;
}

function moBowlLine(p, label) {
    if (!p) {
        return `<div class="mo-player-name" style="opacity:.55;">—</div>
                <div class="mo-player-meta">${moEsc(label || '')}</div>`;
    }
    return `<div class="mo-player-name">${moEsc(p.playerName)}</div>
            <div class="mo-player-meta"><strong>${moEsc(p.figures || (p.wickets + '/' + p.runs))}</strong>
            · ${moEsc(p.overs)} ov · Econ ${p.economy ?? 0}</div>`;
}

function moTossText(ov, m) {
    const tw = ov.tossWinnerName || m.tossWinnerName;
    const td = (ov.tossDecision || m.tossDecision || '').toString().trim().toLowerCase();
    if (!tw) return 'Toss information not recorded yet.';
    let choice = 'bat';
    if (['bowl', 'bowling', 'field', 'fielding'].includes(td)) choice = 'bowl';
    else if (['bat', 'batting'].includes(td)) choice = 'bat';
    else if (td) choice = td;
    return `<b>${moEsc(shortTeam(tw))}</b> won the toss and chose to <b>${moEsc(choice)}</b>.`;
}

function moTargetText(ov) {
    if (ov.target == null) return '';
    const chase = ov.battingTeam ? shortTeam(ov.battingTeam) : 'Chasing side';
    const need = ov.progress && ov.progress.runsNeeded != null ? ov.progress.runsNeeded : null;
    const balls = ov.progress && ov.progress.ballsRemaining != null ? ov.progress.ballsRemaining : null;
    let extra = '';
    if (need != null && balls != null && !ov.completed) {
        extra = ` · <b>${moEsc(chase)}</b> need <b>${need}</b> from <b>${balls}</b> balls`;
    }
    return `Target <b>${ov.target}</b>${extra}`;
}

function destroyMoWorm() {
    if (moWormChart) {
        try { moWormChart.destroy(); } catch (e) {}
        moWormChart = null;
    }
}

function renderMoWorm(ov, m) {
    const canvas = document.getElementById('mo-worm-canvas');
    if (!canvas || typeof Chart === 'undefined') return;
    destroyMoWorm();

    const w1 = (ov.worms && ov.worms.innings1) || { labels: [], runs: [] };
    const w2 = (ov.worms && ov.worms.innings2) || { labels: [], runs: [] };
    const t1bat = (ov.innings1 && ov.innings1.battingTeam) || m.team1Name;
    const t2bat = (ov.innings2 && ov.innings2.battingTeam) || m.team2Name;
    const c1 = teamColor(t1bat);
    const c2 = teamColor(t2bat);

    const show2 = (ov.phase === 'innings2' || ov.phase === 'completed') && (w2.runs || []).length > 1;

    // Build unified x labels (overs)
    const maxOver = Math.max(
        ...(w1.labels || [0]),
        ...(show2 ? (w2.labels || [0]) : [0]),
        1
    );
    const labels = [];
    for (let i = 0; i <= maxOver; i++) labels.push(i);

    const seriesFrom = (worm) => {
        const map = {};
        (worm.labels || []).forEach((ovn, idx) => { map[ovn] = worm.runs[idx]; });
        // forward-fill for chart continuity only up to last known
        let last = null;
        const lastKnown = Math.max(...(worm.labels || [0]));
        return labels.map(o => {
            if (map[o] != null) { last = map[o]; return map[o]; }
            if (last != null && o <= lastKnown) return last;
            return null;
        });
    };

    const datasets = [{
        label: shortTeam(t1bat) + ' (1st)',
        data: seriesFrom(w1),
        borderColor: c1,
        backgroundColor: c1 + '33',
        borderWidth: 2.5,
        tension: 0.25,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: false,
        spanGaps: false
    }];
    if (show2) {
        datasets.push({
            label: shortTeam(t2bat) + ' (2nd)',
            data: seriesFrom(w2),
            borderColor: c2,
            backgroundColor: c2 + '33',
            borderWidth: 2.5,
            tension: 0.25,
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: false,
            spanGaps: false
        });
    }

    moWormChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: datasets.length > 1,
                    labels: { color: '#94a3b8', boxWidth: 12, font: { family: 'Poppins', size: 11 } }
                },
                tooltip: {
                    callbacks: {
                        title: (items) => `Over ${items[0]?.label ?? ''}`,
                        label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y ?? '—'} runs`
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Overs', color: '#94a3b8', font: { size: 11 } },
                    ticks: { color: '#94a3b8', maxTicksLimit: 12 },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Runs', color: '#94a3b8', font: { size: 11 } },
                    ticks: { color: '#94a3b8' },
                    grid: { color: 'rgba(255,255,255,0.06)' }
                }
            }
        }
    });

    const legend = document.getElementById('mo-worm-legend');
    if (legend) {
        legend.innerHTML = datasets.map(d =>
            `<span><i style="background:${d.borderColor}"></i>${moEsc(d.label)}</span>`
        ).join('');
    }
}

function renderMatchOverview(data) {
    const box = document.getElementById('match-overview-box');
    if (!box) return;
    const m = data.match || {};
    const ov = data.overview;
    if (!ov) {
        box.style.display = 'none';
        destroyMoWorm();
        return;
    }

    const phase = ov.phase || 'not_started';
    const leftColor = teamColor(ov.battingTeam || m.team1Name);
    const rightColor = teamColor(ov.bowlingTeam || m.team2Name);
    box.style.setProperty('--mo-left', leftColor);
    box.style.setProperty('--mo-right', rightColor);

    let html = '';

    // ── COMPLETED ──
    if (phase === 'completed' || ov.completed) {
        const winner = ov.winnerName || m.winnerName;
        const margin = ov.winMargin || m.winMargin || '';
        const result = ov.resultText || (winner ? `${shortTeam(winner)} won` : 'Match complete');
        html += `<div class="mo-card mo-winner">
            <div class="mo-winner-label">Match Result</div>
            <div class="mo-winner-name">${moEsc(winner ? shortTeam(winner) : 'Completed')}</div>
            <div class="mo-winner-margin">${moEsc(margin || result)}</div>
        </div>`;

        const tp = ov.topPerformers || {};
        const a = tp.team1 || {};
        const b = tp.team2 || {};
        const batA = a.topBat, bowlA = a.topBowl;
        const batB = b.topBat, bowlB = b.topBowl;
        html += `<div class="mo-card">
            <div class="mo-compare">
                <div class="mo-compare-card">
                    <div class="mo-compare-team">${moEsc(shortTeam(a.teamName || m.team1Name))}</div>
                    <div class="mo-stat-row"><span>Top scorer</span><strong>${batA ? moEsc(batA.playerName) + ' · ' + batA.runs + ' (' + batA.balls + ')' : '—'}</strong></div>
                    <div class="mo-stat-row"><span>Top bowler</span><strong>${bowlA ? moEsc(bowlA.playerName) + ' · ' + moEsc(bowlA.figures) : '—'}</strong></div>
                </div>
                <div class="mo-compare-card">
                    <div class="mo-compare-team">${moEsc(shortTeam(b.teamName || m.team2Name))}</div>
                    <div class="mo-stat-row"><span>Top scorer</span><strong>${batB ? moEsc(batB.playerName) + ' · ' + batB.runs + ' (' + batB.balls + ')' : '—'}</strong></div>
                    <div class="mo-stat-row"><span>Top bowler</span><strong>${bowlB ? moEsc(bowlB.playerName) + ' · ' + moEsc(bowlB.figures) : '—'}</strong></div>
                </div>
            </div>
        </div>`;
    } else {
        // Live / in progress status strip
        let pill = 'Live';
        let pillCls = 'live';
        let main = '';
        if (phase === 'not_started') {
            pill = 'Upcoming'; pillCls = '';
            main = moTossText(ov, m);
        } else if (phase === 'innings1' || phase === 'innings1_break') {
            pill = phase === 'innings1_break' ? 'Innings Break' : '1st Innings';
            pillCls = 'live';
            main = moTossText(ov, m);
            if (phase === 'innings1_break' && ov.target != null) {
                main += ` · Target set: <b>${ov.target}</b>`;
            }
        } else if (phase === 'innings2') {
            pill = '2nd Innings';
            pillCls = 'live';
            main = moTargetText(ov) || 'Chase in progress';
        }

        html += `<div class="mo-card mo-status">
            <span class="mo-status-pill ${pillCls}">${pill}</span>
            <span class="mo-status-main">${main}</span>
        </div>`;

        // Batters / Bowlers only when innings has started
        if (phase !== 'not_started') {
            html += `<div class="mo-card">
                <div class="mo-split">
                    <div class="mo-side left">
                        <div class="mo-side-label">🏏 On strike · Non-striker</div>
                        ${moBatLine(ov.striker, true)}
                        <div style="height:0.55rem"></div>
                        ${moBatLine(ov.nonStriker, false)}
                    </div>
                    <div class="mo-slash">/</div>
                    <div class="mo-side right">
                        <div class="mo-side-label">🎯 Bowling now · Last over</div>
                        ${moBowlLine(ov.currentBowler, 'current')}
                        <div style="height:0.55rem"></div>
                        ${moBowlLine(ov.lastOverBowler, 'last over')}
                    </div>
                </div>
            </div>`;
        }
    }

    // Worm chart (hide if no ball data at all)
    const hasWorm = ((ov.worms?.innings1?.runs || []).length > 1) || ((ov.worms?.innings2?.runs || []).length > 1);
    if (hasWorm || phase === 'completed') {
        const title = phase === 'completed'
            ? 'Worm graph · full match'
            : (phase === 'innings2' ? 'Worm graph · both innings' : 'Worm graph · runs / overs');
        html += `<div class="mo-card">
            <div class="mo-chart-title">
                <span>${title}</span>
                <div class="mo-legend" id="mo-worm-legend"></div>
            </div>
            <div class="mo-chart-wrap">
                <canvas id="mo-worm-canvas"></canvas>
            </div>
        </div>`;
    } else if (phase === 'not_started') {
        html += `<div class="mo-card"><div class="mo-empty">Worm graph will appear once the first over is bowled.</div></div>`;
    }

    box.innerHTML = html;
    box.style.display = 'flex';

    // Chart after DOM paint
    if (document.getElementById('mo-worm-canvas')) {
        requestAnimationFrame(() => renderMoWorm(ov, m));
    } else {
        destroyMoWorm();
    }
}


// ── Scorecard page mode: Overview (default) vs Scorecard & Details ──
let scPageMode = 'overview';

function switchScorecardMode(mode) {
    scPageMode = mode === 'details' ? 'details' : 'overview';
    const ov = document.getElementById('sc-mode-overview');
    const det = document.getElementById('sc-mode-details');
    const btnO = document.getElementById('sc-mode-overview-btn');
    const btnD = document.getElementById('sc-mode-details-btn');
    if (ov) ov.style.display = scPageMode === 'overview' ? '' : 'none';
    if (det) det.style.display = scPageMode === 'details' ? '' : 'none';
    if (btnO) btnO.classList.toggle('active', scPageMode === 'overview');
    if (btnD) btnD.classList.toggle('active', scPageMode === 'details');

    // When returning to overview, rebuild worm chart (canvas may have been hidden)
    if (scPageMode === 'overview' && currentScorecard) {
        const box = document.getElementById('match-overview-box');
        if (box && box.style.display !== 'none' && document.getElementById('mo-worm-canvas')) {
            requestAnimationFrame(() => {
                try { renderMoWorm(currentScorecard.overview || {}, currentScorecard.match || {}); }
                catch (e) { /* chart may not be ready */ }
            });
        }
    }
    // When opening details, ensure a scorecard panel is visible
    if (scPageMode === 'details') {
        const panels = ['inn1-card','bowl1-card','inn2-card','bowl2-card','so1-card','so2-card','xi-card','details-card'];
        const anyShown = panels.some(id => {
            const el = document.getElementById(id);
            return el && el.style.display && el.style.display !== 'none';
        });
        if (!anyShown) switchInnings('inn1');
    }
}

function renderScorecard(data) {
    const m = data.match;
    document.getElementById('scorecard-header-box').innerHTML = `
        <div class="scorecard-header">
            <div class="scorecard-team"><h3>${shortTeam(m.team1Name)}</h3><div class="scorecard-runs">${m.team1TotalRuns}/${m.team1TotalWickets}</div></div>
            <div class="scorecard-vs">VS</div>
            <div class="scorecard-team"><h3>${shortTeam(m.team2Name)}</h3><div class="scorecard-runs">${m.team2TotalRuns}/${m.team2TotalWickets}</div></div>
        </div>
        <div style="display:flex; gap:1.2rem; flex-wrap:wrap; margin-bottom:0.35rem; font-size:0.82rem; color:var(--text-muted);">
            <span>🏆 ${m.tournamentName}</span>
            <span>${fmtBadge(m.matchFormat)}</span>
            <span>📅 ${m.matchDate || '—'}</span>
        </div>`;

        renderMatchOverview(data);

    // Determine which team's Playing XI batted in each innings, so we can
    // list "yet to bat" players. Matches batsmanIDs against each XI.
    const pickBattingXI = (batRows) => {
        const ids = new Set((batRows || []).map(b => String(b.batsmanID)));
        const xi1 = data.team1XI || [];
        const xi2 = data.team2XI || [];
        const c1 = xi1.filter(p => ids.has(String(p.playerID))).length;
        const c2 = xi2.filter(p => ids.has(String(p.playerID))).length;
        if (c1 === 0 && c2 === 0) return [];
        return c1 >= c2 ? xi1 : xi2;
    };
    renderBatTable('inn1-bat-body', data.innings1Bat, pickBattingXI(data.innings1Bat));
    renderBatTable('inn2-bat-body', data.innings2Bat, pickBattingXI(data.innings2Bat));
    renderBatTableClassic('perf-inn1-bat-body', data.innings1Bat);
    renderBatTableClassic('perf-inn2-bat-body', data.innings2Bat);
    renderBowlTable('inn1-bowl-body', data.innings1Bowl);
    renderBowlTable('inn2-bowl-body', data.innings2Bowl);
    renderBowlTable('main-inn1-bowl-body', data.innings1Bowl);
    renderBowlTable('main-inn2-bowl-body', data.innings2Bowl);
    renderXIBoxes(data.match.team1Name, data.team1XI || [], data.match.team2Name, data.team2XI || []);

    // Super over tabs — show only if there is data
    const hasSO = (data.innings3Bat && data.innings3Bat.length > 0)
               || (data.innings4Bat && data.innings4Bat.length > 0);
    ['tab-so1','tab-so2','log-inn-3','log-inn-4',
     'perf-tab-so1','perf-tab-so2'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = hasSO ? '' : 'none';
    });
    if (hasSO) {
        renderBatTable('so1-bat-body', data.innings3Bat, pickBattingXI(data.innings3Bat));
        renderBatTable('so2-bat-body', data.innings4Bat, pickBattingXI(data.innings4Bat));
        renderBatTableClassic('perf-so1-bat-body', data.innings3Bat);
        renderBatTableClassic('perf-so2-bat-body', data.innings4Bat);
        renderBowlTable('so1-bowl-body', data.innings3Bowl);
        renderBowlTable('so2-bowl-body', data.innings4Bowl);
        renderBowlTable('perf-so1-bowl-body', data.innings3Bowl);
        renderBowlTable('perf-so2-bowl-body', data.innings4Bowl);
    }

    switchInnings('inn1');
    switchScorecardMode('overview');
}

function formatDismissal(row) {
    const t = (row.dismissal || '').trim();
    if (!t) return 'not out';
    const b = row.bowlerName, f = row.fielderName;
    switch (t) {
        case 'Caught':          return f ? `c ${f} b ${b}` : (b ? `b ${b}` : t);
        case 'CaughtAndBowled': return b ? `c & b ${b}` : t;
        case 'Bowled':          return b ? `b ${b}` : t;
        case 'LBW':             return b ? `lbw b ${b}` : t;
        case 'Stumped':         return f ? `st ${f} b ${b}` : (b ? `b ${b}` : t);
        case 'RunOut':          return f ? `run out (${f})` : 'run out';
        case 'HitWicket':       return b ? `hit wicket b ${b}` : t;
        case 'RetiredOut':      return 'retired out';
        default:                return t;
    }
}

function renderBatTable(tbId, rows, xiRows, opts) {
    const tb = document.getElementById(tbId);
    if (!tb) return;
    rows = rows || [];
    xiRows = xiRows || [];
    opts = opts || {};

    const activeIds    = opts.activeIds    || null;   // Set of IDs currently at crease
    const pendingWk    = opts.pendingWicket || false;  // show picker after last dismissed batter
    const excludeFromPick = opts.excludeFromPick || null; // Set of IDs to hide from picker

    // Build xiOrder lookup (Playing XI insertion order = batting arrival order)
    const xiOrderMap = {};
    xiRows.forEach(p => { xiOrderMap[String(p.playerID)] = p.xiOrder || 0; });

    // Sort batted players by actual batting sequence (battingSeq = MIN(ballID))
    const sortedRows = [...rows].sort((a, b) =>
        (a.battingSeq ?? 9999) - (b.battingSeq ?? 9999)
    );

    // Batted IDs
    const battedIDs = new Set(rows.map(r => String(r.batsmanID)));

    // Active-but-not-batted: players at crease not yet in batted rows
    const activeNotBatted = new Set();
    if (activeIds) {
        activeIds.forEach(id => {
            if (!battedIDs.has(id)) activeNotBatted.add(id);
        });
    }

    // Merge active-not-batted players into sortedRows at the correct position
    // based on xiOrder (arrival order). A player who arrived 4th (xiOrder=4)
    // must appear above a player who arrived 7th (xiOrder=7), even if the
    // 7th player has battingSeq and the 4th doesn't.
    const activeNotBattedList = [];
    activeNotBatted.forEach(id => {
        const p = xiRows.find(x => String(x.playerID) === id);
        if (p) activeNotBattedList.push(p);
    });
    // Sort active-not-batted by arrival order
    activeNotBattedList.sort((a, b) => (xiOrderMap[String(a.playerID)] || 0) - (xiOrderMap[String(b.playerID)] || 0));

    // Build merged list: batted + active-not-batted, in correct batting sequence
    const mergedRows = [...sortedRows];
    activeNotBattedList.forEach(p => {
        const pXi = xiOrderMap[String(p.playerID)] || 0;
        // Find insertion point: place before the first batted player whose xiOrder is higher
        let insertIdx = mergedRows.length;
        for (let i = 0; i < mergedRows.length; i++) {
            const bXi = xiOrderMap[String(mergedRows[i].batsmanID)] || 0;
            if (bXi > pXi) { insertIdx = i; break; }
        }
        mergedRows.splice(insertIdx, 0, {
            batsmanID: p.playerID,
            playerName: p.playerName,
            runs: 0, balls: 0, fours: 0, sixes: 0,
            dismissal: null, bowlerName: null, fielderName: null,
            battingSeq: null,
            _synthetic: true
        });
    });

    // Yet-to-bat: XI players not in batted set and not active-but-not-batted,
    // sorted by batting order band (Top → Middle → Lower → Tail) then XI insertion order
    const yetToBat = xiRows
        .filter(p => !battedIDs.has(String(p.playerID)) && !activeNotBatted.has(String(p.playerID)))
        .sort((a, b) => (BATTING_ORDER_RANK[a.battingOrder] || 99) - (BATTING_ORDER_RANK[b.battingOrder] || 99)
                      || (a.xiOrder || 0) - (b.xiOrder || 0));

    if (!mergedRows.length && !yetToBat.length) {
        tb.innerHTML = `<tr><td colspan="7" class="empty-state">No batting data.</td></tr>`;
        return;
    }

    // Build the picker options (available = yet-to-bat minus excluded)
    const pickerAvail = yetToBat.filter(p => !excludeFromPick || !excludeFromPick.has(String(p.playerID)));

    // ── Render merged rows (batted + active-not-batted in correct order) ──
    let pickerInserted = false;
    const mergedHTML = mergedRows.map((r, idx) => {
        const sr = r.balls ? ((r.runs / r.balls) * 100).toFixed(1) : '0.0';
        const isOut = !!(r.dismissal && String(r.dismissal).trim());
        const isActive = r._synthetic || (activeIds && activeIds.has(String(r.batsmanID)));
        let status;
        if (isOut) {
            status = formatDismissal(r);
        } else if (isActive) {
            status = 'playing';
        } else {
            status = formatDismissal(r);
        }
        const rowCls = isOut ? 'sc-bat-row sc-out' : 'sc-bat-row sc-notout';
        let html = `<tr class="${rowCls}">
            <td class="sc-name">${r.playerName}</td>
            <td class="sc-dismissal">${status}</td>
            <td class="sc-num sc-runs">${r.runs}</td>
            <td class="sc-num">${r.balls}</td>
            <td class="sc-num sc-fours">${r.fours}</td>
            <td class="sc-num sc-sixes">${r.sixes}</td>
            <td class="sc-num sc-sr">${sr}</td>
        </tr>`;
        // Insert picker row right after the last dismissed batter
        if (pendingWk && isOut && !pickerInserted) {
            const isLastDismissed = !mergedRows.slice(idx + 1).some(r2 =>
                !!(r2.dismissal && String(r2.dismissal).trim())
            );
            if (isLastDismissed) {
                pickerInserted = true;
                html += buildPickerRow(pickerAvail);
            }
        }
        return html;
    }).join('');

    // ── Render yet-to-bat rows ──
    const dnbHTML = yetToBat.map(p => `
        <tr class="sc-bat-row sc-dnb">
            <td class="sc-name">${p.playerName}</td>
            <td class="sc-dismissal">yet to bat</td>
            <td class="sc-num">–</td>
            <td class="sc-num">–</td>
            <td class="sc-num">–</td>
            <td class="sc-num">–</td>
            <td class="sc-num">–</td>
        </tr>`).join('');

    // If no dismissed batter found but picker still needed (edge case), append at top
    if (pendingWk && !pickerInserted && pickerAvail.length) {
        var pickerTopHTML = buildPickerRow(pickerAvail);
    }

    // Final display order: merged (batted + active) → yet-to-bat
    tb.innerHTML = (pickerTopHTML || '') + mergedHTML + dnbHTML;
}

function buildPickerRow(players) {
    if (!players || !players.length) return '';
    const opts = players.map(p =>
        `<option value="${p.playerID}">${p.playerName}</option>`
    ).join('');
    return `<tr class="sc-bat-row sc-picker-row">
        <td class="sc-picker-cell" colspan="7">
            <span class="sc-picker-label">⚡ New batter:</span>
            <select class="sc-picker-select" onchange="lsPickNewBatter(this.value)">
                <option value="">— select —</option>
                ${opts}
            </select>
        </td>
    </tr>`;
}

function renderBowlTable(tbId, rows) {
    const tb = document.getElementById(tbId);
    if (!tb) return;
    if (!rows || !rows.length) {
        tb.innerHTML = `<tr><td colspan="6" class="empty-state">No bowling data.</td></tr>`;
        return;
    }
    tb.innerHTML = rows.map(r => {
        const overs = r.ballsBowled ? Math.floor(r.ballsBowled / 6) + '.' + (r.ballsBowled % 6) : '0';
        const econ  = r.ballsBowled ? ((r.runsConceded / r.ballsBowled) * 6).toFixed(2) : '0.00';
        return `<tr class="sc-bowl-row">
            <td class="sc-bowl-name">${r.playerName}</td>
            <td class="sc-bowl-num">${overs}</td>
            <td class="sc-bowl-num">${r.runsConceded}</td>
            <td class="sc-bowl-wkts">${r.wicketsTaken}</td>
            <td class="sc-bowl-num">${r.maidens || 0}</td>
            <td class="sc-bowl-econ">${econ}</td>
        </tr>`;
    }).join('');
}

function renderBatTableClassic(tbId, rows) {
    const tb = document.getElementById(tbId);
    if (!tb) return;
    if (!rows || !rows.length) {
        tb.innerHTML = `<tr><td colspan="7" class="empty-state">No batting data.</td></tr>`;
        return;
    }
    const sorted = [...rows].sort((a, b) => (a.battingSeq ?? 9999) - (b.battingSeq ?? 9999));
    tb.innerHTML = sorted.map(r => {
        const sr = r.balls ? ((r.runs / r.balls) * 100).toFixed(1) : '0.0';
        return `<tr>
            <td><strong>${r.playerName}</strong></td>
            <td><strong style="color:var(--neon-green);">${r.runs}</strong></td>
            <td>${r.balls}</td>
            <td style="color:var(--gold-bright);">⚡${r.fours}</td>
            <td style="color:var(--red-ball-light);">💥${r.sixes}</td>
            <td style="color:var(--text-muted);">${sr}</td>
            <td style="color:var(--text-muted); font-size:0.78rem;">${formatDismissal(r)}</td>
        </tr>`;
    }).join('');
}

function renderXIBoxes(team1Name, team1Rows, team2Name, team2Rows) {
    const list1 = document.getElementById('xi-team1-list');
    const list2 = document.getElementById('xi-team2-list');
    const name1 = document.getElementById('xi-team1-name');
    const name2 = document.getElementById('xi-team2-name');
    
    if (name1) name1.textContent = team1Name;
    if (name2) name2.textContent = team2Name;

    const renderList = (rows, listEl) => {
        if (!listEl) return;
        if (!rows || !rows.length) {
            listEl.innerHTML = `<li style="padding:0.5rem 0; color:var(--text-muted); text-align:center;">No Playing XI Data</li>`;
            return;
        }
        
        rows = [...rows].sort((a, b) => (BATTING_ORDER_RANK[a.battingOrder] || 99) - (BATTING_ORDER_RANK[b.battingOrder] || 99)
                                      || (a.xiOrder || 0) - (b.xiOrder || 0));
        
        const getRoleTag = (r) => {
            if (r.matchRole === 'Captain') return ' <span style="color:var(--gold-bright); font-weight:bold; font-size:0.8rem;">(C)</span>';
            if (r.matchRole === 'WicketKeeper') return ' <span style="color:#86efac; font-weight:bold; font-size:0.8rem;">(WK)</span>';
            if (r.matchRole === 'Captain & WK') return ' <span style="color:var(--gold-bright); font-weight:bold; font-size:0.8rem;">(C & WK)</span>';
            return '';
        };

        const getStyleBadge = (r) => {
            let style = '';
            if (r.playerRole === 'Batsman' || r.playerRole === 'WicketKeeper') {
                style = r.battingStyle && r.battingStyle !== 'None' ? r.battingStyle : r.playerRole;
            } else if (r.playerRole === 'Bowler') {
                style = r.bowlingStyle && r.bowlingStyle !== 'None' ? r.bowlingStyle : r.playerRole;
            } else if (r.playerRole === 'AllRounder') {
                let parts = [];
                if (r.battingStyle && r.battingStyle !== 'None') parts.push(r.battingStyle);
                if (r.bowlingStyle && r.bowlingStyle !== 'None') parts.push(r.bowlingStyle);
                style = parts.join(' • ') || 'All-Rounder';
            } else {
                style = r.playerRole || 'Player';
            }
            return style;
        };

        const renderGroup = (title, players) => {
            if (!players.length) return '';
            return `
                <div style="background: rgba(255,255,255,0.03); border-radius: 8px; padding: 0.8rem; margin-bottom: 1rem; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="font-size: 0.85rem; color: var(--primary-light); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.3rem;">${title}</div>
                    <ul style="list-style: none; padding: 0; margin: 0;">
                        ${players.map(r => `
                            <li style="padding: 0.4rem 0; display:flex; justify-content:space-between; align-items:center;">
                                <span style="font-size:0.95rem;">${r.playerName}${getRoleTag(r)}</span>
                                <span style="font-size:0.75rem; color:var(--text-muted); background:rgba(255,255,255,0.05); padding:2px 6px; border-radius:4px; max-width:50%; text-align:right;">${getStyleBadge(r)}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            `;
        };

        const topOrder = rows.filter(r => (r.battingOrder || 'Middle Order') === 'Top Order');
        const middleOrder = rows.filter(r => (r.battingOrder || 'Middle Order') === 'Middle Order');
        const lowerOrder = rows.filter(r => (r.battingOrder || 'Middle Order') === 'Lower Order');
        const tail = rows.filter(r => (r.battingOrder || 'Middle Order') === 'Tail');

        listEl.innerHTML = renderGroup('Top Order', topOrder) + 
                           renderGroup('Middle Order', middleOrder) + 
                           renderGroup('Lower Order', lowerOrder) + 
                           renderGroup('Tail', tail);
    };

    renderList(team1Rows, list1);
    renderList(team2Rows, list2);
}

function switchInnings(tab) {
    const panels = ['inn1-card','bowl1-card','inn2-card','bowl2-card','so1-card','so2-card','xi-card','details-card'];
    const tabs   = ['tab-inn1','tab-bowl1','tab-inn2','tab-bowl2','tab-so1','tab-so2','tab-xi','tab-details'];
    panels.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    tabs.forEach(id   => { const el = document.getElementById(id); if (el) el.classList.remove('active'); });

    const map    = { inn1:'inn1-card', bowl1:'bowl1-card', inn2:'inn2-card', bowl2:'bowl2-card',
                     so1:'so1-card', so2:'so2-card',
                     xi:'xi-card', details:'details-card' };
    const tabMap = { inn1:'tab-inn1',  bowl1:'tab-bowl1',  inn2:'tab-inn2',  bowl2:'tab-bowl2',
                     so1:'tab-so1',  so2:'tab-so2',
                     xi:'tab-xi',  details:'tab-details' };

    const el    = document.getElementById(map[tab]);
    const tabEl = document.getElementById(tabMap[tab]);
    if (el)    el.style.display = 'block';
    if (tabEl) tabEl.classList.add('active');

    // When Detailed Stats is opened, default to Players Performance > 1st Innings Batting
    if (tab === 'details') {
        switchDetailTab('perf');
        switchPerfTab('inn1');
    }
}

function switchDetailTab(sub) {
    const panels = ['perf-panel','detail-balllog-panel'];
    const tabs   = ['tab-perf','tab-detail-balllog'];
    panels.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    tabs.forEach(id   => { const el = document.getElementById(id); if (el) el.classList.remove('active'); });

    const map    = { perf:'perf-panel', 'detail-balllog':'detail-balllog-panel' };
    const tabMap = { perf:'tab-perf',   'detail-balllog':'tab-detail-balllog' };

    const el    = document.getElementById(map[sub]);
    const tabEl = document.getElementById(tabMap[sub]);
    if (el)    el.style.display = 'block';
    if (tabEl) tabEl.classList.add('active');

    // Load ball log when that sub-tab is clicked
    if (sub === 'detail-balllog' && beMatchId) loadBallLog(beMatchId, beInnings);
}

function switchPerfTab(sub) {
    const panels = ['perf-inn1-card','perf-bowl1-card','perf-inn2-card','perf-bowl2-card',
                    'perf-so1-card','perf-so2-card'];
    const tabs   = ['perf-tab-inn1','perf-tab-bowl1','perf-tab-inn2','perf-tab-bowl2',
                    'perf-tab-so1','perf-tab-so2'];
    panels.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    tabs.forEach(id   => { const el = document.getElementById(id); if (el) el.classList.remove('active'); });

    const map    = { inn1:'perf-inn1-card', bowl1:'perf-bowl1-card', inn2:'perf-inn2-card', bowl2:'perf-bowl2-card',
                     so1:'perf-so1-card', so2:'perf-so2-card' };
    const tabMap = { inn1:'perf-tab-inn1',  bowl1:'perf-tab-bowl1',  inn2:'perf-tab-inn2',  bowl2:'perf-tab-bowl2',
                     so1:'perf-tab-so1',  so2:'perf-tab-so2' };

    const el    = document.getElementById(map[sub]);
    const tabEl = document.getElementById(tabMap[sub]);
    if (el)    el.style.display = 'block';
    if (tabEl) tabEl.classList.add('active');
}

// ── Delete Match ─────────────────────────────────────────

async function undoLastBall() {
    if (!beMatchId) return;
    if (!await customConfirm('Are you sure you want to undo the last ball?')) return;
    try {
        const res = await authFetch(`${API}/api/balls/${beMatchId}?innings=${beInnings}`);
        const balls = await res.json();
        if (!balls || !balls.length) {
            showToast('No balls to undo.', 'error');
            return;
        }
        const lastBallId = balls[balls.length - 1].ballID;
        await deleteBall(lastBallId);
    } catch {
        showToast('Error undoing ball.', 'error');
    }
}

async function confirmDeleteBall(ballId) {
    if (await customConfirm('Delete this specific ball?')) {
        await deleteBall(ballId);
    }
}

async function deleteBall(ballId) {
    try {
        const res = await authFetch(`${API}/api/balls/${ballId}`, { method: 'DELETE' });
        if (!res.ok) {
            showToast('Failed to delete ball.', 'error');
            return;
        }
        showToast('Ball deleted.');
        
        // Refresh state
        const stateRes = await authFetch(`${API}/api/balls/state/${beMatchId}?innings=${beInnings}`);
        const stateData = await stateRes.json();
        lsCurrentOver = stateData.nextOver;
        lsCurrentBall = stateData.nextBall;
        updateScoreboardStrip(stateData.totalRuns, stateData.wickets, lsCurrentOver, lsCurrentBall);
        
        lsRefreshStats();
        updateTimeline();
    } catch {
        showToast('Server error.', 'error');
    }
}

async function deleteMatch(mid) {
    if (!await customConfirm(`Delete Match #${mid}? All ball-by-ball data will also be removed.`)) return;
    try {
        const res = await authFetch(`${API}/api/matches/${mid}`, { method: 'DELETE' });
        if (res.ok) { showToast(`Match #${mid} deleted.`); await loadMatches(); if (window.DataSync) DataSync.dataChanged('matches'); }
        else { const d = await res.json(); showToast(d.error || 'Delete failed', 'error'); }
    } catch { showToast('Server error.', 'error'); }
}

// ── Add Match ────────────────────────────────────────────
async function populateSelectDropdowns() {
    try {
        const [teams, venues, umpires, tournaments] = await Promise.all([
            authFetch(`${API}/api/teams`).then(r => r.json()),
            authFetch(`${API}/api/venues`).then(r => r.json()),
            authFetch(`${API}/api/umpires`).then(r => r.json()),
            authFetch(`${API}/api/tournaments`).then(r => r.json())
        ]);
        
        const trnSelect = document.getElementById('m-tournament');
        if (trnSelect) {
            trnSelect.innerHTML = '<option value="">Select Tournament...</option>' + 
                tournaments.map(t => `<option value="${t.tournamentName}" data-teams='${JSON.stringify(t.teams || [])}'>${t.tournamentName}</option>`).join('');
        }

        const t1 = document.getElementById('m-team1');
        const t2 = document.getElementById('m-team2');
        t1.innerHTML = teams.map(t => `<option value="${t.teamName}">${t.teamName}</option>`).join('');
        t2.innerHTML = teams.map(t => `<option value="${t.teamName}">${t.teamName}</option>`).join('');
        t2.selectedIndex = 1 % teams.length;

        const uOpts = umpires.map(u => `<option value="${u.umpireID}">${u.umpireName}</option>`).join('');
        document.getElementById('m-ump1').innerHTML = uOpts;
        document.getElementById('m-ump2').innerHTML = uOpts;

        document.getElementById('m-venue').innerHTML = venues.map(v => `<option value="${v.venueID}">${v.venueName} (${v.venueCity})</option>`).join('');
    } catch { showToast('Failed to load options', 'error'); }
}

async function openAddMatchModal() {
    await populateSelectDropdowns();
    document.getElementById('addMatchModal').style.display = 'flex';
}

function closeAddMatchModal() {
    document.getElementById('addMatchModal').style.display = 'none';
    document.getElementById('wizard-step-1').style.display = 'block';
    document.getElementById('wizard-step-2').style.display = 'none';
    document.getElementById('wizard-step-3').style.display = 'none';
    document.getElementById('addMatchForm').reset();
}

function onTournamentSelect() {
    const sel = document.getElementById('m-tournament');
    const opt = sel.selectedOptions[0];
    if (opt && opt.dataset.teams) {
        try {
            const teams = JSON.parse(opt.dataset.teams);
            const t1 = document.getElementById('m-team1');
            const t2 = document.getElementById('m-team2');
            
            // Only update if the tournament actually has teams assigned
            if (teams.length > 0) {
                t1.innerHTML = teams.map(t => `<option value="${t}">${t}</option>`).join('');
                t2.innerHTML = teams.map(t => `<option value="${t}">${t}</option>`).join('');
                if(teams.length > 1) t2.selectedIndex = 1;
            }
        } catch(e) {}
    }
}

async function goToStep2() {
    const t1 = document.getElementById('m-team1').value;
    const t2 = document.getElementById('m-team2').value;
    const tournamentName = document.getElementById('m-tournament').value;

    if(!t1 || !t2 || t1 === t2) {
        showToast('Please select two distinct teams', 'error');
        return;
    }
    if(!tournamentName) {
        showToast('Please select a tournament', 'error');
        return;
    }
    
    // Populate Toss Winner
    const tossSel = document.getElementById('m-toss-winner');
    tossSel.innerHTML = `<option value="${t1}">${shortTeam(t1)}</option><option value="${t2}">${shortTeam(t2)}</option>`;
    
    document.getElementById('wizard-step-1').style.display = 'none';
    document.getElementById('wizard-step-2').style.display = 'block';
    document.getElementById('wizard-step-3').style.display = 'none';
}

async function goToStep3() {
    const t1 = document.getElementById('m-team1').value;
    const t2 = document.getElementById('m-team2').value;
    const tournamentName = document.getElementById('m-tournament').value;

    // Populate Squads for Playing XI
    document.getElementById('label-team1-xi').textContent = shortTeam(t1);
    document.getElementById('label-team2-xi').textContent = shortTeam(t2);
    
    try {
        const res = await authFetch(`${API}/api/tournaments/${encodeURIComponent(tournamentName)}/squad`);
        const squads = await res.json();
        
        const squad1 = squads[t1] || [];
        const squad2 = squads[t2] || [];
        
        const xi1 = document.getElementById('m-team1-xi');
        const xi2 = document.getElementById('m-team2-xi');
        
        if (squad1.length === 0 || squad2.length === 0) {
            showToast('Warning: One or both teams have no tournament squad assigned.', 'error');
        }

        const KNOWN_OPENERS = [];

        function buildSquadUI(squad, teamIndex) {
            const categories = {
                'Top Order': [],
                'Middle Order': [],
                'Lower Order': [],
                'Tail': []
            };

            squad.forEach(p => {
                const band = p.battingOrder || 'Middle Order';
                if (categories[band]) {
                    categories[band].push(p);
                } else {
                    categories['Middle Order'].push(p);
                }
            });

            let html = '';
            const order = ['Top Order', 'Middle Order', 'Lower Order', 'Tail'];
            
            order.forEach(cat => {
                const players = categories[cat];
                if (players.length > 0) {
                    html += `<div style="font-size:0.75rem; font-weight:700; color:var(--primary-light); margin-top:0.8rem; margin-bottom:0.4rem; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:0.2rem; text-transform:uppercase;">${cat} (${players.length})</div>`;
                    players.forEach(p => {
                        html += `
                        <label style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.4rem; cursor:pointer;">
                            <input type="checkbox" name="team${teamIndex}_xi" value="${p.playerID}" data-role="${p.playerRole}" data-name="${p.playerName.replace(/"/g, '&quot;')}" data-batting-order="${p.battingOrder || 'Middle Order'}" style="accent-color:var(--primary);" onchange="updateXICounts()">
                            <span style="color:var(--text); font-size:0.85rem;">${p.playerName} <span style="color:var(--text-muted); font-size:0.75rem;">(${p.playerRole})</span></span>
                        </label>`;
                    });
                }
            });

            return html;
        }

        xi1.innerHTML = buildSquadUI(squad1, 1);
        xi2.innerHTML = buildSquadUI(squad2, 2);
        
        // initialize counts
        setTimeout(updateXICounts, 50);
        
        document.getElementById('wizard-step-2').style.display = 'none';
        document.getElementById('wizard-step-3').style.display = 'block';
    } catch {
        showToast('Failed to load tournament squads', 'error');
    }
}

function populateDropdown(selectId, options, placeholder, currentVal) {
    const el = document.getElementById(selectId);
    if (!el) return;
    el.innerHTML = `<option value="">${placeholder}</option>` + options.map(o => 
        `<option value="${o.value}" ${o.value === currentVal ? 'selected' : ''}>${o.text}</option>`
    ).join('');
}

function updateXICounts() {
    const t1Checked = Array.from(document.querySelectorAll('input[name="team1_xi"]:checked'));
    const t2Checked = Array.from(document.querySelectorAll('input[name="team2_xi"]:checked'));
    
    const t1 = t1Checked.length;
    const t2 = t2Checked.length;
    
    const count1 = document.getElementById('count-team1-xi');
    const count2 = document.getElementById('count-team2-xi');
    
    if (count1) {
        count1.textContent = `${t1}/11`;
        count1.style.background = t1 === 11 ? 'var(--neon-green)' : (t1 > 11 ? 'var(--red-ball-light)' : 'var(--primary)');
    }
    if (count2) {
        count2.textContent = `${t2}/11`;
        count2.style.background = t2 === 11 ? 'var(--neon-green)' : (t2 > 11 ? 'var(--red-ball-light)' : 'var(--primary)');
    }

    const t1c = document.getElementById('m-team1-c')?.value;
    const t1wk = document.getElementById('m-team1-wk')?.value;
    const t2c = document.getElementById('m-team2-c')?.value;
    const t2wk = document.getElementById('m-team2-wk')?.value;

    const t1Opts = t1Checked.map(cb => ({ value: cb.value, text: cb.dataset.name, role: cb.dataset.role }));
    const t2Opts = t2Checked.map(cb => ({ value: cb.value, text: cb.dataset.name, role: cb.dataset.role }));

    populateDropdown('m-team1-c', t1Opts, 'Select Captain...', t1c);
    populateDropdown('m-team1-wk', t1Opts.filter(o => o.role === 'WicketKeeper'), 'Select Wicket Keeper...', t1wk);

    populateDropdown('m-team2-c', t2Opts, 'Select Captain...', t2c);
    populateDropdown('m-team2-wk', t2Opts.filter(o => o.role === 'WicketKeeper'), 'Select Wicket Keeper...', t2wk);
}

function goToStep1() {
    document.getElementById('wizard-step-3').style.display = 'none';
    document.getElementById('wizard-step-2').style.display = 'none';
    document.getElementById('wizard-step-1').style.display = 'block';
}

async function handleMatchWizard(e) {
    e.preventDefault();
    
    const team1Cbs = Array.from(document.querySelectorAll('input[name="team1_xi"]:checked'));
    const team2Cbs = Array.from(document.querySelectorAll('input[name="team2_xi"]:checked'));
    
    if(team1Cbs.length !== 11 || team2Cbs.length !== 11) {
        showToast(`Please select exactly 11 players for each team. (${team1Cbs.length} and ${team2Cbs.length} selected)`, 'error');
        return;
    }

    const t1c = document.getElementById('m-team1-c').value;
    const t1wk = document.getElementById('m-team1-wk').value;
    const t2c = document.getElementById('m-team2-c').value;
    const t2wk = document.getElementById('m-team2-wk').value;

    if (!t1c || !t1wk || !t2c || !t2wk) {
        showToast('Please select a Captain and Wicket Keeper for both teams.', 'error');
        return;
    }

    const team1Name = document.getElementById('m-team1').value;
    const team2Name = document.getElementById('m-team2').value;

    const team1Xi = team1Cbs.map(cb => {
        const id = cb.value;
        let role = null;
        if (id === t1c && id === t1wk) role = 'Captain & WK';
        else if (id === t1c) role = 'Captain';
        else if (id === t1wk) role = 'WicketKeeper';
        return { playerID: id, matchRole: role, teamName: team1Name };
    });
    
    const team2Xi = team2Cbs.map(cb => {
        const id = cb.value;
        let role = null;
        if (id === t2c && id === t2wk) role = 'Captain & WK';
        else if (id === t2c) role = 'Captain';
        else if (id === t2wk) role = 'WicketKeeper';
        return { playerID: id, matchRole: role, teamName: team2Name };
    });

    const body = {
        matchID:          parseInt(document.getElementById('m-id').value),
        tournamentName:   document.getElementById('m-tournament').value.trim(),
        matchFormat:      document.getElementById('m-format').value,
        matchType:        document.getElementById('m-type').value,
        isDayNight:       parseInt(document.getElementById('m-dn').value),
        team1Name:        document.getElementById('m-team1').value,
        team2Name:        document.getElementById('m-team2').value,
        venueID:          parseInt(document.getElementById('m-venue').value),
        matchDate:        document.getElementById('m-date').value || null,
        tossWinnerName:   document.getElementById('m-toss-winner').value,
        tossDecision:     document.getElementById('m-toss-decision').value,
        onFieldUmpire1ID: parseInt(document.getElementById('m-ump1').value),
        onFieldUmpire2ID: parseInt(document.getElementById('m-ump2').value),
    };
    
    try {
        const res = await authFetch(`${API}/api/matches`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
        const data = await res.json();
        if (!res.ok) { showToast(data.error || 'Add failed', 'error'); return; }
        
        // Now post Playing XI
        const xiRes = await authFetch(`${API}/api/matches/${body.matchID}/xi`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ players: [...team1Xi, ...team2Xi] })
        });
        
        if (!xiRes.ok) {
            showToast('Match created, but playing XI failed', 'error');
        } else {
            showToast(`Match #${body.matchID} and Playing XI created!`);
        }
        
        closeAddMatchModal();
        await loadMatches();
        if (window.DataSync) DataSync.matchCreated(body.matchID);
    } catch { showToast('Server error.', 'error'); }
}

// ═══════════════════════════════════════════════════════
// LIVE SCORING ENTRY (Redesigned)
// ═══════════════════════════════════════════════════════

let lsExtraType = '';
let lsExtraRuns = 0;
let lsCurrentOver = 1;
let lsCurrentBall = 1;

// ICC rules state, refreshed from /api/balls/state on every load
let beDismissedIDs = [];
let beBowlerOvers = {};
let beMaxOversPerBowler = null;
let beLastOverBowlerID = null;
let currentBowlingTeam = null;
let beBattingOptions = [];
let beBowlingOptions = [];
let beInningsTeams = {};
let beTossDone = false;

async function fetchBallState(innings) {
    const res = await authFetch(`${API}/api/balls/state/${beMatchId}?innings=${innings}`);
    return res.json();
}

async function openBallEntry() {
    if (!beMatchId) { showToast('Open a scorecard first.', 'error'); return; }

    // Reveal the live scoring view up-front so status overlays render correctly.
    document.getElementById('live-scoring-view').style.display = 'flex';
    document.getElementById('list-view').style.display = 'none';
    document.getElementById('scorecard-view').style.display = 'none';
    hideLsStatus();

    try {
        // Always resolve the active innings FROM SCRATCH (starting at innings 1)
        // so a stale beInnings left over from a previous match can never skip
        // straight into the 2nd innings / super over.
        let inn = 1;
        let data = await fetchBallState(inn);

        if (data.tossDone === false || (!data.battingTeam && !(data.match || {}).tossWinnerName)) {
            setScoringEnabled(false);
            showLsStatus('🪙', 'Toss Required',
                'Activate the match and complete the toss before live scoring. Batting and bowling sides are set from the toss.',
                [{ label: '← Back to Scorecard', onclick: () => { hideLsStatus(); closeLiveScoring(); } }]
            );
            document.getElementById('ls-teams-title').textContent = `Match #${beMatchId} • Toss pending`;
            return;
        }

        // If the match is already decided (incl. a finished super over), show the
        // final result immediately instead of trying to resume an innings.
        const mm = data.match || {};
        if ((data.matchStatus === 'completed' || mm.matchStatus === 'completed') && mm.winnerName) {
            beInnings = inn;
            applyBallState(data);
            const rt = mm.winMargin === 'Super Over'
                ? `${shortTeam(mm.winnerName)} won the Super Over`
                : `${shortTeam(mm.winnerName)} won${mm.winMargin ? ' by ' + mm.winMargin : ''}`;
            renderProgressBanner({ isLimitedOvers: true, matchComplete: true, resultText: rt });
            setScoringEnabled(false);
            showLsStatus('🏆', 'Match Complete', rt, [
                { label: '📊 View Scorecard', onclick: () => { hideLsStatus(); closeLiveScoring(); } }
            ]);
            document.getElementById('ls-teams-title').textContent = `Match #${beMatchId} • Result`;
            return;
        }

        // Advance to the innings that is genuinely in progress. A normal innings
        // break always advances to the next innings (so it can be started). A tie
        // (super_over_pending) only advances once the super over has actually
        // begun — otherwise we stop and show the "Start Super Over" prompt.
        // A visited set prevents infinite ping-pong between two tied super-over
        // innings (inn 3 ↔ inn 4) when both are complete.
        let visited = new Set();
        let guard = 0;
        while (guard < 4) {
            const pr = data.progress;
            if (!pr || !pr.inningsComplete || pr.matchComplete) break;

            let next = pr.nextInnings;
            const isTie = pr.phase === 'super_over_pending';
            if (isTie) next = 3;
            if (!next) break;

            // Prevent ping-pong between two tied super-over innings (3 ↔ 4).
            if (visited.has(next)) break;
            visited.add(next);

            const nextData = await fetchBallState(next);
            const nextStarted = (nextData.legalBalls || 0) > 0
                || (nextData.totalRuns || 0) > 0
                || (nextData.wickets || 0) > 0;
            // For a tie, don't auto-jump into an un-started super over.
            if (isTie && !nextStarted) break;

            inn = next;
            data = nextData;
            guard++;
        }

        beInnings = inn;
        applyBallState(data);
        beProgress = data.progress || null;
        renderProgressBanner(beProgress);

        // Match already decided -> lock scoring and show the result.
        if (beProgress && beProgress.matchComplete) {
            setScoringEnabled(false);
            handleInningsEnd(beProgress);
            return;
        }
        // Tie awaiting a super over.
        if (beProgress && beProgress.phase === 'super_over_pending') {
            setScoringEnabled(false);
            handleInningsEnd(beProgress);
            return;
        }

        setScoringEnabled(true);
        // Only prompt for openers when we have no persisted context at all
        if (!currentStriker || !currentBowler) {
            openContextModal('innings_start');
        } else if (pendingNewBatter) {
            openContextModal('wicket');
        }

        lsRefreshStats();
        updateTimeline();
        loadLiveBallLog();
    } catch (e) {
        bePlayers = [];
        populateBallDropdowns();
        showToast('Could not load ball state.', 'error');
    }

    const innTxt  = beInnings >= 3 ? `Super Over Inns ${beInnings - 2}` : `Innings ${beInnings}`;
    document.getElementById('ls-teams-title').textContent = `Match #${beMatchId} • ${innTxt}`;
}

// Apply a /api/balls/state payload to the live-scoring UI state.
function applyBallState(data) {
    bePlayers = data.players || [];
    beBattingOptions = data.battingOptions || [];
    beBowlingOptions = data.bowlingOptions || [];
    beInningsTeams = data.inningsTeams || {};
    beTossDone = !!data.tossDone;
    beDismissedIDs = data.dismissedPlayerIDs || [];
    beBowlerOvers = data.bowlerOvers || {};
    beMaxOversPerBowler = data.maxOversPerBowler;
    beLastOverBowlerID = data.lastOverBowlerID || null;

    lsCurrentOver = data.nextOver || 1;
    lsCurrentBall = data.nextBall || 1;

    if (data.battingTeam) currentBattingTeam = data.battingTeam;
    if (data.bowlingTeam) currentBowlingTeam = data.bowlingTeam;

    currentStriker    = data.strikerID    || null;
    currentNonStriker = data.nonStrikerID || null;
    currentBowler     = data.bowlerID     || null;
    pendingNewBatter  = currentStriker && beDismissedIDs.includes(currentStriker);
    if (pendingNewBatter) currentStriker = null;
    populateBallDropdowns();

    updateScoreboardStrip(data.totalRuns, data.wickets, lsCurrentOver, lsCurrentBall);

    const battingLabel = document.getElementById('ls-batting-team');
    const bowlingLabel = document.getElementById('ls-bowling-team');
    if (battingLabel) battingLabel.textContent = `🏏 ${shortTeam(currentBattingTeam).toUpperCase()} BATTING`;
    if (bowlingLabel) bowlingLabel.textContent = `🎯 ${shortTeam(currentBowlingTeam).toUpperCase()} BOWLING`;

    const inn1 = beInningsTeams['1'] || {};
    const inn2 = beInningsTeams['2'] || {};
    const sidesEl = document.getElementById('ls-innings-sides');
    if (sidesEl) {
        if (inn1.battingTeam && inn2.battingTeam) {
            sidesEl.innerHTML =
                `<span>1st: <b>${shortTeam(inn1.battingTeam)}</b> bat</span>` +
                `<span>2nd: <b>${shortTeam(inn2.battingTeam)}</b> bat</span>`;
            sidesEl.style.display = 'flex';
        } else {
            sidesEl.style.display = 'none';
        }
    }
}

// ── Innings / target / result UI ─────────────────────────────────────
function renderProgressBanner(prog) {
    const el = document.getElementById('ls-target-banner');
    if (!el) return;
    if (!prog || !prog.isLimitedOvers) { el.style.display = 'none'; return; }

    if (prog.matchComplete && prog.resultText) {
        el.className = 'ls-target-banner result';
        el.innerHTML = `<span class="ls-tb-result">🏆 ${prog.resultText}</span>`;
        el.style.display = 'flex';
        return;
    }
    if (prog.target != null) {
        const batName = shortTeam(prog.battingTeam || currentBattingTeam || '');
        const so = prog.isSuperOver ? 'SUPER OVER • ' : '';
        const ballWord = prog.ballsRemaining === 1 ? 'ball' : 'balls';
        el.className = 'ls-target-banner';
        el.innerHTML =
            `<span class="ls-tb-target">${so}TARGET ${prog.target}</span>` +
            `<span class="ls-tb-need"><b>${batName}</b> need <b>${prog.runsNeeded}</b> from <b>${prog.ballsRemaining}</b> ${ballWord}</span>`;
        el.style.display = 'flex';
        return;
    }
    if (prog.isSuperOver) {
        el.className = 'ls-target-banner super';
        el.innerHTML = `<span class="ls-tb-target">⚡ SUPER OVER — Innings ${prog.innings - 2}</span>`;
        el.style.display = 'flex';
        return;
    }
    el.style.display = 'none';
}

function showLsStatus(emoji, title, msg, actions) {
    const o = document.getElementById('ls-status-overlay');
    if (!o) return;
    document.getElementById('ls-status-emoji').textContent = emoji;
    document.getElementById('ls-status-title').textContent = title;
    document.getElementById('ls-status-msg').innerHTML = msg;
    const act = document.getElementById('ls-status-actions');
    act.innerHTML = '';
    (actions || []).forEach(a => {
        const b = document.createElement('button');
        b.className = 'btn-submit ' + (a.cls || '');
        b.style.margin = '0 0.4rem';
        b.textContent = a.label;
        b.onclick = a.onclick;
        act.appendChild(b);
    });
    o.style.display = 'flex';
}
function hideLsStatus() {
    const o = document.getElementById('ls-status-overlay');
    if (o) o.style.display = 'none';
}

function setScoringEnabled(on) {
    const pad = document.querySelector('#live-scoring-view .be-numpad');
    if (pad) {
        pad.style.opacity = on ? '1' : '0.4';
        pad.style.pointerEvents = on ? 'auto' : 'none';
    }
}

function handleInningsEnd(prog) {
    lsRefreshStats();
    renderProgressBanner(prog);
    setScoringEnabled(false);

    if (prog.matchComplete) {
        try { playCrowdSound('boundary'); } catch (e) {}
        showLsStatus('🏆', 'Match Complete', prog.resultText || 'Match complete.', [
            { label: '📊 View Scorecard', onclick: () => { hideLsStatus(); closeLiveScoring(); } }
        ]);
        if (window.DataSync && DataSync.matchCompleted) DataSync.matchCompleted(beMatchId);
        return;
    }

    if (prog.phase === 'super_over_pending') {
        if (prog.isSuperOver) {
            // One super over is supported by the schema; a tied super over is rare.
            showLsStatus('🤝', 'Super Over Tied', prog.resultText || 'The Super Over was tied.', [
                { label: '📊 View Scorecard', onclick: () => { hideLsStatus(); closeLiveScoring(); } }
            ]);
        } else {
            showLsStatus('🤝', 'Match Tied!',
                `Scores are level at <b>${prog.runs}</b>. Time for a Super Over — ` +
                `the side that batted second bats first.`, [
                { label: '⚡ Start Super Over', onclick: startSuperOver }
            ]);
        }
        return;
    }

    // innings_break or super_over_break -> start the next innings
    const nextInn = prog.nextInnings || (beInnings + 1);
    const isSO = prog.isSuperOver;
    const title = isSO ? 'Super Over — 1st Innings Done' : 'Innings Complete';
    const btn   = isSO ? '⚡ Bowl Super Over Chase' : '▶ Start 2nd Innings';
    showLsStatus('🏏', title,
        `${shortTeam(prog.battingTeam || '')} finished at <b>${prog.runs}/${prog.wickets}</b>. ` +
        `Target to win: <b>${prog.runs + 1}</b>.`, [
        { label: btn, onclick: () => { hideLsStatus(); startNextInnings(nextInn); } }
    ]);
}

async function startNextInnings(nextInn) {
    beInnings = nextInn;
    currentStriker = currentNonStriker = currentBowler = null;
    pendingNewBatter = false;
    beProgress = null;
    setScoringEnabled(true);
    // Fetch the target innings directly — bypass the auto-advance loop which
    // would re-evaluate from inn 1 and get stuck at the tie phase.
    const data = await fetchBallState(nextInn);
    applyBallState(data);
    beProgress = data.progress || null;
    renderProgressBanner(beProgress);
    if (beProgress && beProgress.matchComplete) {
        setScoringEnabled(false);
        handleInningsEnd(beProgress);
        return;
    }
    if (beProgress && beProgress.phase === 'super_over_pending') {
        setScoringEnabled(false);
        handleInningsEnd(beProgress);
        return;
    }
    if (!currentStriker || !currentBowler) {
        openContextModal('innings_start');
    } else if (pendingNewBatter) {
        openContextModal('wicket');
    }
    lsRefreshStats();
    updateTimeline();
    loadLiveBallLog();
    const innTxt  = beInnings >= 3 ? `Super Over Inns ${beInnings - 2}` : `Innings ${beInnings}`;
    document.getElementById('ls-teams-title').textContent = `Match #${beMatchId} • ${innTxt}`;
}

function startSuperOver() {
    hideLsStatus();
    startNextInnings(3);
}

function closeLiveScoring() {
    document.getElementById('live-scoring-view').style.display = 'none';
    document.getElementById('scorecard-view').style.display = 'block';
    viewScorecard(beMatchId);
}

function populateBallDropdowns() {
    // Fielders come from the bowling/fielding side only
    const fielders = bePlayers.filter(p => !currentBowlingTeam || p.teamName === currentBowlingTeam);
    const fieldOpts = '<option value="">— Select Fielder —</option>' +
        fielders.map(p => `<option value="${p.playerID}">${p.playerName}${p.playerRole === 'WicketKeeper' ? ' (WK)' : ''}</option>`).join('');

    const fielderEl = document.getElementById('ls-wicket-fielder');
    if (fielderEl) fielderEl.innerHTML = fieldOpts;
}

function currentBattersOptions() {
    const opts = [];
    if (currentStriker) {
        const p = bePlayers.find(x => x.playerID === currentStriker);
        if (p) opts.push(`<option value="${p.playerID}">${p.playerName} (striker)</option>`);
    }
    if (currentNonStriker) {
        const p = bePlayers.find(x => x.playerID === currentNonStriker);
        if (p) opts.push(`<option value="${p.playerID}">${p.playerName} (non-striker)</option>`);
    }
    return opts.join('');
}

// ── Context Modal (Striker, Non-Striker, Bowler) ──
let wicketAtEndOver = false;
let currentBattingTeam = null;
let pendingNewBatter = false;

function getMatchTeams() {
    const teams = new Set();
    bePlayers.forEach(p => { if(p.teamName) teams.add(p.teamName); });
    return Array.from(teams);
}

function bowlerLegalBalls(playerID) {
    const info = beBowlerOvers[playerID];
    return info ? info.legalBalls : 0;
}

function filterContextPlayers(mode) {
    // Prefer server-synced sides; never guess batting team from arbitrary XI order.
    if (!currentBattingTeam && beInningsTeams[String(beInnings)]) {
        currentBattingTeam = beInningsTeams[String(beInnings)].battingTeam;
    }
    if (!currentBowlingTeam && beInningsTeams[String(beInnings)]) {
        currentBowlingTeam = beInningsTeams[String(beInnings)].bowlingTeam;
    }
    const teams = getMatchTeams();
    if (!currentBattingTeam && teams.length > 0) currentBattingTeam = teams[0];
    const bowlingTeam = currentBowlingTeam || teams.find(t => t !== currentBattingTeam) || teams[0];

    // Prefer ready-made option lists from /api/balls/state when available
    const batSource = (beBattingOptions.length
        ? beBattingOptions
        : bePlayers.filter(p => p.teamName === currentBattingTeam)
    );
    const bowlSource = (beBowlingOptions.length
        ? beBowlingOptions
        : bePlayers.filter(p => p.teamName === bowlingTeam && p.canBowl)
    );

    const batOpts = batSource.map(p => {
        const dismissed = beDismissedIDs.includes(p.playerID) || p.reason === 'out';
        const label = p.playerName + (dismissed ? ' (out)' : '');
        return dismissed
            ? `<option value="${p.playerID}" disabled style="text-decoration:line-through; color:#64748b;">${label}</option>`
            : `<option value="${p.playerID}">${label}</option>`;
    }).join('');

    const atCreaseNotOut = new Set();
    if (currentStriker && !beDismissedIDs.includes(currentStriker)) atCreaseNotOut.add(currentStriker);
    if (currentNonStriker && !beDismissedIDs.includes(currentNonStriker)) atCreaseNotOut.add(currentNonStriker);
    const newBatterOpts = batSource.map(p => {
        const dismissed = beDismissedIDs.includes(p.playerID) || p.reason === 'out';
        const isPlaying = atCreaseNotOut.has(p.playerID);
        if (dismissed) {
            return `<option value="${p.playerID}" disabled style="text-decoration:line-through; color:#64748b;">${p.playerName} (out)</option>`;
        }
        if (isPlaying) {
            return `<option value="${p.playerID}" disabled style="color:#64748b;">${p.playerName} (playing)</option>`;
        }
        return `<option value="${p.playerID}">${p.playerName}</option>`;
    }).join('');

    const quotaTxt = beMaxOversPerBowler != null ? `/${beMaxOversPerBowler}` : '';
    const bowlOpts = bowlSource.map(p => {
        const legal = bowlerLegalBalls(p.playerID);
        const ovBowled = p.oversBowled != null ? p.oversBowled : Math.floor(legal / 6);
        const balls = p.ballsThisOver != null ? p.ballsThisOver : (legal % 6);
        const oversTxt = `${ovBowled}.${balls}`;

        let disabled = !!p.disabled;
        let reason = '';
        if (p.reason === 'overs-complete') reason = ' (quota full)';
        else if (p.reason === 'bowled-last-over') reason = ' (bowled last over)';
        else if ((mode === 'new_over' || mode === 'end_over') && beLastOverBowlerID && p.playerID === beLastOverBowlerID) {
            disabled = true; reason = ' (bowled last over)';
        } else if (beMaxOversPerBowler != null && ovBowled >= beMaxOversPerBowler) {
            disabled = true; reason = ' (quota full)';
        }
        // selectable from API wins when present
        if (p.selectable === false) disabled = true;

        const label = `${p.playerName}  ${oversTxt}${quotaTxt} ov${reason}`;
        return disabled
            ? `<option value="${p.playerID}" disabled style="text-decoration:line-through; color:#64748b;">${label}</option>`
            : `<option value="${p.playerID}">${label}</option>`;
    }).join('');

    document.getElementById('ctx-striker').innerHTML = (mode === 'wicket' ? newBatterOpts : batOpts) || `<option value="">No batters available</option>`;
    document.getElementById('ctx-nonstriker').innerHTML = batOpts || `<option value="">No batters found</option>`;
    document.getElementById('ctx-bowler').innerHTML = bowlOpts || `<option value="">No eligible bowlers</option>`;
}

function openContextModal(mode, isEndOver = false) {
    contextMode = mode;
    wicketAtEndOver = isEndOver;
    const modal = document.getElementById('contextModal');
    const title = document.getElementById('contextModalTitle');
    const strikerDiv = document.getElementById('contextStrikerContainer');
    const nonStrikerDiv = document.getElementById('contextNonStrikerContainer');
    const bowlerDiv = document.getElementById('contextBowlerContainer');

    if (mode === 'innings_start') {
        title.innerHTML = '🏏 Innings Start — Select Openers & Bowler';
        strikerDiv.style.display = 'block';
        nonStrikerDiv.style.display = 'block';
        bowlerDiv.style.display = 'block';
    } else {
        if (mode === 'new_over' || mode === 'end_over') {
            title.innerHTML = '🔄 Over Complete — Select New Bowler';
            strikerDiv.style.display = 'none';
            nonStrikerDiv.style.display = 'none';
            bowlerDiv.style.display = 'block';
        } else if (mode === 'wicket') {
            title.innerHTML = '💥 Select New Batsman';
            strikerDiv.style.display = 'block';
            nonStrikerDiv.style.display = 'none';
            bowlerDiv.style.display = 'none';
        } else if (mode === 'manual_swap') {
            title.innerHTML = '🔄 Adjust Context';
            strikerDiv.style.display = 'block';
            nonStrikerDiv.style.display = 'block';
            bowlerDiv.style.display = 'block';
        }
    }

    filterContextPlayers(mode);

    if (mode !== 'wicket' && currentStriker) document.getElementById('ctx-striker').value = currentStriker;
    if (currentNonStriker) document.getElementById('ctx-nonstriker').value = currentNonStriker;
    if (currentBowler && mode !== 'new_over' && mode !== 'end_over') document.getElementById('ctx-bowler').value = currentBowler;

    modal.style.display = 'flex';
}

function cancelContextModal() {
    document.getElementById('contextModal').style.display = 'none';
    if (contextMode === 'wicket' && pendingNewBatter) {
        currentStriker = null;
        persistContext();
        showToast('New batter must be selected before recording more balls.', 'error');
    }
}

function confirmContext() {
    const s = document.getElementById('ctx-striker').value;
    const ns = document.getElementById('ctx-nonstriker').value;
    const b = document.getElementById('ctx-bowler').value;

    if (contextMode === 'innings_start' || contextMode === 'manual_swap') {
        if (s === ns) { showToast('Striker and Non-Striker cannot be the same', 'error'); return; }
        currentStriker = s;
        currentNonStriker = ns;
        currentBowler = b;
    } else if (contextMode === 'new_over' || contextMode === 'end_over') {
        currentBowler = b;
    } else if (contextMode === 'wicket') {
        if (s === currentNonStriker) { showToast('Batsman is already on the non-striker end', 'error'); return; }
        if (wicketAtEndOver) {
            currentNonStriker = s;
        } else {
            currentStriker = s;
        }
        pendingNewBatter = false;
    }

    document.getElementById('contextModal').style.display = 'none';
    lsRefreshStats();
    persistContext();

    if (contextMode === 'wicket' && wicketAtEndOver) {
        wicketAtEndOver = false;
        openContextModal('new_over');
    }
}

// Persist the live crease context so it auto-restores on the next page load
async function persistContext() {
    if (!beMatchId) return;
    try {
        await authFetch(`${API}/api/balls/state/${beMatchId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                inningsNumber: beInnings,
                strikerID:     currentStriker,
                nonStrikerID:  currentNonStriker,
                bowlerID:      currentBowler,
            })
        });
    } catch {}
}

function manualSwapStriker() {
    let temp = currentStriker;
    currentStriker = currentNonStriker;
    currentNonStriker = temp;
    lsRefreshStats();
    persistContext();
}

function updateScoreboardStrip(runs, wickets, over, ball) {
    const scoreEl  = document.getElementById('ls-score');
    const overEl   = document.getElementById('ls-overs');
    const crrEl    = document.getElementById('ls-crr');
    if (scoreEl) scoreEl.textContent = `${runs}/${wickets}`;
    if (overEl) {
        overEl.textContent = `(${over - 1}.${ball - 1})`;
        if (crrEl) {
            let totalBalls = (over - 1) * 6 + (ball - 1);
            let crr = totalBalls > 0 ? (runs / totalBalls) * 6 : 0;
            crrEl.textContent = crr.toFixed(2);
        }
    }
    updateWinProbability();
}

async function lsRefreshStats() {
    if (!beMatchId) return;
    try {
        const res = await authFetch(`${API}/api/stats/scorecard/${beMatchId}?_t=${Date.now()}`);
        if (!res.ok) return;
        const data = await res.json();
        
        let batList, bowlList;
        if (beInnings <= 2) {
            batList = beInnings === 1 ? data.innings1Bat : data.innings2Bat;
            bowlList = beInnings === 1 ? data.innings1Bowl : data.innings2Bowl;
        } else {
            batList = beInnings === 3 ? data.innings3Bat : data.innings4Bat;
            bowlList = beInnings === 3 ? data.innings3Bowl : data.innings4Bowl;
        }

        const pStriker = batList.find(b => b.batsmanID == currentStriker);
        const pNonStriker = batList.find(b => b.batsmanID == currentNonStriker);
        const pBowler = bowlList.find(b => b.bowlerID == currentBowler);

        const sName = bePlayers.find(p => p.playerID == currentStriker)?.playerName || '—';
        const nsName = bePlayers.find(p => p.playerID == currentNonStriker)?.playerName || '—';
        const bName = bePlayers.find(p => p.playerID == currentBowler)?.playerName || '—';

        document.getElementById('ls-striker-name').textContent = sName;
        document.getElementById('ls-striker-runs').textContent = pStriker ? pStriker.runs : 0;
        document.getElementById('ls-striker-balls').textContent = `(${pStriker ? pStriker.balls : 0})`;

        document.getElementById('ls-nonstriker-name').textContent = nsName;
        document.getElementById('ls-nonstriker-runs').textContent = pNonStriker ? pNonStriker.runs : 0;
        document.getElementById('ls-nonstriker-balls').textContent = `(${pNonStriker ? pNonStriker.balls : 0})`;

        document.getElementById('ls-bowler-name').textContent = bName;
        if (pBowler) {
            const oversFull = Math.floor(pBowler.ballsBowled / 6);
            const extraBalls = pBowler.ballsBowled % 6;
            document.getElementById('ls-bowler-o').textContent = `${oversFull}.${extraBalls}`;
            document.getElementById('ls-bowler-m').textContent = pBowler.maidens || 0;
            document.getElementById('ls-bowler-r').textContent = pBowler.runsConceded || 0;
            document.getElementById('ls-bowler-w').textContent = pBowler.wicketsTaken || 0;
        } else {
            document.getElementById('ls-bowler-o').textContent = '0.0';
            document.getElementById('ls-bowler-m').textContent = '0';
            document.getElementById('ls-bowler-r').textContent = '0';
            document.getElementById('ls-bowler-w').textContent = '0';
        }

        // Render broadcast-style batting scorecard below numpad
        const allBat = batList;

        // Determine correct batting XI by matching batted IDs (same logic as main scorecard)
        const batIds = new Set((allBat || []).map(b => String(b.batsmanID)));
        const xi1 = data.team1XI || [];
        const xi2 = data.team2XI || [];
        const xc1 = xi1.filter(p => batIds.has(String(p.playerID))).length;
        const xc2 = xi2.filter(p => batIds.has(String(p.playerID))).length;
        const allXI = (xc1 === 0 && xc2 === 0) ? [] : (xc1 >= xc2 ? xi1 : xi2);

        const activeIds = new Set([String(currentStriker), String(currentNonStriker)]);
        const excludeFromPick = currentNonStriker ? new Set([String(currentNonStriker)]) : null;
        renderBatTable('ls-bat-body', allBat, allXI, {
            activeIds,
            pendingWicket: pendingNewBatter,
            excludeFromPick
        });

        // Render bowling card
        const allBowl = bowlList;
        renderBowlTable('ls-bowl-body', allBowl);

        // Update title based on active tab
        const activeTab = document.getElementById('ls-sc-tab-bat')?.classList.contains('active') ? 'bat' : 'bowl';
        const innLabel = beInnings <= 2 ? (beInnings === 1 ? '1st' : '2nd') : `Super Over ${beInnings - 2}`;
        const titleEl = document.getElementById('ls-scorecard-title');
        if (titleEl) titleEl.textContent = activeTab === 'bat' ? `🏏 ${innLabel} Innings — Batting` : `🎯 ${innLabel} Innings — Bowling`;
    } catch(e) {}
}

function lsSwitchScorecardTab(tab) {
    const batPanel  = document.getElementById('ls-sc-bat-panel');
    const bowlPanel = document.getElementById('ls-sc-bowl-panel');
    const batBtn    = document.getElementById('ls-sc-tab-bat');
    const bowlBtn   = document.getElementById('ls-sc-tab-bowl');
    if (batPanel)  batPanel.style.display  = tab === 'bat' ? 'block' : 'none';
    if (bowlPanel) bowlPanel.style.display = tab === 'bowl' ? 'block' : 'none';
    if (batBtn)    batBtn.classList.toggle('active', tab === 'bat');
    if (bowlBtn)   bowlBtn.classList.toggle('active', tab === 'bowl');

    const innLabel = beInnings <= 2 ? (beInnings === 1 ? '1st' : '2nd') : `Super Over ${beInnings - 2}`;
    const titleEl = document.getElementById('ls-scorecard-title');
    if (titleEl) titleEl.textContent = tab === 'bat' ? `🏏 ${innLabel} Innings — Batting` : `🎯 ${innLabel} Innings — Bowling`;
}

function lsPickNewBatter(playerID) {
    if (!playerID || !pendingNewBatter) return;
    currentStriker = parseInt(playerID);
    pendingNewBatter = false;
    persistContext();
    const name = bePlayers.find(p => p.playerID == currentStriker)?.playerName || '—';
    showToast(`🏏 ${name} is the new batter`, 'success');
    lsRefreshStats();
}

async function updateTimeline() {
    if(!beMatchId) return;
    try {
        const res = await authFetch(`${API}/api/balls/${beMatchId}?innings=${beInnings}`);
        const balls = await res.json();

        const timeline = document.getElementById('ls-this-over-bubbles');
        if(!timeline) return;

        // Show only the balls bowled so far in the current over, as a row of
        // 6 fixed circular indicators (filled in sequence, rest left empty).
        const overBalls = balls.filter(b => b.overNumber === lsCurrentOver);

        let html = '';
        for (let i = 0; i < 6; i++) {
            const b = overBalls[i];
            if (!b) {
                html += `<div class="be-over-dot be-over-empty"></div>`;
                continue;
            }
            let cls = 'be-over-dot', label = '0';
            if (b.wicketFallen) {
                cls += ' wicket'; label = 'W';
            } else if (b.extraType === 'Wide') {
                cls += ' wide';
                const total = (b.runsScored || 0) + (b.extras || 0);
                label = total + 'WD';
            } else if (b.extraType === 'NoBall') {
                cls += ' noball';
                const total = (b.runsScored || 0) + (b.extras || 0);
                label = total + 'NB';
            } else if (b.extraType === 'Bye') {
                cls += ' extra'; label = (b.extras || 0) + 'BY';
            } else if (b.extraType === 'LegBye') {
                cls += ' extra'; label = (b.extras || 0) + 'LB';
            } else if (b.extraType === 'Penalty') {
                cls += ' extra'; label = '5PEN';
            } else if (b.runsScored === 6) {
                cls += ' six'; label = '6';
            } else if (b.runsScored === 4) {
                cls += ' four'; label = '4';
            } else if (b.runsScored > 0) {
                cls += ' run'; label = String(b.runsScored);
            }
            const onClickAttr = getUser()?.isAdmin ? ` onclick="confirmDeleteBall(${b.ballID})"` : '';
            html += `<div class="${cls}" title="Over ${b.overNumber}.${b.ballNumber}"${onClickAttr}>${label}</div>`;
        }
        timeline.innerHTML = html;
    } catch {}
}

// ── Numpad Actions ──

function lsRecordRun(runs) {
    if (pendingNewBatter) { openContextModal('wicket'); return; }
    beRuns = runs;
    beDelType = 'Normal';
    lsExtraType = null;
    lsExtraRuns = 0;
    lsSubmitBall(false);
}

function lsOpenExtraModal(type) {
    if (pendingNewBatter) { openContextModal('wicket'); return; }
    if (type === 'Penalty') {
        lsExtraType = 'Penalty';
        lsExtraRuns = 5;
        beRuns = 0;
        beDelType = 'Penalty';
        lsSubmitBall(false);
        return;
    }
    
    lsExtraType = type;
    document.getElementById('lsExtraTitle').textContent = type === 'Wide' ? 'Wide Ball' : type === 'NoBall' ? 'No Ball' : type === 'Bye' ? 'Byes' : 'Leg Byes';
    
    // reset extra runs selection
    document.querySelectorAll('#ls-extra-btns .run-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('#ls-extra-btns .run-btn[data-runs="0"]').classList.add('active');
    lsExtraRuns = 0;
    
    document.getElementById('lsExtraModal').style.display = 'flex';
}

function lsSetExtraRuns(runs, btn) {
    document.querySelectorAll('#ls-extra-btns .run-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    lsExtraRuns = runs;
}

function lsConfirmExtra() {
    document.getElementById('lsExtraModal').style.display = 'none';
    beRuns = 0;
    beDelType = (lsExtraType === 'Wide' || lsExtraType === 'NoBall') ? lsExtraType : 'Normal';
    lsSubmitBall(false);
}

function lsOpenWicketModal() {
    const teams = getMatchTeams();
    let bowlingTeam = null;
    if (currentBattingTeam) {
        bowlingTeam = teams.find(t => t !== currentBattingTeam);
    }
    
    // Find the designated wicket keeper for the bowling team
    const fieldPool = bowlingTeam ? bePlayers.filter(p => p.teamName === bowlingTeam) : bePlayers;
    const wkID = bowlingTeam ? fieldPool.find(p => p.playerRole === 'WicketKeeper')?.playerID : null;

    let fieldOpts = '<option value="">— Select Fielder —</option>';
    fieldOpts += fieldPool.map(p => {
        const isWK = String(p.playerID) === String(wkID);
        return `<option value="${p.playerID}"${isWK ? ' data-wk="1"' : ''}>${p.playerName}${isWK ? ' (WK)' : ''}</option>`;
    }).join('');

    const fielderSelect = document.getElementById('ls-wicket-fielder');
    if (fielderSelect) fielderSelect.innerHTML = fieldOpts;

    const strikerPlayer = bePlayers.find(p => p.playerID === currentStriker);
    const nonStrikerPlayer = bePlayers.find(p => p.playerID === currentNonStriker);
    let whoOpts = '';
    if (strikerPlayer) whoOpts += `<option value="${strikerPlayer.playerID}">${strikerPlayer.playerName} (Striker)</option>`;
    if (nonStrikerPlayer) whoOpts += `<option value="${nonStrikerPlayer.playerID}">${nonStrikerPlayer.playerName} (Non-Striker)</option>`;
    const whoSelect = document.getElementById('ls-wicket-who');
    if (whoSelect) {
        whoSelect.innerHTML = whoOpts || '<option value="">No batters on crease</option>';
        whoSelect.value = currentStriker;
    }

    document.getElementById('lsWicketModal').style.display = 'flex';
    lsOnWicketTypeChange();
}

function lsOnWicketTypeChange() {
    const type = document.getElementById('ls-wicket-type').value;
    const needF = ['Caught','RunOut','Stumped'].includes(type);
    document.getElementById('ls-wicket-fielder-box').style.display = needF ? 'block' : 'none';

    // For Stumped, auto-select the wicket keeper
    if (type === 'Stumped') {
        const fielderSelect = document.getElementById('ls-wicket-fielder');
        if (fielderSelect) {
            const wkOption = fielderSelect.querySelector('option[data-wk]');
            if (wkOption) fielderSelect.value = wkOption.value;
        }
    }
}

function lsConfirmWicket() {
    document.getElementById('lsWicketModal').style.display = 'none';
    beRuns = 0;
    beDelType = 'Normal';
    lsExtraType = null;
    lsExtraRuns = 0;
    lsSubmitBall(true);
}

// ── Submit Logic ──
async function lsSubmitBall(isWicket) {
    if (!beMatchId) return;
    if (!currentStriker) { showToast('Please select a batsman.', 'error'); return; }
    if (!currentBowler)  { showToast('Please select a bowler.',  'error'); return; }

    let totalExtras = lsExtraRuns;
    if (beDelType === 'Wide' || beDelType === 'NoBall') {
        totalExtras += 1;
    }

    const dismissal = isWicket ? document.getElementById('ls-wicket-type').value : null;
    const dismissed = isWicket ? document.getElementById('ls-wicket-who').value : null;
    const fielder   = isWicket ? document.getElementById('ls-wicket-fielder').value : null;

    const body = {
        matchID:           beMatchId,
        inningsNumber:     beInnings,
        overNumber:        lsCurrentOver,
        ballNumber:        lsCurrentBall,
        batsmanID:         currentStriker,
        nonStrikerID:      currentNonStriker,
        bowlerID:          currentBowler,
        runsScored:        beRuns,
        extras:            totalExtras,
        extraType:         lsExtraType || (beDelType === 'Wide' ? 'Wide' : beDelType === 'NoBall' ? 'NoBall' : null),
        wicketFallen:      isWicket ? 1 : 0,
        dismissedPlayerID: dismissed,
        wicketType:        dismissal,
        fielderID:         fielder,
    };

    try {
        // Immediate local update for wicket: add dismissed player to tracking
        // so the context modal has correct data even before state fetch returns
        if (isWicket) {
            const dismissedPlayer = document.getElementById('ls-wicket-who')?.value 
                || document.getElementById('be-dismissed')?.value;
            if (dismissedPlayer && !beDismissedIDs.includes(dismissedPlayer)) {
                beDismissedIDs.push(dismissedPlayer);
            }
        }

        const res = await authFetch(`${API}/api/balls`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) { showToast(data.error || 'Failed to record ball.', 'error'); return; }

        if (isWicket) playCrowdSound('wicket');
        else if (beRuns === 4 || beRuns === 6) playCrowdSound('boundary');

        // Advance ball counter
        let nextBall = lsCurrentBall + 1;
        let nextOver = lsCurrentOver;
        let overEnded = false;
        
        if (beDelType !== 'Wide' && beDelType !== 'NoBall' && beDelType !== 'Penalty') {
            if (nextBall > 6) { nextOver++; nextBall = 1; overEnded = true; }
        } else {
            // It was a wide, noball, or penalty, so ball number stays the same
            nextBall = lsCurrentBall;
        }

        // Fetch state to be completely accurate
        const stateRes = await authFetch(`${API}/api/balls/state/${beMatchId}?innings=${beInnings}`);
        const stateData = await stateRes.json();

        // Keep selection lists / team sides in sync with the server after every ball
        beBattingOptions = stateData.battingOptions || beBattingOptions;
        beBowlingOptions = stateData.bowlingOptions || beBowlingOptions;
        beInningsTeams = stateData.inningsTeams || beInningsTeams;
        if (stateData.battingTeam) currentBattingTeam = stateData.battingTeam;
        if (stateData.bowlingTeam) currentBowlingTeam = stateData.bowlingTeam;
        
        lsCurrentOver = stateData.nextOver;
        lsCurrentBall = stateData.nextBall;
        beLastOverBowlerID = stateData.lastOverBowlerID || null;
        beBowlerOvers = stateData.bowlerOvers || {};
        // Merge server dismissed list with any locally tracked dismissals
        // (e.g., the wicket we just submitted before server state refresh)
        const serverDismissed = stateData.dismissedPlayerIDs || [];
        beDismissedIDs = [...new Set([...serverDismissed, ...beDismissedIDs])];
        updateScoreboardStrip(stateData.totalRuns, stateData.wickets, lsCurrentOver, lsCurrentBall);

        overEnded = (lsCurrentOver > nextOver || (beDelType !== 'Wide' && beDelType !== 'NoBall' && beDelType !== 'Penalty' && lsCurrentBall === 1));

        // Swap logic
        let runsToConsider = beRuns;
        if (lsExtraType === 'Bye' || lsExtraType === 'LegBye' || lsExtraType === 'Wide' || lsExtraType === 'NoBall') {
            runsToConsider += lsExtraRuns;
        }
        if (runsToConsider % 2 !== 0) {
            manualSwapStriker();
        }
        if (overEnded) {
            manualSwapStriker();
        }

        // ── ICC innings/target/result evaluation (from the server) ──
        beProgress = stateData.progress || data.progress || null;
        renderProgressBanner(beProgress);
        if (beProgress && beProgress.inningsComplete) {
            // Innings (or match) is over — skip the normal new-over / new-batter
            // prompts and drive the innings-break / result / super-over flow.
            updateTimeline();
            loadLiveBallLog();
            if (document.getElementById('ball-log-body') && beMatchId) loadBallLog(beMatchId, beInnings);
            if (window.DataSync) DataSync.ballRecorded(beMatchId, beInnings);
            handleInningsEnd(beProgress);
            return;
        }

        if (isWicket) {
            pendingNewBatter = true;
            openContextModal('wicket', overEnded);
        } else if (overEnded) {
            openContextModal('new_over');
        } else {
            lsRefreshStats();
        }

        updateTimeline();
        loadLiveBallLog();

        // Auto-refresh scorecard ball log if visible
        if (document.getElementById('ball-log-body') && beMatchId) {
            loadBallLog(beMatchId, beInnings);
        }

        // Broadcast data change to other pages
        if (window.DataSync) DataSync.ballRecorded(beMatchId, beInnings);

    } catch {
        showToast('Server error.', 'error');
    }
}

// ── Ball Log ────────────────────────────────────────────
let beBallLog = [];

async function loadLiveBallLog() {
    if (!beMatchId) return;
    try {
        const res = await authFetch(`${API}/api/balls/${beMatchId}?innings=${beInnings}`);
        const balls = await res.json();
        renderLiveBallLog(Array.isArray(balls) ? balls : []);
    } catch {
        const el = document.getElementById('ls-ball-log-body');
        if (el) el.innerHTML = '<tr><td colspan="5" class="empty-state">Could not load balls.</td></tr>';
    }
}

function renderLiveBallLog(balls) {
    const viz = document.getElementById('ls-ball-over-viz');
    const tb = document.getElementById('ls-ball-log-body');
    if (viz) {
        const overs = {};
        balls.forEach(b => {
            if (!overs[b.overNumber]) overs[b.overNumber] = [];
            overs[b.overNumber].push(b);
        });
        const keys = Object.keys(overs).sort((a, b) => Number(a) - Number(b));
        viz.innerHTML = keys.map(overNum => {
            const chips = overs[overNum].map(b => ballChipHtml(b)).join('');
            return `<div class="over-group"><div class="over-group-label">Ov ${overNum}</div><div class="over-balls">${chips}</div></div>`;
        }).join('') || '<p class="ball-log-empty">No balls yet — use the keypad to start.</p>';
    }
    if (!tb) return;
    if (!balls.length) {
        tb.innerHTML = '<tr><td colspan="5" class="empty-state">Waiting for first ball…</td></tr>';
        return;
    }
    tb.innerHTML = [...balls].reverse().slice(0, 12).map(b => {
        const runs = b.wicketFallen ? 'W' : (b.extraType ? ((b.runsScored || 0) + (b.extras || 0)) + shortExtra(b.extraType) : b.runsScored);
        return `<tr>
            <td class="bl-over">${b.overNumber}.${b.ballNumber}</td>
            <td>${b.batsmanName || '—'}</td>
            <td class="bl-muted">${b.bowlerName || '—'}</td>
            <td class="bl-runs">${runs}</td>
            <td class="bl-muted">${b.wicketFallen ? (b.wicketType || 'Wicket') : (b.extraType || '—')}</td>
        </tr>`;
    }).join('');
}

function shortExtra(t) {
    return ({ Wide: 'wd', NoBall: 'nb', Bye: 'b', LegBye: 'lb', Penalty: 'pen' })[t] || '';
}

function ballChipHtml(b) {
    let cls = 'dot', label = '·';
    if (b.wicketFallen) { cls = 'wicket'; label = 'W'; }
    else if (b.runsScored === 6) { cls = 'six'; label = '6'; }
    else if (b.runsScored === 4) { cls = 'four'; label = '4'; }
    else if (b.extraType === 'Wide') {
        cls = 'wide';
        label = ((b.runsScored || 0) + (b.extras || 0)) + 'wd';
    } else if (b.extraType === 'NoBall') {
        cls = 'noball';
        label = ((b.runsScored || 0) + (b.extras || 0)) + 'nb';
    } else if (b.extraType === 'Bye') { cls = 'extra'; label = (b.extras || 0) + 'b'; }
    else if (b.extraType === 'LegBye') { cls = 'extra'; label = (b.extras || 0) + 'lb'; }
    else if (b.extraType === 'Penalty') { cls = 'extra'; label = '5p'; }
    else if (b.runsScored > 0) { cls = 'run'; label = String(b.runsScored); }
    return `<div class="ball-chip ${cls}" title="Over ${b.overNumber}.${b.ballNumber}">${label}</div>`;
}

async function loadBallLog(matchId, innings = 1) {
    try {
        const res   = await authFetch(`${API}/api/balls/${matchId}?innings=${innings}`);
        beBallLog = await res.json();
        renderBallLogViz(beBallLog);
        renderBallLogTable(beBallLog);
    } catch {
        document.getElementById('ball-log-body').innerHTML =
            '<tr><td colspan="8" class="empty-state">Could not load ball log.</td></tr>';
    }
}

function filterBallLog(inn) {
    document.getElementById('log-inn-1')?.classList.toggle('active', inn === 1);
    document.getElementById('log-inn-2')?.classList.toggle('active', inn === 2);
    document.getElementById('log-inn-3')?.classList.toggle('active', inn === 3);
    document.getElementById('log-inn-4')?.classList.toggle('active', inn === 4);
    if (beMatchId) loadBallLog(beMatchId, inn);
}

function renderBallLogViz(balls) {
    const viz = document.getElementById('ball-over-viz');
    if (!viz) return;

    // Group by over
    const overs = {};
    balls.forEach(b => {
        if (!overs[b.overNumber]) overs[b.overNumber] = [];
        overs[b.overNumber].push(b);
    });

    const keys = Object.keys(overs).sort((a, b) => Number(a) - Number(b));
    viz.innerHTML = keys.map(overNum => {
        const chips = overs[overNum].map(b => ballChipHtml(b)).join('');
        return `<div class="over-group"><div class="over-group-label">Over ${overNum}</div><div class="over-balls">${chips}</div></div>`;
    }).join('') || '<p class="ball-log-empty">No balls recorded yet.</p>';
}

function renderBallLogTable(balls) {
    const tb = document.getElementById('ball-log-body');
    if (!balls.length) {
        const msg = getUser()?.isAdmin 
            ? "No balls recorded yet. Use 🏏 Enter Ball to start scoring." 
            : "No balls recorded yet.";
        tb.innerHTML = `<tr><td colspan="8" class="empty-state">${msg}</td></tr>`;
        return;
    }
    tb.innerHTML = [...balls].reverse().map(b => {
        const delBadge = b.extraType === 'Wide'
            ? `<span class="badge" style="background:rgba(59,130,246,0.25); color:#93c5fd;">WIDE</span>`
            : b.extraType === 'NoBall'
            ? `<span class="badge" style="background:rgba(168,85,247,0.25); color:#e9d5ff;">NO BALL</span>`
            : b.extraType === 'Bye'
            ? `<span class="badge" style="background:rgba(34,197,94,0.25); color:#86efac;">BYE</span>`
            : b.extraType === 'LegBye'
            ? `<span class="badge" style="background:rgba(234,179,8,0.25); color:#fde047;">LEG BYE</span>`
            : b.extraType === 'Penalty'
            ? `<span class="badge" style="background:rgba(239,68,68,0.25); color:#fca5a5;">PENALTY</span>`
            : `<span class="badge badge-t20">Legal</span>`;

        const extraText = b.extraType === 'Wide'
            ? ((b.runsScored || 0) + (b.extras || 0)) + 'WD'
            : b.extraType === 'NoBall'
            ? ((b.runsScored || 0) + (b.extras || 0)) + 'NB'
            : b.extraType === 'Bye'
            ? (b.extras || 0) + 'BY'
            : b.extraType === 'LegBye'
            ? (b.extras || 0) + 'LB'
            : b.extraType === 'Penalty'
            ? '5PEN'
            : (b.extras || 0);

        const runsBadge = b.runsScored === 6
            ? `<strong style="color:var(--red-ball-light);">6 💥</strong>`
            : b.runsScored === 4
            ? `<strong style="color:var(--gold);">4 ⚡</strong>`
            : `<strong>${b.runsScored}</strong>`;

        const wicket = b.wicketFallen
            ? `<span style="color:var(--red-ball-light); font-weight:700;">✖ ${b.wicketType} (${b.dismissedName || '?'})</span>`
            : `<span style="color:var(--text-muted);">—</span>`;

        return `<tr>
            <td style="font-family:'Orbitron',sans-serif; font-size:0.78rem; color:var(--gold);">${b.overNumber}.${b.ballNumber}</td>
            <td><strong>${b.batsmanName}</strong></td>
            <td style="color:var(--text-muted); font-size:0.82rem;">${b.bowlerName}</td>
            <td>${delBadge}</td>
            <td>${runsBadge}</td>
            <td style="color:var(--text-muted);">${extraText}</td>
            <td>${wicket}</td>
            <td>
                ${getUser()?.isAdmin ? `
                <button class="btn-view" style="font-size:0.75rem; padding:0.3rem 0.6rem; margin-right:0.3rem;" onclick="editBall(${b.ballID})">✏️</button>
                <button class="btn-delete" style="font-size:0.75rem; padding:0.3rem 0.6rem;" onclick="confirmDeleteBall(${b.ballID})">↩</button>
                ` : '<span style="color:var(--text-muted);">—</span>'}
            </td>
        </tr>`;
    }).join('');
}

function editBall(ballId) {
    const ball = beBallLog.find(b => b.ballID === ballId);
    if (!ball) return;
    
    // Switch to scorecard view first if needed, open ball entry modal
    openBallEntry().then(() => {
        beEditingBallId = ballId;
        
        document.getElementById('be-over').value = ball.overNumber;
        document.getElementById('be-ball').value = ball.ballNumber;
        document.getElementById('be-batsman').value = ball.batsmanID;
        document.getElementById('be-bowler').value = ball.bowlerID;
        
        if (ball.extraType === 'Wide') {
            document.querySelector('.del-type-btn[data-type="Wide"]').click();
        } else if (ball.extraType === 'NoBall') {
            document.querySelector('.del-type-btn[data-type="NoBall"]').click();
        } else {
            document.querySelector('.del-type-btn[data-type="Normal"]').click();
        }
        
        const actRuns = ball.runsScored;
        document.querySelector(`.run-btn[data-runs="${actRuns}"]`)?.click();
        
        const extType = ball.extraType;
        if (extType && !['Wide', 'NoBall'].includes(extType)) {
            document.getElementById('be-extra-type').value = extType;
        } else {
            document.getElementById('be-extra-type').value = '';
        }
        
        let extraRunsToShow = ball.extras;
        if (['Wide', 'NoBall'].includes(extType)) extraRunsToShow = Math.max(0, ball.extras - 1);
        document.getElementById('be-extras').value = extraRunsToShow;
        
        if (ball.wicketFallen) {
            document.getElementById('be-wicket').checked = true;
            onWicketToggle();
            document.getElementById('be-dismissal').value = ball.wicketType || '';
            document.getElementById('be-dismissed').value = ball.dismissedPlayerID || ball.batsmanID;
            onDismissalChange();
        }
        
        updatePreview();
    });
}

async function confirmDeleteBall(ballId) {
    if (!await customConfirm('Delete this ball? Match scores will be recalculated.')) return;
    try {
        const res  = await authFetch(`${API}/api/balls/${ballId}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) { showToast(data.error || 'Delete failed.', 'error'); return; }
        showToast('Ball deleted and scores updated.');
        loadBallLog(beMatchId, beInnings);
        // Also refresh scorecard
        viewScorecard(beMatchId);
    } catch {
        showToast('Server error.', 'error');
    }
}

function playCrowdSound(type) {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        
        // Crowd noise
        const bufferSize = ctx.sampleRate * (type === 'wicket' ? 1.5 : 2.5); 
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1; 
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = type === 'wicket' ? 600 : 800; // slightly different tone
        
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.2);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + (type === 'wicket' ? 1.5 : 2.5));
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        
        noise.start();
        
        // Add a beep for wicket
        if (type === 'wicket') {
            const osc = ctx.createOscillator();
            const oscGain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(300, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.5);
            oscGain.gain.setValueAtTime(0.3, ctx.currentTime);
            oscGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
            osc.connect(oscGain);
            oscGain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.5);
        }
    } catch (e) {
        // ignore audio errors
    }
}


// ─── Custom Confirm Modal ───
function customConfirm(msg) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'custom-confirm-overlay';
        overlay.innerHTML = `
            <div class="custom-confirm-card">
                <p>${msg}</p>
                <div class="custom-confirm-actions">
                    <button class="btn-cancel" id="cc-cancel">Cancel</button>
                    <button class="btn-submit flame-effect" id="cc-confirm">Confirm</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('#cc-cancel').onclick = () => {
            document.body.removeChild(overlay);
            resolve(false);
        };
        overlay.querySelector('#cc-confirm').onclick = () => {
            document.body.removeChild(overlay);
            resolve(true);
        };
    });
}


// ── Live scoring keyboard shortcuts ──────────────────────────
// Active only while the live scoring view is visible and the user
// is not typing in an input/select/textarea.
//   0-6 : record runs        W : wicket        U : undo last ball
//   D   : dot ball (0)       . : dot ball (0)  N : no ball
//   B   : bye                L : leg bye       V : wide (V=wide)
document.addEventListener('keydown', function lsKeyHandler_lskeyboardshortcuts(e) {
    const view = document.getElementById('live-scoring-view');
    if (!view || view.style.display === 'none') return;
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
    // Ignore when any modal is open
    const modalOpen = ['lsExtraModal', 'lsWicketModal', 'contextModal', 'lsRetireModal']
        .some(id => { const el = document.getElementById(id); return el && el.style.display && el.style.display !== 'none'; });
    if (modalOpen) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const k = e.key.toLowerCase();
    if (k >= '0' && k <= '6') {
        e.preventDefault();
        lsRecordRun(parseInt(k, 10));
    } else if (k === 'd' || k === '.') {
        e.preventDefault();
        lsRecordRun(0);
    } else if (k === 'w') {
        e.preventDefault();
        lsOpenWicketModal();
    } else if (k === 'u') {
        e.preventDefault();
        undoLastBall();
    } else if (k === 'n') {
        e.preventDefault();
        lsOpenExtraModal('NoBall');
    } else if (k === 'v') {
        e.preventDefault();
        lsOpenExtraModal('Wide');
    } else if (k === 'b') {
        e.preventDefault();
        lsOpenExtraModal('Bye');
    } else if (k === 'l') {
        e.preventDefault();
        lsOpenExtraModal('LegBye');
    }
});


// ═══════════════════════════════════════════════════════════════════
// MATCH ACTIVATION WIZARD (Scheduled → Live)
// ═══════════════════════════════════════════════════════════════════
let activateWizardState = {};
function awReset() {
    activateWizardState = { step: 1, tournamentName: '', matchId: null, matchData: null,
        venueID: null, umpire1ID: null, umpire2ID: null, thirdUmpireID: null,
        matchDate: '', isDayNight: false, tossWinner: '', tossDecision: '', playingXI: [] };
}

async function openActivateMatchWizard() {
    awReset();
    document.getElementById('activate-match-modal').style.display = 'flex';
    awRender();
    await awStep1_loadTournaments();
}
function closeActivateWizard() {
    document.getElementById('activate-match-modal').style.display = 'none';
}

function awRender() {
    document.querySelectorAll('#activate-match-modal .wizard-step').forEach(el => el.classList.remove('wizard-active'));
    document.getElementById(`aw-step-${activateWizardState.step}`).classList.add('wizard-active');
    document.getElementById('aw-progress-bar').style.width = `${(activateWizardState.step / 4) * 100}%`;
    document.querySelectorAll('#activate-match-modal .wizard-steps-labels span').forEach(s => {
        s.classList.toggle('wizard-label-active', parseInt(s.dataset.astep) === activateWizardState.step);
    });
    document.getElementById('aw-back-btn').style.display = activateWizardState.step > 1 ? 'inline-block' : 'none';
    document.getElementById('aw-next-btn').style.display = activateWizardState.step < 4 ? 'inline-block' : 'none';
    document.getElementById('aw-submit-btn').style.display = activateWizardState.step === 4 ? 'inline-block' : 'none';
}

function awValidate(step) {
    const s = activateWizardState;
    if (step === 1 && !s.tournamentName) return 'Please select a tournament.';
    if (step === 2 && !s.matchId) return 'Please select a scheduled match.';
    if (step === 3) {
        if (!s.venueID) return 'Venue is required.';
        if (!s.umpire1ID || !s.umpire2ID) return 'Both on-field umpires are required.';
        if (s.umpire1ID === s.umpire2ID) return 'Umpire 1 and Umpire 2 must differ.';
        if (!s.tossWinner) return 'Toss winner is required.';
        if (!s.tossDecision) return 'Toss decision is required.';
    }
    return null;
}

async function awNext() {
    const err = awValidate(activateWizardState.step);
    if (err) { showToast(err, 'error'); return; }
    if (activateWizardState.step === 2) await awStep3_loadDropdowns();
    if (activateWizardState.step === 3) await awStep4_loadSquadPlayers();
    if (activateWizardState.step < 4) { activateWizardState.step++; awRender(); }
}
function awBack() {
    if (activateWizardState.step > 1) { activateWizardState.step--; awRender(); }
}

async function awStep1_loadTournaments() {
    try {
        const res = await authFetch(`${API}/api/tournaments`);
        const data = await res.json();
        const sel = document.getElementById('aw-tournament-select');
        sel.innerHTML = '<option value="">— Select Tournament —</option>' +
            data.map(t => `<option value="${escHtml(t.tournamentName)}">${escHtml(t.tournamentName)} (${t.format})</option>`).join('');
    } catch { showToast('Failed to load tournaments', 'error'); }
}
function awOnTournamentSelected(name) {
    activateWizardState.tournamentName = name;
    awStep2_loadScheduledMatches();
}
async function awStep2_loadScheduledMatches() {
    const name = activateWizardState.tournamentName;
    const sel = document.getElementById('aw-match-select');
    document.getElementById('aw-match-preview').style.display = 'none';
    activateWizardState.matchId = null;
    if (!name) { sel.innerHTML = '<option value="">— Select a match —</option>'; return; }
    try {
        const res = await authFetch(`${API}/api/matches?status=Scheduled`);
        const all = await res.json();
        const filtered = all.filter(m => m.tournamentName === name);
        activateWizardState._scheduled = filtered;
        if (!filtered.length) {
            sel.innerHTML = '<option value="">No scheduled matches in this tournament</option>';
            return;
        }
        sel.innerHTML = '<option value="">— Select Match —</option>' + filtered.map(m =>
            `<option value="${m.matchID}">#${m.matchID}: ${shortTeam(m.team1Name)} vs ${shortTeam(m.team2Name)} (${m.matchType} · ${m.matchDate || 'TBD'})</option>`
        ).join('');
    } catch { showToast('Failed to load scheduled matches', 'error'); }
}
function awOnMatchSelected(id) {
    const m = (activateWizardState._scheduled || []).find(x => String(x.matchID) === String(id));
    activateWizardState.matchId = m ? m.matchID : null;
    activateWizardState.matchData = m || null;
    const prev = document.getElementById('aw-match-preview');
    if (m) {
        prev.style.display = 'flex';
        prev.innerHTML = `<span class="team-name">${shortTeam(m.team1Name)}</span>
            <span class="vs-sep">vs</span>
            <span class="team-name">${shortTeam(m.team2Name)}</span>
            <span class="badge badge-odi">${m.matchType}</span>
            <span class="badge badge-t20">${m.matchFormat}</span>`;
    } else {
        prev.style.display = 'none';
    }
}

async function awStep3_loadDropdowns() {
    try {
        const [venues, umpires] = await Promise.all([
            authFetch(`${API}/api/venues`).then(r => r.json()),
            authFetch(`${API}/api/umpires`).then(r => r.json())
        ]);
        document.getElementById('aw-venue-select').innerHTML = '<option value="">— Select Venue —</option>' +
            venues.map(v => `<option value="${v.venueID}">${escHtml(v.venueName)}, ${escHtml(v.venueCity)}</option>`).join('');
        ['aw-umpire1-select', 'aw-umpire2-select', 'aw-umpire3-select'].forEach((id, i) => {
            document.getElementById(id).innerHTML =
                `<option value="">${i === 2 ? '— None —' : '— Select Umpire —'}</option>` +
                umpires.map(u => `<option value="${u.umpireID}">${escHtml(u.umpireName)} (${u.umpireExperienceMatches} m)</option>`).join('');
        });
        const m = activateWizardState.matchData;
        document.getElementById('aw-toss-winner').innerHTML = '<option value="">— Select —</option>' +
            [m.team1Name, m.team2Name].map(t => `<option value="${escHtml(t)}">${shortTeam(t)}</option>`).join('');
    } catch { showToast('Failed to load venues/umpires', 'error'); }
}

async function awStep4_loadSquadPlayers() {
    const m = activateWizardState.matchData;
    const container = document.getElementById('aw-xi-container');
    try {
        // Prefer the registered tournament squad; fall back to the full team roster
        // when a squad hasn't been set yet (squads are optional at creation).
        const [sqRes, poolRes] = await Promise.all([
            authFetch(`${API}/api/tournaments/${encodeURIComponent(m.tournamentName)}/squad`),
            authFetch(`${API}/api/players/by_team`)
        ]);
        const squads = await sqRes.json();
        const byTeam = await poolRes.json();
        const pick = (team) => (squads[team] && squads[team].length) ? squads[team] : (byTeam[team] || []);
        const t1 = pick(m.team1Name);
        const t2 = pick(m.team2Name);
        const usedFallback = (!squads[m.team1Name] || !squads[m.team1Name].length) ||
                             (!squads[m.team2Name] || !squads[m.team2Name].length);
        if (usedFallback) {
            showToast('No tournament squad set — showing full team rosters. You can set squads later.', 'success');
        }
        container.innerHTML = renderAwXIGrid(m.team1Name, t1, 1) + renderAwXIGrid(m.team2Name, t2, 2);
        setTimeout(awUpdateXICounts, 30);
    } catch { showToast('Failed to load players', 'error'); }
}
function renderAwXIGrid(teamName, players, teamIndex) {
    const rows = players.map(p => `
        <label style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.35rem; cursor:pointer;">
            <input type="checkbox" name="aw_team${teamIndex}_xi" value="${p.playerID}" data-role="${p.playerRole}" data-name="${escHtml(p.playerName)}" onchange="awUpdateXICounts()">
            <span style="font-size:0.85rem;">${escHtml(p.playerName)} <span style="color:var(--text-muted); font-size:0.75rem;">(${p.playerRole})</span></span>
        </label>`).join('') || '<p style="color:var(--text-muted);">No squad players.</p>';
    return `
    <div style="margin-bottom:1rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:0.3rem; margin-bottom:0.5rem;">
            <strong style="color:var(--primary-light);">${shortTeam(teamName)}</strong>
            <span id="aw-count-team${teamIndex}" style="font-size:0.75rem; padding:2px 8px; border-radius:10px; background:var(--primary); color:#fff;">0/11</span>
        </div>
        <div style="max-height:180px; overflow-y:auto;">${rows}</div>
        <div class="form-row" style="margin-top:0.5rem;">
            <div class="form-group"><label>Captain</label><select id="aw-team${teamIndex}-c" class="form-input"></select></div>
            <div class="form-group"><label>Wicket-Keeper</label><select id="aw-team${teamIndex}-wk" class="form-input"></select></div>
        </div>
    </div>`;
}
function awUpdateXICounts() {
    [1, 2].forEach(idx => {
        const checked = Array.from(document.querySelectorAll(`input[name="aw_team${idx}_xi"]:checked`));
        const cEl = document.getElementById(`aw-count-team${idx}`);
        if (cEl) {
            cEl.textContent = `${checked.length}/11`;
            cEl.style.background = checked.length === 11 ? 'var(--neon-green)' : (checked.length > 11 ? 'var(--red-ball)' : 'var(--primary)');
        }
        const opts = checked.map(cb => ({ value: cb.value, text: cb.dataset.name, role: cb.dataset.role }));
        const cSel = document.getElementById(`aw-team${idx}-c`);
        const wkSel = document.getElementById(`aw-team${idx}-wk`);
        const cVal = cSel ? cSel.value : '', wkVal = wkSel ? wkSel.value : '';
        if (cSel) cSel.innerHTML = '<option value="">Captain…</option>' + opts.map(o => `<option value="${o.value}" ${o.value === cVal ? 'selected' : ''}>${o.text}</option>`).join('');
        if (wkSel) {
            const wkOpts = opts.filter(o => o.role === 'WicketKeeper');
            wkSel.innerHTML = '<option value="">Wicket-Keeper…</option>' + (wkOpts.length ? wkOpts : opts).map(o => `<option value="${o.value}" ${o.value === wkVal ? 'selected' : ''}>${o.text}</option>`).join('');
        }
    });
}

async function submitActivateWizard() {
    const s = activateWizardState;
    const m = s.matchData;
    const t1 = Array.from(document.querySelectorAll('input[name="aw_team1_xi"]:checked'));
    const t2 = Array.from(document.querySelectorAll('input[name="aw_team2_xi"]:checked'));
    if (t1.length !== 11 || t2.length !== 11) {
        showToast(`Select exactly 11 players per team (${t1.length} & ${t2.length} selected).`, 'error'); return;
    }
    const t1c = document.getElementById('aw-team1-c').value, t1wk = document.getElementById('aw-team1-wk').value;
    const t2c = document.getElementById('aw-team2-c').value, t2wk = document.getElementById('aw-team2-wk').value;
    if (!t1c || !t1wk || !t2c || !t2wk) { showToast('Select Captain and Wicket-Keeper for both teams.', 'error'); return; }

    const roleFor = (id, cap, wk) => (id === cap && id === wk) ? 'Captain & WK' : id === cap ? 'Captain' : id === wk ? 'WicketKeeper' : 'Player';
    const xi = [
        ...t1.map(cb => ({ playerID: cb.value, matchRole: roleFor(cb.value, t1c, t1wk), teamName: m.team1Name })),
        ...t2.map(cb => ({ playerID: cb.value, matchRole: roleFor(cb.value, t2c, t2wk), teamName: m.team2Name }))
    ];

    const payload = {
        venueID: s.venueID, onFieldUmpire1ID: s.umpire1ID, onFieldUmpire2ID: s.umpire2ID,
        thirdUmpireID: s.thirdUmpireID || null, matchDate: s.matchDate || m.matchDate,
        isDayNight: s.isDayNight ? 1 : 0, tossWinnerName: s.tossWinner, tossDecision: s.tossDecision,
        playingXI: xi
    };
    try {
        const res = await authFetch(`${API}/api/matches/${s.matchId}/activate`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
            showToast('Match activated! Ready for live scoring.', 'success');
            if (window.DataSync) { DataSync.matchCreated(s.matchId); DataSync.emit('match-activated', { matchId: s.matchId }); }
            closeActivateWizard();
            await loadMatches();
        } else {
            showToast(data.error || 'Activation failed', 'error');
        }
    } catch { showToast('Server error.', 'error'); }
}

// ═══════════════════════════════════════════════════════════════════
// WIN PROBABILITY
// ═══════════════════════════════════════════════════════════════════
function getChasingTeam() {
    const sc = currentScorecard && currentScorecard.match ? currentScorecard.match : currentScorecard;
    if (!sc) return '';
    const t1 = sc.team1Name, t2 = sc.team2Name;
    const tw = sc.tossWinnerName, td = (sc.tossDecision || '').toLowerCase();
    if (!tw) return t2; // default: team2 bats second
    if (td === 'bowl') return tw;              // toss winner fields → chases
    return sc.team1Name === tw ? t2 : t1;      // toss winner bats → other chases
}
function getDefendingTeam() {
    const sc = currentScorecard && currentScorecard.match ? currentScorecard.match : currentScorecard;
    if (!sc) return '';
    const chase = getChasingTeam();
    return chase === sc.team1Name ? sc.team2Name : sc.team1Name;
}

async function updateWinProbability() {
    const box = document.getElementById('win-prob-container');
    if (!box) return;
    if (beInnings !== 2) { box.style.display = 'none'; return; }
    try {
        const res = await authFetch(`${API}/api/matches/${beMatchId}/win-probability`);
        const data = await res.json();
        if (!res.ok || data.status === 'not_started') { box.style.display = 'none'; return; }
        const chasing = getChasingTeam(), defending = getDefendingTeam();
        const pChasing = data.probability;
        const pDefending = 100 - pChasing;
        document.getElementById('win-prob-bar-fill').style.width = `${pChasing}%`;
        document.getElementById('win-prob-label-chasing').textContent = `${shortTeam(chasing)} ${pChasing}%`;
        document.getElementById('win-prob-label-defending').textContent = `${pDefending}% ${shortTeam(defending)}`;
        if (data.status === 'live') {
            document.getElementById('win-prob-crr').textContent = `CRR ${data.crr}`;
            document.getElementById('win-prob-rrr').textContent = `RRR ${data.rrr}`;
            const ov = Math.floor(data.balls_remaining / 6), bl = data.balls_remaining % 6;
            document.getElementById('win-prob-needed').textContent = `${data.runs_needed} off ${ov}.${bl} · ${data.wickets_left} wkts`;
        } else {
            document.getElementById('win-prob-crr').textContent = '';
            document.getElementById('win-prob-rrr').textContent = '';
            document.getElementById('win-prob-needed').textContent = data.status === 'chasing_team_won' ? 'Chase complete' : 'Defended';
        }
        box.style.display = 'block';
    } catch { box.style.display = 'none'; }
}
