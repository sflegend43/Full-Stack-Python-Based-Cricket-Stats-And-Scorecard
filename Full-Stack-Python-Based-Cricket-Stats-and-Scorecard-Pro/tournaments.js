
async function authFetch(url, options = {}) {
    const user = getUser();
    const headers = options.headers || {};
    if (user && user.token) {
        headers['Authorization'] = `Bearer ${user.token}`;
    }
    return fetch(url, { ...options, headers });
}

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

document.addEventListener('DOMContentLoaded', async () => {
    const user = getUser();
    if (!user) { window.location.href = 'login.html'; return; }

    const nameEl   = document.getElementById('user-name-display');
    const avatarEl = document.getElementById('user-avatar');
    if (nameEl)   nameEl.textContent   = user.fullname || user.email;
    if (avatarEl) avatarEl.textContent = (user.fullname || 'A')[0].toUpperCase();

    await loadTeamsOptions();
    await loadTournaments();

    // Auto-refresh when data changes on other pages
    if (window.DataSync) {
        DataSync.on('ball-recorded', () => loadTournaments());
        DataSync.on('match-completed', () => loadTournaments());
        DataSync.on('match-created', () => loadTournaments());
        DataSync.on('data-changed', () => loadTournaments());
    }
});

function toggleForm() {
    const f = document.getElementById('form-section');
    f.style.display = f.style.display === 'none' ? 'block' : 'none';
}

async function loadTeamsOptions() {
    try {
        const res = await authFetch(`${API}/api/teams`);
        const teams = await res.json();
        const grid = document.getElementById('t-teams-grid');
        grid.innerHTML = teams.map(t => `
            <label style="display:flex; align-items:center; gap:0.5rem; background:rgba(255,255,255,0.05); padding:0.5rem 0.8rem; border-radius:6px; cursor:pointer; border:1px solid rgba(255,255,255,0.1); transition: 0.2s;">
                <input type="checkbox" name="t-team-cb" value="${t.teamName}" style="accent-color:var(--primary); transform:scale(1.2);">
                <span style="font-size:0.9rem; font-weight:500;">${t.teamName}</span>
            </label>
        `).join('');
    } catch {
        showToast('Failed to load teams', 'error');
    }
}

async function loadTournaments() {
    try {
        const res = await authFetch(`${API}/api/tournaments`);
        const data = await res.json();
        const tbodyRunning = document.getElementById('tournaments-running');
        const tbodyCompleted = document.getElementById('tournaments-completed');
        
        tbodyRunning.innerHTML = '';
        tbodyCompleted.innerHTML = '';

        if(data.length === 0) {
            tbodyRunning.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">No running tournaments found. Create one above!</td></tr>`;
            tbodyCompleted.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">No completed tournaments.</td></tr>`;
            return;
        }

        data.forEach(t => {
            const isCompleted = t.tournamentName.includes('2023') || t.tournamentName.includes('2022'); // Basic mock for completed
            const tr = document.createElement('tr');
            
            const teamsHtml = (t.teams || []).map(team => `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <span>${team}</span>
                    <button class="btn-view" style="padding:2px 6px; font-size:0.7rem;" onclick="viewTournamentSquad('${t.tournamentName.replace(/'/g, "\\'")}', '${team.replace(/'/g, "\\'")}')">View</button>
                </div>
            `).join('') || 'None';

            tr.innerHTML = `
                <td style="font-weight:600; color:var(--primary-light);">${t.tournamentName}</td>
                <td><span class="badge ${t.format==='ODI'?'badge-odi':(t.format==='T20'?'badge-t20':'badge-test')}">${t.format}</span></td>
                <td>${t.totalTeams}</td>
                <td>${t.overs}</td>
                <td style="font-size:0.85rem; color:var(--text-muted); min-width:200px;">${teamsHtml}</td>
                <td style="display:flex; gap:0.4rem; justify-content:center;">
                    <button class="btn-view" style="font-size: 0.75rem;" onclick="viewStandings('${t.tournamentName.replace(/'/g, "\\'")}')">Standings</button>
                    ${getUser()?.isAdmin ? `
                    <button class="btn-view" style="font-size: 0.75rem;" onclick="startSquadSelection('${t.tournamentName.replace(/'/g, "\\'")}', ${JSON.stringify(t.teams || []).replace(/"/g, '&quot;')})">Manage Squads</button>
                    <button class="btn-delete" style="font-size: 0.75rem; padding: 0.4rem;" onclick="deleteTournament('${t.tournamentName.replace(/'/g, "\\'")}')">🗑</button>
                    ` : ''}
                </td>            `;
            
            if (isCompleted) {
                tbodyCompleted.appendChild(tr);
            } else {
                tbodyRunning.appendChild(tr);
            }
        });
        
        if (tbodyCompleted.children.length === 0) {
            tbodyCompleted.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">No completed tournaments.</td></tr>`;
        }
    } catch {
        showToast('Failed to load tournaments', 'error');
    }
}

async function viewStandings(name) {
    try {
        const res = await authFetch(`${API}/api/tournaments/${encodeURIComponent(name)}/standings`);
        const data = await res.json();
        document.getElementById('standingsTitle').textContent = `${name} — Standings`;
        const content = document.getElementById('standingsContent');
        if (!data.length) {
            content.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:2rem;">No matches played yet in this tournament.</p>';
        } else {
            content.innerHTML = `
            <div class="table-scroll">
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Team</th>
                            <th>P</th>
                            <th>W</th>
                            <th>L</th>
                            <th>N/R</th>
                            <th>Pts</th>
                            <th>Runs For</th>
                            <th>Wkts</th>
                            <th>Runs Agst</th>
                            <th>NRR</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map(r => `
                        <tr>
                            <td style="font-weight:700; color:var(--gold-bright);">${r.rank}</td>
                            <td style="font-weight:600;">${r.teamName}</td>
                            <td>${r.played || 0}</td>
                            <td style="color:var(--neon-green); font-weight:600;">${r.wins || 0}</td>
                            <td style="color:var(--red-ball-light);">${r.losses || 0}</td>
                            <td style="color:var(--text-muted);">${r.noResult || 0}</td>
                            <td style="font-weight:700; color:var(--primary-light);">${r.points || 0}</td>
                            <td>${r.runsScored || 0}</td>
                            <td>${r.wicketsLost || 0}</td>
                            <td>${r.runsConceded || 0}</td>
                            <td style="color:${r.nrr > 0 ? 'var(--neon-green)' : r.nrr < 0 ? 'var(--red-ball-light)' : 'var(--text-muted)'}; font-weight:600;">${r.nrr > 0 ? '+' : ''}${r.nrr}</td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            `;
        }
        document.getElementById('standingsModal').style.display = 'flex';
    } catch {
        showToast('Failed to load standings', 'error');
    }
}

async function deleteTournament(name) {
    if(!await customConfirm(`Are you sure you want to delete ${name}?`)) return;
    try {
        const res = await authFetch(`${API}/api/tournaments/${encodeURIComponent(name)}`, { method: 'DELETE' });
        if(res.ok) {
            showToast('Tournament deleted', 'success');
            loadTournaments();
        } else {
            showToast('Failed to delete tournament', 'error');
        }
    } catch { showToast('Network error', 'error'); }
}

async function saveTournament(e) {
    e.preventDefault();
    
    const checkboxes = document.querySelectorAll('input[name="t-team-cb"]:checked');
    const selectedTeams = Array.from(checkboxes).map(cb => cb.value);

    const payload = {
        tournamentName: document.getElementById('t-name').value,
        format: document.getElementById('t-format').value,
        totalTeams: document.getElementById('t-total').value,
        overs: document.getElementById('t-overs').value,
        teams: selectedTeams
    };

    try {
        const res = await authFetch(`${API}/api/tournaments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if(res.ok) {
            showToast('Tournament Created! Select squads...', 'success');
            document.getElementById('form-section').style.display = 'none';
            document.getElementById('tournament-form').reset();
            loadTournaments(); // Ensure the table updates immediately
            startSquadSelection(payload.tournamentName, selectedTeams);
        } else {
            showToast(data.error || 'Failed to create tournament', 'error');
        }
    } catch {
        showToast('Network error', 'error');
    }
}

// ─── SQUAD SELECTION LOGIC ───
let currentTournamentForSquads = '';
let teamsForSquads = [];
let currentSquadTeamIndex = 0;
let playersByTeam = {};
let finalSquadSelection = []; // [{teamName, playerID}]

let existingSquad = [];

async function startSquadSelection(tournamentName, teams) {
    currentTournamentForSquads = tournamentName;
    teamsForSquads = teams;
    currentSquadTeamIndex = 0;
    finalSquadSelection = [];
    existingSquad = [];
    
    document.getElementById('squadModalTitle').textContent = `Select Squads for ${tournamentName}`;
    
    try {
        const res = await authFetch(`${API}/api/players/by_team`);
        playersByTeam = await res.json();
        
        const squadRes = await authFetch(`${API}/api/tournaments/${encodeURIComponent(tournamentName)}/squad`);
        const squadData = await squadRes.json();
        // squadData is { 'TeamName': [players...], ... }
        existingSquad = Object.values(squadData).flat().map(s => s.playerID);
    } catch {
        showToast('Failed to load players or squad data', 'error');
        return;
    }
    
    document.getElementById('squadModal').style.display = 'flex';
    renderSquadTeam();
}

function renderSquadTeam() {
    if (currentSquadTeamIndex >= teamsForSquads.length) {
        submitAllSquads();
        return;
    }
    
    const teamName = teamsForSquads[currentSquadTeamIndex];
    document.getElementById('squadTeamName').textContent = teamName;
    document.getElementById('squadTeamProgress').textContent = `Team ${currentSquadTeamIndex + 1} of ${teamsForSquads.length}`;
    
    const isLast = currentSquadTeamIndex === teamsForSquads.length - 1;
    document.getElementById('btnSquadNext').textContent = isLast ? 'Save All Squads ➔' : 'Next Team ➔';
    
    const players = playersByTeam[teamName] || [];
    const grid = document.getElementById('squadPlayersGrid');
    
    if (players.length === 0) {
        grid.innerHTML = `<p style="color:var(--text-muted);">No players found in this team's pool.</p>`;
        updateSquadCounter();
        return;
    }
    
    grid.innerHTML = players.map(p => {
        const isChecked = existingSquad.includes(p.playerID) ? 'checked' : '';
        return `
        <label class="glass-card" style="padding: 1rem; cursor: pointer; display: flex; align-items: center; gap: 0.5rem; transition: background 0.3s;" onchange="updateSquadCounter()">
            <input type="checkbox" class="squad-checkbox" value="${p.playerID}" data-team="${teamName}" style="transform: scale(1.2);" ${isChecked}>
            <div>
                <div style="font-weight: 600; font-size: 0.95rem;">${p.playerName}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">${p.playerRole}</div>
            </div>
        </label>
        `;
    }).join('');
    
    updateSquadCounter();
}

function updateSquadCounter() {
    const checked = document.querySelectorAll('.squad-checkbox:checked').length;
    document.getElementById('squadCounter').textContent = `Selected: ${checked}/16`;
    document.getElementById('squadCounter').style.color = checked === 16 ? 'var(--neon-green)' : (checked > 16 ? 'var(--neon-red)' : 'var(--text-muted)');
}

function nextSquadTeam() {
    const checkedBoxes = document.querySelectorAll('.squad-checkbox:checked');
    if (checkedBoxes.length !== 16) {
        showToast('Please select exactly 16 players.', 'error');
        return;
    }
    
    const teamName = teamsForSquads[currentSquadTeamIndex];
    checkedBoxes.forEach(cb => {
        finalSquadSelection.push({
            teamName: teamName,
            playerID: cb.value
        });
    });
    
    currentSquadTeamIndex++;
    renderSquadTeam();
}

async function submitAllSquads() {
    try {
        const res = await authFetch(`${API}/api/tournaments/${encodeURIComponent(currentTournamentForSquads)}/squad`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ squads: finalSquadSelection })
        });
        
        if (res.ok) {
            showToast('All squads saved successfully!', 'success');
            document.getElementById('squadModal').style.display = 'none';
            loadTournaments(); // Refresh list
        } else {
            const data = await res.json();
            showToast(data.error || 'Failed to save squads', 'error');
        }
    } catch {
        showToast('Network error while saving squads', 'error');
    }
}

async function viewTournamentSquad(tournamentName, teamName) {
    try {
        const res = await authFetch(`${API}/api/tournaments/${encodeURIComponent(tournamentName)}/squad`);
        const squadData = await res.json();
        const players = squadData[teamName] || [];
        
        document.getElementById('viewSquadModalTitle').textContent = `${teamName} Squad - ${tournamentName}`;
        
        const content = document.getElementById('viewSquadContent');
        if (players.length === 0) {
            content.innerHTML = `<p style="color:var(--text-muted); padding: 2rem; text-align:center;">Squad has not been selected for this tournament yet.</p>`;
        } else {
            content.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem;">
                    ${players.map(p => `
                        <div class="glass-card" style="padding: 1rem; border: 1px solid rgba(255,255,255,0.1);">
                            <div style="font-weight: 600; font-size: 0.95rem;">${p.playerName}</div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">${p.playerRole}</div>
                        </div>
                    `).join('')}
                </div>
            `;
        }
        document.getElementById('viewSquadModal').style.display = 'flex';
    } catch {
        showToast('Failed to load squad', 'error');
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
