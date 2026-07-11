
async function authFetch(url, options = {}) {
    const user = getUser();
    const headers = options.headers || {};
    if (user && user.email) {
        headers['X-User-Email'] = user.email;
    }
    return fetch(url, { ...options, headers });
}

// players.js — CricketStats Pro | Players Page Logic

const API = 'http://localhost:5001';

let allPlayers   = [];
let currentRole  = '';
let currentSearch = '';

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
});

async function loadPlayers() {
    try {
        const res = await authFetch(`${API}/api/players/by_team`);
        allPlayers = await res.json(); // dictionary: { teamName: [players...] }
        
        const teamSelect = document.getElementById('teamSelect');
        if (teamSelect && teamSelect.options.length === 1) {
            Object.keys(allPlayers).sort().forEach(team => {
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
    
    for (const [team, players] of Object.entries(allPlayers)) {
        if (currentTeam && team !== currentTeam) continue;
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
            <div class="players-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1.5rem;">
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
            
            // Generate a CREX-style 2D vector illustration wearing the team's color
            const shirtColor = TEAM_COLORS[team] || 'aaaaaa';
            const avatarUrl = `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(p.playerName)}&clothing=shirtCrewNeck,graphicShirt,blazerAndShirt&clothingColor=${shirtColor}&skinColor=f8d25c,ffdbb4,edb98a,d08b5b,ae5d29,391206&backgroundColor=e2e8f0,f8fafc`;

            html += `
            <div class="player-card role-${rc}">
                <div class="player-role-icon">${ROLE_EMOJI[p.playerRole] || '🏏'}</div>
                <div class="player-head" style="display: flex; gap: 1rem; align-items: center; margin-bottom: 0.5rem;">
                    <img src="${avatarUrl}" alt="${p.playerName}" style="width: 55px; height: 55px; border-radius: 50%; box-shadow: 0 4px 10px rgba(0,0,0,0.3); border: 2px solid #${shirtColor}; background: #fff;">
                    <div style="display: flex; flex-direction: column; justify-content: center; z-index: 1;">
                        <div class="player-name" style="font-size: 1.1rem; font-weight: 700; margin-bottom: 0.2rem;">${p.playerName}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; align-items: center; gap: 0.3rem;">
                            <img src="${flagUrl}" style="height:12px; border-radius:2px;" onerror="this.style.display='none'"> 
                            ${p.playerNationality}
                        </div>
                    </div>
                </div>
                <div class="player-details">
                    <div class="detail-item"><span class="dlbl">DOB:</span> <span class="dval">${p.playerDOB}</span></div>
                    <div class="detail-item"><span class="dlbl">Bat:</span> <span class="dval">${p.battingStyle || '-'}</span></div>
                    <div class="detail-item"><span class="dlbl">Bowl:</span> <span class="dval">${p.bowlingStyle || '-'}</span></div>
                </div>
                <div class="player-actions" style="margin-top: 1rem; display: flex; justify-content: space-between; align-items: center;">
                    ${roleBadge(p.playerRole)}
                    ${getUser()?.isAdmin ? `
                    <div class="action-btns">
                        <button class="action-btn" title="Edit" onclick="openEditModal('${p.playerID}')">✏️</button>
                        <button class="action-btn action-del" title="Delete" onclick="deletePlayer('${p.playerID}', '${p.playerName.replace(/'/g, "\\'")}')">🗑️</button>
                    </div>` : ''}
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
    if (!confirm(`Delete player "${name}"? This cannot be undone.`)) return;
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
