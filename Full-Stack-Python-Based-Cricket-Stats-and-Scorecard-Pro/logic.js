// logic.js — CricketStats Pro | Dashboard Logic

const API = 'http://localhost:5001';

// ─── Auth Helpers ───
function getUser() {
    try { return JSON.parse(localStorage.getItem('cricketUser')); }
    catch { return null; }
}

async function authFetch(url, options = {}) {
    const user = getUser();
    const headers = options.headers || {};
    if (user && user.token) {
        headers['Authorization'] = `Bearer ${user.token}`;
    }
    return fetch(url, { ...options, headers });
}

// ─── RBAC Enforcement ───
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

function fmtFormat(fmt) {
    const map = { T20:'badge-t20', ODI:'badge-odi', TEST:'badge-test', T10:'badge-t10' };
    return `<span class="badge ${map[fmt]||'badge-t20'}">${fmt}</span>`;
}

function fmtRole(role) {
    const map = {
        Batsman:      'badge-batsman',
        Bowler:       'badge-bowler',
        AllRounder:   'badge-allrounder',
        WicketKeeper: 'badge-keeper'
    };
    return `<span class="badge ${map[role]||'badge-batsman'}">${role}</span>`;
}

// ─── Init ───
document.addEventListener('DOMContentLoaded', async () => {
    const user = getUser();
    if (!user) { window.location.href = 'login.html'; return; }

    // Set user display
    const nameEl   = document.getElementById('user-name-display');
    const avatarEl = document.getElementById('user-avatar');
    if (nameEl)   nameEl.textContent   = user.fullname || user.email;
    if (avatarEl) avatarEl.textContent = (user.fullname || 'A')[0].toUpperCase();

    // Seed DB on first load (silently)
    try {
        await fetch(`${API}/api/seed`, { method: 'POST' });
    } catch { /* server might not be running */ }

    await Promise.all([
        loadTournaments(),
        loadOverview(),
        loadRecentMatches(),
        loadLeaderboards(),
        loadCompletedTournaments()
    ]);
});

// ─── Auto-refresh when data changes on other pages ───
if (window.DataSync) {
    DataSync.on('ball-recorded', refreshDashboard);
    DataSync.on('match-completed', refreshDashboard);
    DataSync.on('match-created', refreshDashboard);
    DataSync.on('data-changed', refreshDashboard);
}

function refreshDashboard() {
    loadOverview();
    loadRecentMatches();
    loadLeaderboards();
    loadTournaments();
    loadCompletedTournaments();
}

// ─── Tournaments ───
async function loadTournaments() {
    try {
        const res = await fetch(`${API}/api/tournaments`);
        const data = await res.json();
        const select = document.getElementById('tournament-filter');
        if (!select) return;
        data.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.tournamentName;
            opt.textContent = `${t.tournamentName} (${t.format})`;
            select.appendChild(opt);
        });
    } catch {
        console.error('Tournaments fetch failed');
    }
}

async function loadDashboardStats() {
    await loadOverview();
}

// ─── Overview Stats ───
async function loadOverview() {
    try {
        const filterEl = document.getElementById('tournament-filter');
        const q = (filterEl && filterEl.value) ? `?tournamentName=${encodeURIComponent(filterEl.value)}` : '';
        const res  = await fetch(`${API}/api/stats/overview${q}`);
        const data = await res.json();
        setText('stat-matches', data.totalMatches);
        setText('stat-teams',   data.totalTeams);
        setText('stat-runs',    data.totalRuns.toLocaleString());
        setText('stat-wickets', data.totalWickets);
        setText('stat-sixes',   data.totalSixes);
        setText('stat-fours',   data.totalFours);
    } catch {
        console.error('Overview fetch failed');
    }
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

// ─── Recent Matches ───
async function loadRecentMatches() {
    try {
        const res  = await fetch(`${API}/api/matches`);
        const data = await res.json();
        const tb   = document.getElementById('matches-table');
        if (!tb) return;
        if (!data.length) {
            tb.innerHTML = `<tr><td colspan="10" class="empty-state"><span class="empty-icon">🏏</span>No matches found.</td></tr>`;
            return;
        }
        tb.innerHTML = data.map(m => {
            const winner = m.winnerName
                ? `<span style="color:var(--neon-green); font-weight:700;">${shortTeam(m.winnerName)}</span>`
                : `<span style="color:var(--text-muted)">TBD</span>`;
            return `
            <tr>
                <td><strong style="color:var(--gold)">#${m.matchID}</strong></td>
                <td>${m.tournamentName}</td>
                <td>${fmtFormat(m.matchFormat)}</td>
                <td>${shortTeam(m.team1Name)}</td>
                <td><strong style="color:var(--neon-green)">${m.team1TotalRuns}/${m.team1TotalWickets}</strong></td>
                <td>${shortTeam(m.team2Name)}</td>
                <td><strong style="color:var(--neon-green)">${m.team2TotalRuns}/${m.team2TotalWickets}</strong></td>
                <td>${winner}</td>
                <td style="color:var(--text-muted); font-size:0.8rem;">${m.matchDate || '—'}</td>
                <td><a href="matches.html?id=${m.matchID}" class="btn-view">Scorecard →</a></td>
            </tr>`;
        }).join('');
    } catch {
        console.error('Matches fetch failed');
    }
}

function shortTeam(name) {
    if (!name) return '—';
    return name.replace(' Cricket Team', '');
}

// ─── Tournaments & Leaderboards ───
async function loadCompletedTournaments() {
    try {
        const res = await fetch(`${API}/api/tournaments`);
        const data = await res.json();
        const tb = document.getElementById('completed-tournaments-table');
        if (!tb) return;
        if (!data.length) {
            tb.innerHTML = `<tr><td colspan="4" class="empty-state">No tournaments found.</td></tr>`;
            return;
        }
        tb.innerHTML = data.map(t => {
            return `<tr>
                <td><strong style="color:var(--gold)">${t.tournamentName}</strong></td>
                <td>—</td>
                <td><span style="color:var(--text-muted)">TBD</span></td>
                <td>${t.totalTeams || t.teams.length} Teams</td>
            </tr>`;
        }).join('');
    } catch {
        console.error('Completed tournaments fetch failed');
    }
}

async function loadLeaderboards() {
    try {
        const filterEl = document.getElementById('tournament-filter');
        const q = (filterEl && filterEl.value) ? `?tournamentName=${encodeURIComponent(filterEl.value)}` : '';
        const res = await fetch(`${API}/api/stats/leaderboard${q}`);
        const data = await res.json();
        
        const batTb = document.getElementById('top-batsmen');
        const bowlTb = document.getElementById('top-bowlers');
        
        if (batTb) {
            batTb.innerHTML = data.topBatsmen.map(p => {
                const avg = p.totalRuns > 0 ? (p.totalRuns / p.ballsFaced * 100).toFixed(1) : '0.0';
                return `<tr>
                    <td><strong>${p.playerName}</strong></td>
                    <td>—</td>
                    <td><strong style="color:var(--primary-light)">${p.totalRuns}</strong></td>
                    <td style="color:var(--text-muted)">—</td>
                    <td style="color:var(--text-muted)">${avg}</td>
                </tr>`;
            }).join('') || `<tr><td colspan="5" class="empty-state">No stats available</td></tr>`;
        }
        
        if (bowlTb) {
            bowlTb.innerHTML = data.topBowlers.map(p => {
                const econ = p.ballsBowled > 0 ? ((p.runsConceded / p.ballsBowled) * 6).toFixed(2) : '0.00';
                return `<tr>
                    <td><strong>${p.playerName}</strong></td>
                    <td>—</td>
                    <td><strong style="color:var(--red-ball-light)">${p.wickets}</strong></td>
                    <td style="color:var(--text-muted)">${econ}</td>
                    <td style="color:var(--text-muted)">—</td>
                </tr>`;
            }).join('') || `<tr><td colspan="5" class="empty-state">No stats available</td></tr>`;
        }
    } catch {
        console.error('Leaderboards fetch failed');
    }
}
