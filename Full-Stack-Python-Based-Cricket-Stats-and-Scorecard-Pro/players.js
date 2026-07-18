
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
                <div class="pc-hero">
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
