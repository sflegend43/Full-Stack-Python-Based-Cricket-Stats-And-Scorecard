
async function authFetch(url, options = {}) {
    const user = getUser();
    const headers = options.headers || {};
    if (user && user.token) {
        headers['Authorization'] = `Bearer ${user.token}`;
    }
    return fetch(url, { ...options, headers });
}

// teams.js — CricketStats Pro | Teams Page Logic

const API = 'http://localhost:5001';

function getUser() {
    try { return JSON.parse(localStorage.getItem('cricketUser')); }
    catch { return null; }
}

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

function roleBadge(role) {
    const cls = { Batsman:'badge-batsman', Bowler:'badge-bowler', AllRounder:'badge-allrounder', WicketKeeper:'badge-keeper' };
    return `<span class="badge ${cls[role]||'badge-batsman'}">${role}</span>`;
}

function fmtBadge(fmt) {
    const map = { T20:'badge-t20', ODI:'badge-odi', TEST:'badge-test', T10:'badge-t10' };
    return `<span class="badge ${map[fmt]||'badge-t20'}">${fmt}</span>`;
}

function shortTeam(name) {
    return (name || '—').replace(' Cricket Team', '');
}

const FLAG_MAP = {
    Pakistan:     '🇵🇰',
    India:        '🇮🇳',
    Australia:    '🇦🇺',
    'South Africa':'🇿🇦',
    'New Zealand':'🇳🇿',
    England:      '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
};

const FEATURED_PLAYERS = {
    'Pakistan Cricket Team': 'Babar Azam',
    'Indian Cricket Team': 'Virat Kohli',
    'Australian Cricket Team': 'Steve Smith',
    'New Zealand Cricket Team': 'Kane Williamson',
    'West Indies Cricket Team': 'Rovman Powell',
    'South Africa Cricket Team': 'Aiden Markram'
};

// ─── Init ───
document.addEventListener('DOMContentLoaded', async () => {
    const user = getUser();
    if (!user) { window.location.href = 'login.html'; return; }

    const nameEl   = document.getElementById('user-name-display');
    const avatarEl = document.getElementById('user-avatar');
    if (nameEl)   nameEl.textContent   = user.fullname || user.email;
    if (avatarEl) avatarEl.textContent = (user.fullname || 'A')[0].toUpperCase();

    await loadTeams();

    // Auto-refresh when data changes on other pages
    if (window.DataSync) {
        DataSync.on('ball-recorded', () => loadTeams());
        DataSync.on('match-completed', () => loadTeams());
        DataSync.on('match-created', () => loadTeams());
        DataSync.on('data-changed', () => loadTeams());
    }
});

// ─── Load Teams ───
async function loadTeams() {
    try {
        const res   = await authFetch(`${API}/api/teams`);
        const teams = await res.json();
        renderTeams(teams);
    } catch {
        document.getElementById('teams-tbody').innerHTML =
            '<tr><td colspan="6" class="empty-state">⚠️ Could not connect to server.</td></tr>';
    }
}

function rankBadge(rank) {
    if (rank === 1) return `<div class="rank-badge rank-1">${rank}</div>`;
    if (rank === 2) return `<div class="rank-badge rank-2">${rank}</div>`;
    if (rank === 3) return `<div class="rank-badge rank-3">${rank}</div>`;
    return `<div class="rank-badge rank-other">${rank}</div>`;
}

function getCountryCode(country) {
    const map = {
        'pakistan': 'pk',
        'india': 'in',
        'australia': 'au',
        'england': 'gb-eng',
        'south africa': 'za',
        'new zealand': 'nz',
        'west indies': 'jm',
        'sri lanka': 'lk',
        'bangladesh': 'bd',
        'afghanistan': 'af'
    };
    return map[country?.toLowerCase()] || 'xx';
}

function renderTeams(teams) {
    const tb = document.getElementById('teams-tbody');
    if (!teams.length) {
        tb.innerHTML = `<tr><td colspan="6" class="empty-state"><span class="empty-icon">🏆</span>No teams found.</td></tr>`;
        return;
    }
    tb.innerHTML = teams.map(t => {
        const flagUrl = `https://flagcdn.com/32x24/${getCountryCode(t.country)}.png`;
        return `
        <tr>
            <td>${rankBadge(t.ranking)}</td>
            <td>
                <div style="display:flex; align-items:center; gap:1rem;">
                    <div>
                        <div style="font-weight:700;">${shortTeam(t.teamName)}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">${t.teamName}</div>
                    </div>
                </div>
            </td>
            <td>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <img src="${flagUrl}" style="height:18px; border-radius:2px; box-shadow:0 1px 3px rgba(0,0,0,0.3);" onerror="this.style.display='none'">
                    <span style="font-weight: 500;">${t.country}</span>
                </div>
            </td>
            
            <td style="color:var(--text-muted); font-size:0.85rem;">${t.headCoach || '—'}</td>
            <td>
                <button class="btn-view" onclick="viewTeam('${encodeURIComponent(t.teamName)}')">👥 View Roster</button>
            </td>
        </tr>`;
    }).join('');
}

function toggleAddTeamForm() {
    const f = document.getElementById('add-team-form');
    f.style.display = f.style.display === 'none' ? 'block' : 'none';
}

async function saveTeam(e) {
    e.preventDefault();
    const payload = {
        teamName: document.getElementById('new-team-name').value,
        countryName: document.getElementById('new-team-country').value,
        headCoach: document.getElementById('new-team-coach').value,
        
    };

    try {
        const res = await authFetch(`${API}/api/teams`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if(res.ok) {
            showToast('Team Created Successfully', 'success');
            document.getElementById('new-team-name').value = '';
            document.getElementById('new-team-country').value = '';
            document.getElementById('new-team-coach').value = '';
            
            toggleAddTeamForm();
            loadTeams();
        } else {
            showToast(data.error || 'Failed to create team', 'error');
        }
    } catch {
        showToast('Network error', 'error');
    }
}

// ─── Team Detail ───
async function viewTeam(encodedName) {
    const teamName = decodeURIComponent(encodedName);
    try {
        const res  = await authFetch(`${API}/api/teams/${encodeURIComponent(teamName)}`);
        const data = await res.json();
        if (!res.ok) { showToast(data.error || 'Team not found', 'error'); return; }
        renderTeamDetail(data);
        document.getElementById('list-view').style.display   = 'none';
        document.getElementById('detail-view').style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
        showToast('Server error loading team.', 'error');
    }
}

function backToList() {
    document.getElementById('detail-view').style.display = 'none';
    document.getElementById('list-view').style.display   = 'block';
}

function renderTeamDetail(data) {
    const t    = data.team;
    const flag = FLAG_MAP[t.country] || '🌐';

    // Team header card
    document.getElementById('team-header').innerHTML = `
        <div style="display:flex; align-items:center; gap:1.5rem; flex-wrap:wrap;">
            <div style="font-size:4rem; filter:drop-shadow(0 0 16px rgba(22,163,74,0.5));">${flag}</div>
            <div style="flex:1;">
                <h2 style="font-size:1.8rem; font-weight:900; background:var(--gradient-main);
                    -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;">
                    ${shortTeam(t.teamName)}
                </h2>
                <p style="color:var(--text-muted); font-size:0.85rem; margin-top:0.3rem;">${t.teamName}</p>
            </div>
            <div style="display:flex; gap:2rem; flex-wrap:wrap; text-align:center;">
                <div>
                    <div style="font-size:0.72rem; color:var(--text-muted); font-weight:600; letter-spacing:1px; text-transform:uppercase;">Ranking</div>
                    ${rankBadge(t.ranking)}
                </div>
                <div>
                    <div style="font-size:0.72rem; color:var(--text-muted); font-weight:600; letter-spacing:1px; text-transform:uppercase;">Head Coach</div>
                    <div style="font-weight:700; color:var(--text); margin-top:0.3rem;">${t.headCoach || '—'}</div>
                </div>
                <div>
                    <div style="font-size:0.72rem; color:var(--text-muted); font-weight:600; letter-spacing:1px; text-transform:uppercase;">Squad Size</div>
                    <div style="font-weight:700; color:var(--primary-light); margin-top:0.3rem; font-family:'Orbitron',sans-serif;">${data.squad.length}</div>
                </div>
            </div>
        </div>`;

    // Squad with featured player
    const rosterEl = document.getElementById('roster-content');
    const featuredName = FEATURED_PLAYERS[t.teamName] || null;
    const placeholder = 'dummy.png';

    let squadRows = '';
    if (data.squad.length) {
        squadRows = data.squad.map(p => `
            <tr>
                <td><strong>${p.playerName}</strong></td>
                <td>${roleBadge(p.playerRole)}</td>
                <td style="color:var(--text-muted); font-size:0.8rem;">${p.playerDOB}</td>
            </tr>`).join('');
    } else {
        squadRows = `<tr><td colspan="3" class="empty-state">No squad data.</td></tr>`;
    }

    const featuredImg = featuredName ? `Players Pics/${featuredName}.png` : null;
    const featuredCrop = featuredName ? `Players Pics/${featuredName} crop.png` : null;

    rosterEl.innerHTML = featuredName ? `
        <div class="team-roster-grid">
            <div class="team-roster-hero">
                <img class="team-roster-hero-img" src="${featuredImg}" alt="${featuredName}"
                     onerror="if(!this.dataset.fb){this.dataset.fb='1';this.src='${featuredCrop}'}else{this.src='${placeholder}'}">
            </div>
            <div class="team-roster-list">
                <div class="table-scroll" style="max-height: 320px; overflow-y: auto;">
                    <table>
                        <thead><tr><th>Name</th><th>Role</th><th>DOB</th></tr></thead>
                        <tbody>${squadRows}</tbody>
                    </table>
                </div>
            </div>
        </div>
    ` : `
        <div class="team-roster-grid">
            <div class="team-roster-hero team-roster-empty">
                <div class="team-roster-empty-icon">🏏</div>
                <div class="team-roster-empty-text">Featured player coming soon</div>
            </div>
            <div class="team-roster-list">
                <div class="table-scroll" style="max-height: 320px; overflow-y: auto;">
                    <table>
                        <thead><tr><th>Name</th><th>Role</th><th>DOB</th></tr></thead>
                        <tbody>${squadRows}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    // Match History
    const matchTb = document.getElementById('team-matches-tbody');
    const teamName = t.teamName;
    if (data.matches.length) {
        matchTb.innerHTML = data.matches.map(m => {
            const isTeam1   = m.team1Name === teamName;
            const myRuns    = isTeam1 ? m.team1TotalRuns    : m.team2TotalRuns;
            const myWickets = isTeam1 ? m.team1TotalWickets : m.team2TotalWickets;
            const opponent  = isTeam1 ? shortTeam(m.team2Name) : shortTeam(m.team1Name);
            const won       = m.winnerName === teamName;
            const result    = m.winnerName
                ? (won
                    ? `<span style="color:var(--neon-green); font-weight:700;">✅ Won</span>`
                    : `<span style="color:var(--red-ball-light);">❌ Lost</span>`)
                : `<span style="color:var(--text-muted);">—</span>`;
            return `
            <tr>
                <td><strong style="color:var(--gold);">#${m.matchID}</strong></td>
                <td style="font-size:0.78rem;">${m.tournamentName}</td>
                <td>${fmtBadge(m.matchFormat)}</td>
                <td>${opponent}</td>
                <td><strong style="color:var(--neon-green);">${myRuns}/${myWickets}</strong></td>
                <td>${result}</td>
            </tr>`;
        }).join('');
    } else {
        matchTb.innerHTML = `<tr><td colspan="6" class="empty-state">No matches played yet.</td></tr>`;
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
