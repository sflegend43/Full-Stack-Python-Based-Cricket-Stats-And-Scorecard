
async function authFetch(url, options = {}) {
    const user = getUser();
    const headers = options.headers || {};
    if (user && user.token) {
        headers['Authorization'] = `Bearer ${user.token}`;
    }
    return fetch(url, { ...options, headers });
}

// players.js — CricketStats Pro | Players Page Logic

const API = 'http://localhost:5001';

let allPlayers   = [];
let allPlayerStats = {};
let currentRole  = '';
let currentSearch = '';

const TEAM_ORDER = [
    'Pakistan Cricket Team',
    'Indian Cricket Team',
    'Australian Cricket Team',
    'South Africa Cricket Team',
    'New Zealand Cricket Team',
    'West Indies Cricket Team'
];

function teamSortKey(name) {
    const idx = TEAM_ORDER.indexOf(name);
    return idx === -1 ? 1000 + name : idx.toString().padStart(4, '0') + name;
}

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

const ROLE_EMOJI = {
    Batsman:      '🏏',
    Bowler:       '🎯',
    AllRounder:   '⚡',
    WicketKeeper: '🧤'
};

const ROLE_CLASS = {
    Batsman:      'batsman',
    Bowler:       'bowler',
    AllRounder:   'allrounder',
    WicketKeeper: 'wicketkeeper'
};

function roleBadge(role) {
    const cls = { Batsman:'badge-batsman', Bowler:'badge-bowler', AllRounder:'badge-allrounder', WicketKeeper:'badge-keeper' };
    return `<span class="badge ${cls[role]||'badge-batsman'}">${role}</span>`;
}

// ─── Init ───
document.addEventListener('DOMContentLoaded', async () => {
    const user = getUser();
    if (!user) { window.location.href = 'login.html'; return; }

    const nameEl   = document.getElementById('user-name-display');
    const avatarEl = document.getElementById('user-avatar');
    if (nameEl)   nameEl.textContent   = user.fullname || user.email;
    if (avatarEl) avatarEl.textContent = (user.fullname || 'A')[0].toUpperCase();

    await loadPlayers();
    setupForms();

    // Auto-refresh when data changes
    if (window.DataSync) {
        DataSync.on('ball-recorded', () => loadPlayers());
        DataSync.on('match-completed', () => loadPlayers());
        DataSync.on('data-changed', () => loadPlayers());
    }
});

async function loadPlayers() {
    try {
        // Fetch both profile data and stats
        const [byTeamRes, statsRes] = await Promise.all([
            authFetch(`${API}/api/players/by_team`),
            authFetch(`${API}/api/players/stats`)
        ]);
        allPlayers = await byTeamRes.json();
        const statsArr = await statsRes.json();

        // Index stats by playerID for quick lookup
        allPlayerStats = {};
        statsArr.forEach(s => { allPlayerStats[s.playerID] = s; });
        
        const teamSelect = document.getElementById('teamSelect');
        if (teamSelect && teamSelect.options.length === 1) {
            Object.keys(allPlayers).sort((a, b) => teamSortKey(a).localeCompare(teamSortKey(b))).forEach(team => {
                const opt = document.createElement('option');
                opt.value = team;
                opt.textContent = team;
                teamSelect.appendChild(opt);
            });
        }
        
        applyFilters();
    } catch {
        document.getElementById('players-grid').innerHTML =
            '<p style="color:var(--text-muted); text-align:center; padding:2rem;">⚠️ Could not connect to server. Make sure app.py is running.</p>';
    }
}

function applyFilters() {
    currentSearch = (document.getElementById('searchInput')?.value || '').toLowerCase();
    const currentTeam = document.getElementById('teamSelect')?.value || '';
    
    const filteredTeams = {};
    let totalPlayers = 0;
    
    const sortedKeys = Object.keys(allPlayers).sort((a, b) => teamSortKey(a).localeCompare(teamSortKey(b)));
    for (const team of sortedKeys) {
        if (currentTeam && team !== currentTeam) continue;
        const players = allPlayers[team];
        const filtered = players.filter(p => {
            const roleOk   = !currentRole || p.playerRole === currentRole;
            const searchOk = !currentSearch || p.playerName.toLowerCase().includes(currentSearch);
            return roleOk && searchOk;
        });
        if (filtered.length > 0) {
            filteredTeams[team] = filtered;
            totalPlayers += filtered.length;
        }
    }
    
    renderPlayers(filteredTeams, totalPlayers);
}

function setRoleFilter(btn, role) {
    currentRole = role;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyFilters();
}

function renderPlayers(groupedPlayers, totalCount) {
    const grid  = document.getElementById('players-grid');
    const label = document.getElementById('player-count-label');
    if (label) label.textContent = `${totalCount} player${totalCount !== 1 ? 's' : ''} found`;

    if (totalCount === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:3rem; color:var(--text-muted);">
            <span style="font-size:3rem; display:block; margin-bottom:1rem; opacity:0.4;">🏏</span>
            No players match your search.
        </div>`;
        return;
    }

    let html = '';
    
    for (const [team, players] of Object.entries(groupedPlayers)) {
        html += `
        <div class="team-section" style="grid-column: 1 / -1; margin-top: 1rem; margin-bottom: 2rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.5rem; margin-bottom: 1rem;">
                <h2 style="font-size: 1.4rem; color: #fff;">${team}</h2>
            </div>
            <div class="players-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1.5rem;">
        `;
        
        const TEAM_COLORS = {
            'Pakistan Cricket Team': '2e8b57',    // Green
            'Indian Cricket Team': '1e90ff',      // Blue
            'Australian Cricket Team': 'ffd700',  // Yellow
            'South Africa Cricket Team': '228b22',// Green
            'New Zealand Cricket Team': '262626', // Black
            'England Cricket Team': 'e32636',     // Red
            'West Indies Cricket Team': '800000', // Maroon
            'Sri Lanka Cricket Team': '00008b',   // Dark Blue
            'Bangladesh Cricket Team': '006a4e',  // Dark Green
            'Afghanistan Cricket Team': '0000cd'  // Medium Blue
        };

        players.forEach(p => {
            const rc = ROLE_CLASS[p.playerRole] || 'batsman';
            const flagUrl = `https://flagcdn.com/24x18/${getCountryCode(p.playerNationality)}.png`;
            
            const shirtColor = TEAM_COLORS[team] || 'aaaaaa';
            const safeName = p.playerName.replace(/'/g, "\\'");
            const placeholder = 'dummy.png';
            const avatarUrl = `Players Pics/${p.playerName}.png`;
            const cropUrl = `Players Pics/${p.playerName} crop.png`;

            html += `
            <div class="player-card role-${rc}">
                <div class="pc-hero" style="cursor:pointer;" onclick="openPlayerProfile('${p.playerID}')" title="View profile">
                    <img class="pc-hero-img" src="${avatarUrl}" alt="${p.playerName}"
                         onerror="if(!this.dataset.fb){this.dataset.fb='1';this.src='${cropUrl}'}else{this.src='${placeholder}'}">
                    <span class="pc-role-badge">${ROLE_EMOJI[p.playerRole] || '🏏'} ${p.playerRole}</span>
                    <div class="pc-flag">
                        <img src="${flagUrl}" onerror="this.style.display='none'">
                        ${p.playerNationality}
                    </div>
                </div>
                <div class="pc-body">
                    <div class="pc-name">${p.playerName}</div>
                    <div class="pc-telemetry">
                        <div class="pc-info-row">
                            <span class="pc-info-label">DOB</span>
                            <span class="pc-info-value">${p.playerDOB}</span>
                        </div>
                        <div class="pc-info-row">
                            <span class="pc-info-label">Batting</span>
                            <span class="pc-info-value">${p.battingStyle || '—'}</span>
                        </div>
                        <div class="pc-info-row">
                            <span class="pc-info-label">Bowling</span>
                            <span class="pc-info-value">${p.bowlingStyle || '—'}</span>
                        </div>
                        <div class="pc-info-row">
                            <span class="pc-info-label">Bat Order</span>
                            <span class="pc-info-value">${p.battingOrder || 'Middle Order'}</span>
                        </div>
                    </div>
                    <div class="pc-actions">
                        ${roleBadge(p.playerRole)}
                        ${getUser()?.isAdmin ? `
                        <div class="pc-action-btns">
                            <button class="pc-action-btn" title="Edit" onclick="openEditModal('${p.playerID}')">✏️</button>
                            <button class="pc-action-btn del" title="Delete" onclick="deletePlayer('${p.playerID}', '${safeName}')">🗑️</button>
                        </div>` : ''}
                    </div>
                </div>
            </div>`;
        });
        
        html += `</div></div>`;
    }

    grid.innerHTML = html;
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
    return map[country.toLowerCase()] || 'xx';
}

// ─── Add Modal ───
async function openAddModal() {
    document.getElementById('add-form').reset();
    
    // Fetch and populate teams
    try {
        const res = await authFetch(`${API}/api/teams`);
        const teams = await res.json();
        const teamSelect = document.getElementById('add-team');
        if (teamSelect) {
            teamSelect.innerHTML = '<option value="">Select Team...</option>' + 
                teams.map(t => `<option value="${t.teamName}">${t.teamName}</option>`).join('');
        }
    } catch {
        showToast('Failed to load teams', 'error');
    }
    
    document.getElementById('addModal').style.display = 'flex';
}

function closeAddModal() {
    document.getElementById('addModal').style.display = 'none';
}

// ─── Edit Modal ───
function openEditModal(pid) {
    let p = null;
    for (const team of Object.values(allPlayers)) {
        p = team.find(x => x.playerID === pid);
        if (p) break;
    }
    if (!p) return;
    document.getElementById('edit-pid').value  = p.playerID;
    document.getElementById('edit-name').value = p.playerName;
    document.getElementById('edit-dob').value  = p.playerDOB;
    document.getElementById('edit-nat').value  = p.playerNationality;
    document.getElementById('edit-bat').value  = p.battingStyle || '';
    document.getElementById('edit-bowl').value = p.bowlingStyle || '';
    document.getElementById('edit-role').value = p.playerRole;
    document.getElementById('edit-batting-order').value = p.battingOrder || 'Middle Order';
    document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
}

// ─── Delete ───
async function deletePlayer(pid, name) {
    if (!await customConfirm(`Delete player "${name}"? This cannot be undone.`)) return;
    try {
        const res = await authFetch(`${API}/api/players/${pid}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) { showToast(data.error || 'Delete failed', 'error'); return; }
        showToast(`${name} deleted successfully.`);
        await loadPlayers();
    } catch {
        showToast('Server error during delete.', 'error');
    }
}

// ─── Forms ───
function setupForms() {
    // Add Form
    document.getElementById('add-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const teamSelect = document.getElementById('add-team');
        const selectedTeam = teamSelect ? teamSelect.value : '';
        if (!selectedTeam) {
            showToast('Please select a team', 'error');
            return;
        }

        const body = {
            playerName:        document.getElementById('add-name').value.trim(),
            playerDOB:         document.getElementById('add-dob').value,
            playerNationality: document.getElementById('add-nat').value.trim(),
            battingStyle:      document.getElementById('add-bat').value,
            bowlingStyle:      document.getElementById('add-bowl').value.trim(),
            playerRole:        document.getElementById('add-role').value,
            battingOrder:      document.getElementById('add-batting-order').value,
            teamName:          selectedTeam
        };
        try {
            const res  = await authFetch(`${API}/api/players/add_to_pool`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (!res.ok) { showToast(data.error || 'Add failed', 'error'); return; }
            showToast(`${body.playerName} added to ${selectedTeam}!`);
            closeAddModal();
            await loadPlayers();
        } catch {
            showToast('Server error.', 'error');
        }
    });

    // Edit Form
    document.getElementById('edit-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const pid  = document.getElementById('edit-pid').value;
        const body = {
            playerName:        document.getElementById('edit-name').value.trim(),
            playerDOB:         document.getElementById('edit-dob').value,
            playerNationality: document.getElementById('edit-nat').value.trim(),
            battingStyle:      document.getElementById('edit-bat').value,
            bowlingStyle:      document.getElementById('edit-bowl').value.trim(),
            playerRole:        document.getElementById('edit-role').value,
            battingOrder:      document.getElementById('edit-batting-order').value,
        };
        try {
            const res  = await authFetch(`${API}/api/players/${pid}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (!res.ok) { showToast(data.error || 'Update failed', 'error'); return; }
            showToast(`${body.playerName} updated!`);
            closeEditModal();
            await loadPlayers();
        } catch {
            showToast('Server error.', 'error');
        }
    });
}

// Close modals on overlay click
['addModal', 'editModal'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', function (e) {
        if (e.target === this) this.style.display = 'none';
    });
});

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


// ═══════════════════════════════════════════════════════════════════
// PLAYER PROFILE VIEW (grid ↔ profile)
// ═══════════════════════════════════════════════════════════════════
let profileCharts = {};
let currentProfileTeam = '';

function playerFlagImg(nationality, size = 22) {
    const c = getCountryCode(nationality);
    return c ? `<img src="https://flagcdn.com/w40/${c}.png" width="${size}" alt="" onerror="this.style.display='none'">` : '🏏';
}

async function openPlayerProfile(playerId) {
    document.getElementById('players-browse-view').style.display = 'none';
    document.getElementById('player-profile-view').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
        const res = await authFetch(`${API}/api/players/${playerId}/career`);
        const data = await res.json();
        const p = data.player;
        currentProfileTeam = '';
        if (data.recentMatches && data.recentMatches.length) {
            currentProfileTeam = data.recentMatches[0].playerTeam || '';
        }

        document.getElementById('profile-name').textContent = p.playerName;
        const photo = document.getElementById('profile-photo');
        photo.src = `Players Pics/${p.playerName}.png`;
        photo.onerror = function () { this.onerror = null; this.src = 'dummy.png'; };
        document.getElementById('profile-flag').innerHTML = playerFlagImg(p.playerNationality, 22);
        document.getElementById('profile-nationality').textContent = p.playerNationality || '';
        document.getElementById('profile-role-badge').innerHTML =
            `<span class="badge badge-t20">${(ROLE_EMOJI[p.playerRole] || '🏏')} ${p.playerRole}</span>`;
        document.getElementById('profile-bat-style').textContent = p.battingStyle ? `🏏 ${p.battingStyle}` : '';
        document.getElementById('profile-bowl-style').textContent = p.bowlingStyle ? `🎯 ${p.bowlingStyle}` : '';

        const bat = data.careerTotals.batting || {};
        const bowl = data.careerTotals.bowling || {};
        document.getElementById('profile-runs').textContent = bat.totalRuns || 0;
        document.getElementById('profile-wickets').textContent = bowl.wickets || 0;
        document.getElementById('profile-matches').textContent = bat.matches || 0;
        document.getElementById('profile-fifties').textContent = bat.fifties || 0;

        renderProfileBattingChart(data.battingYearly);
        renderProfileBattingTable(data.battingYearly);
        renderProfileBowlingChart(data.bowlingYearly);
        renderProfileBowlingTable(data.bowlingYearly);
        renderProfileMatches(data.recentMatches);
        switchProfileTab('batting');
    } catch {
        showToast ? showToast('Failed to load profile', 'error') : alert('Failed to load profile');
        closePlayerProfile();
    }
}

function closePlayerProfile() {
    document.getElementById('player-profile-view').style.display = 'none';
    document.getElementById('players-browse-view').style.display = 'block';
    Object.values(profileCharts).forEach(c => { try { c.destroy(); } catch {} });
    profileCharts = {};
}

function switchProfileTab(tab) {
    document.getElementById('profile-batting-panel').style.display = tab === 'batting' ? 'block' : 'none';
    document.getElementById('profile-bowling-panel').style.display = tab === 'bowling' ? 'block' : 'none';
    document.getElementById('profile-matches-panel').style.display = tab === 'matches' ? 'block' : 'none';
    ['batting', 'bowling', 'matches'].forEach(t => {
        const b = document.getElementById(`ptab-${t}`);
        if (b) b.classList.toggle('active', t === tab);
    });
}

const CHART_AXES = {
    x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.04)' } },
    y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true }
};

function renderProfileBattingChart(yearly) {
    if (profileCharts.batting) profileCharts.batting.destroy();
    const ctx = document.getElementById('profile-batting-chart').getContext('2d');
    profileCharts.batting = new Chart(ctx, {
        type: 'bar',
        data: { labels: yearly.map(r => r.year), datasets: [{ label: 'Runs', data: yearly.map(r => r.runs || 0),
            backgroundColor: 'rgba(34,197,94,0.4)', borderColor: 'rgba(34,197,94,0.9)', borderWidth: 2, borderRadius: 6 }] },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: CHART_AXES }
    });
}
function renderProfileBattingTable(yearly) {
    document.getElementById('profile-batting-tbody').innerHTML = yearly.map(r => {
        const sr = r.balls > 0 ? ((r.runs / r.balls) * 100).toFixed(1) : '—';
        return `<tr><td>${r.year}</td><td>${r.innings}</td>
            <td style="color:var(--neon-green); font-weight:700;">${r.runs || 0}</td>
            <td>${r.highScore || 0}</td><td>${r.balls || 0}</td><td>${sr}</td>
            <td>${r.fours || 0}</td><td style="color:var(--gold)">${r.sixes || 0}</td>
            <td style="color:var(--red-ball)">${r.ducks || 0}</td></tr>`;
    }).join('') || '<tr><td colspan="9" style="color:var(--text-muted); padding:1rem;">No batting data yet.</td></tr>';
}
function renderProfileBowlingChart(yearly) {
    if (profileCharts.bowling) profileCharts.bowling.destroy();
    const ctx = document.getElementById('profile-bowling-chart').getContext('2d');
    profileCharts.bowling = new Chart(ctx, {
        type: 'bar',
        data: { labels: yearly.map(r => r.year), datasets: [{ label: 'Wickets', data: yearly.map(r => r.wickets || 0),
            backgroundColor: 'rgba(239,68,68,0.4)', borderColor: 'rgba(239,68,68,0.9)', borderWidth: 2, borderRadius: 6 }] },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: CHART_AXES }
    });
}
function renderProfileBowlingTable(yearly) {
    document.getElementById('profile-bowling-tbody').innerHTML = yearly.map(r => {
        const overs = Math.floor((r.balls || 0) / 6) + '.' + ((r.balls || 0) % 6);
        const econ = r.balls > 0 ? ((r.runs / r.balls) * 6).toFixed(2) : '—';
        return `<tr><td>${r.year}</td><td>${r.matches || 0}</td><td>${overs}</td>
            <td>${r.runs || 0}</td><td style="color:var(--neon-green); font-weight:700;">${r.wickets || 0}</td>
            <td>${econ}</td></tr>`;
    }).join('') || '<tr><td colspan="6" style="color:var(--text-muted); padding:1rem;">No bowling data yet.</td></tr>';
}
function renderProfileMatches(matches) {
    document.getElementById('profile-matches-tbody').innerHTML = (matches || []).map(m => {
        const team = m.playerTeam || currentProfileTeam;
        const opponent = m.team1Name === team ? m.team2Name : m.team1Name;
        let result = 'N', color = 'var(--gold)';
        if (m.winnerName) {
            if (m.winnerName === team) { result = '✓ W'; color = 'var(--neon-green)'; }
            else { result = '✗ L'; color = 'var(--red-ball)'; }
        }
        return `<tr>
            <td>${m.matchDate || 'TBD'}</td>
            <td style="font-size:0.8rem; color:var(--text-muted);">${m.tournamentName || '—'}</td>
            <td><span class="badge badge-t20">${m.matchFormat}</span></td>
            <td>${(opponent || '—').replace(' Cricket Team','')}</td>
            <td>${m.runsScored ?? '—'} (${m.ballsFaced ?? '—'})</td>
            <td style="color:var(--red-ball)">${m.wicketsTaken ?? '—'}</td>
            <td style="color:${color}; font-weight:700;">${result}</td></tr>`;
    }).join('') || '<tr><td colspan="7" style="color:var(--text-muted); padding:1rem;">No match history.</td></tr>';
}
