// rankings.js — CricketStats Pro | Rankings Logic

const API = 'http://localhost:5001';

let teamFormat = 'T10';
let playerRole = 'Batters';

function getUser() {
    try { return JSON.parse(localStorage.getItem('cricketUser')); }
    catch { return null; }
}

function logout() {
    localStorage.removeItem('cricketUser');
    window.location.href = 'login.html';
}

function esc(v) {
    return String(v ?? '')
        .replace(/&/g, '&' + 'amp;')
        .replace(/</g, '&' + 'lt;')
        .replace(/>/g, '&' + 'gt;')
        .replace(/"/g, '&' + 'quot;');
}

function getCountryCode(countryOrTeam) {
    const s = String(countryOrTeam || '').toLowerCase();
    const map = {
        pakistan: 'pk', india: 'in', australia: 'au', england: 'gb',
        'south africa': 'za', 'new zealand': 'nz', 'west indies': 'jm',
        'sri lanka': 'lk', bangladesh: 'bd', afghanistan: 'af', uae: 'ae'
    };
    for (const [k, code] of Object.entries(map)) {
        if (s.includes(k)) return code;
    }
    return '';
}

function flagImg(countryOrTeam, size = 22) {
    const code = getCountryCode(countryOrTeam);
    if (!code) return `<span class="flag-fallback">🏳️</span>`;
    return `<img class="flag-img" src="https://flagcdn.com/w40/${code}.png" width="${size}" height="${Math.round(size * 0.75)}" alt="" loading="lazy" onerror="this.style.display='none'">`;
}

function shortTeam(name) {
    return String(name || '—').replace(' Cricket Team', '');
}

function rankTone(idx) {
    if (idx === 0) return 'var(--gold)';
    if (idx === 1) return '#e2e8f0';
    if (idx === 2) return '#b45309';
    return 'var(--text)';
}

document.addEventListener('DOMContentLoaded', () => {
    const user = getUser();
    if (!user) { window.location.href = 'login.html'; return; }

    const nameEl = document.getElementById('user-name-display');
    const avatarEl = document.getElementById('user-avatar');
    if (nameEl) nameEl.textContent = user.fullname || user.email;
    if (avatarEl) avatarEl.textContent = (user.fullname || 'A')[0].toUpperCase();

    loadRankings();

    if (window.DataSync) {
        DataSync.on('ball-recorded', () => loadRankings());
        DataSync.on('match-completed', () => loadRankings());
        DataSync.on('data-changed', () => loadRankings());
    }
});

function setTeamFormat(fmt, btn) {
    teamFormat = fmt;
    document.querySelectorAll('#team-format-tabs .filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    loadTeamRankings();
}

function setPlayerRole(role, btn) {
    playerRole = role;
    document.querySelectorAll('#player-role-tabs .filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    updatePlayerHead();
    loadPlayerRankings();
}

function updatePlayerHead() {
    const head = document.getElementById('player-rankings-head');
    if (!head) return;
    if (playerRole === 'Bowlers') {
        head.innerHTML = `<tr><th>Rank</th><th>Player</th><th>Country</th><th>Wickets</th></tr>`;
    } else if (playerRole === 'AllRounders') {
        head.innerHTML = `<tr><th>Rank</th><th>Player</th><th>Country</th><th>Runs</th><th>Wickets</th></tr>`;
    } else {
        head.innerHTML = `<tr><th>Rank</th><th>Player</th><th>Country</th><th>Runs</th></tr>`;
    }
}

async function loadRankings() {
    updatePlayerHead();
    await Promise.all([loadTeamRankings(), loadPlayerRankings()]);
}

async function loadTeamRankings() {
    const tb = document.getElementById('team-rankings');
    if (!tb) return;
    tb.innerHTML = `<tr><td colspan="5" class="empty-state">Loading…</td></tr>`;
    try {
        const res = await fetch(`${API}/api/rankings/teams?format=${encodeURIComponent(teamFormat)}`);
        const teams = await res.json();
        renderTeamRankings(teams);
    } catch (err) {
        console.error(err);
        tb.innerHTML = `<tr><td colspan="5" class="empty-state">Failed to load team rankings.</td></tr>`;
    }
}

async function loadPlayerRankings() {
    const tb = document.getElementById('player-rankings');
    if (!tb) return;
    tb.innerHTML = `<tr><td colspan="5" class="empty-state">Loading…</td></tr>`;
    try {
        const res = await fetch(`${API}/api/rankings/players?role=${encodeURIComponent(playerRole)}`);
        const players = await res.json();
        renderPlayerRankings(players);
    } catch (err) {
        console.error(err);
        tb.innerHTML = `<tr><td colspan="5" class="empty-state">Failed to load player rankings.</td></tr>`;
    }
}

let _lastTeams = [];
function renderTeamRankings(teams) {
    _lastTeams = teams || [];
    const tb = document.getElementById('team-rankings');
    if (!teams.length) {
        tb.innerHTML = `<tr><td colspan="5" class="empty-state">No team data for ${esc(teamFormat)} yet.</td></tr>`;
        return;
    }
    tb.innerHTML = teams.map((t, idx) => {
        const country = t.country || t.teamName;
        return `<tr>
            <td><strong style="color:${rankTone(idx)}; font-size:1.25rem;">#${idx + 1}</strong></td>
            <td>
                <div class="rank-entity">
                    ${flagImg(country, 26)}
                    <strong>${esc(shortTeam(t.teamName))}</strong>
                </div>
            </td>
            <td>${t.matchesPlayed || 0}</td>
            <td><strong style="color:var(--primary-light)">${t.wins || 0}</strong></td>
            <td>${renderTeamForm(t.recentForm)}</td>
        </tr>`;
    }).join('');
}

function renderTeamForm(form) {
    if (!Array.isArray(form)) form = [null, null, null, null, null];
    return `<div class="form-chips">${form.map(f => {
        if (!f) return `<span class="form-chip form-chip-empty">·</span>`;
        const cls = f === 'W' ? 'form-chip-w' : f === 'L' ? 'form-chip-l' : 'form-chip-n';
        return `<span class="form-chip ${cls}">${f}</span>`;
    }).join('')}</div>`;
}

let _lastPlayers = [];
function renderPlayerRankings(players) {
    _lastPlayers = players || [];
    const tb = document.getElementById('player-rankings');
    if (!players.length) {
        tb.innerHTML = `<tr><td colspan="5" class="empty-state">No player data for this category yet.</td></tr>`;
        return;
    }
    tb.innerHTML = players.map((p, idx) => {
        const country = p.playerNationality || '';
        if (playerRole === 'Bowlers') {
            return `<tr>
                <td><strong style="color:${rankTone(idx)}; font-size:1.25rem;">#${idx + 1}</strong></td>
                <td><strong>${esc(p.playerName)}</strong></td>
                <td><div class="rank-entity">${flagImg(country, 22)}<span>${esc(country || '—')}</span></div></td>
                <td><strong style="color:var(--red-ball-light)">${p.totalWickets || 0}</strong></td>
            </tr>`;
        }
        if (playerRole === 'AllRounders') {
            return `<tr>
                <td><strong style="color:${rankTone(idx)}; font-size:1.25rem;">#${idx + 1}</strong></td>
                <td><strong>${esc(p.playerName)}</strong></td>
                <td><div class="rank-entity">${flagImg(country, 22)}<span>${esc(country || '—')}</span></div></td>
                <td><strong style="color:var(--primary-light)">${p.totalRuns || 0}</strong></td>
                <td><strong style="color:var(--red-ball-light)">${p.totalWickets || 0}</strong></td>
            </tr>`;
        }
        return `<tr>
            <td><strong style="color:${rankTone(idx)}; font-size:1.25rem;">#${idx + 1}</strong></td>
            <td><strong>${esc(p.playerName)}</strong></td>
            <td><div class="rank-entity">${flagImg(country, 22)}<span>${esc(country || '—')}</span></div></td>
            <td><strong style="color:var(--primary-light)">${p.totalRuns || 0}</strong></td>
        </tr>`;
    }).join('');
}


function exportTeams() {
    if (!window.exportTableToCSV || !_lastTeams.length) return;
    const rows = _lastTeams.map((t, i) => [i + 1, shortTeam(t.teamName), t.country || '', t.matchesPlayed || 0, t.wins || 0]);
    window.exportTableToCSV(`team-rankings-${teamFormat}.csv`, ['Rank', 'Team', 'Country', 'Matches', 'Wins'], rows);
}

function exportPlayers() {
    if (!window.exportTableToCSV || !_lastPlayers.length) return;
    const rows = _lastPlayers.map((p, i) => [i + 1, p.playerName, p.playerNationality || '', p.playerRole || '', p.totalRuns || 0, p.totalWickets || 0]);
    window.exportTableToCSV(`player-rankings-${playerRole}.csv`, ['Rank', 'Player', 'Country', 'Role', 'Runs', 'Wickets'], rows);
}
