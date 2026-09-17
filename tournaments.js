
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
            tbodyRunning.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">No running tournaments found. Create one above!</td></tr>`;
            tbodyCompleted.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">No completed tournaments.</td></tr>`;
            return;
        }

        data.forEach(t => {
            const isCompleted = (t.status === 'completed');
            const tr = document.createElement('tr');
            
            const teamsHtml = (t.teams || []).map(team => `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <span>${team}</span>
                    <button class="btn-view" style="padding:2px 6px; font-size:0.7rem;" onclick="viewTournamentSquad('${t.tournamentName.replace(/'/g, "\\'")}', '${team.replace(/'/g, "\\'")}')">View</button>
                </div>
            `).join('') || 'None';

            const safeName = t.tournamentName.replace(/'/g, "\\'");
            const typeLabel = t.tournamentType || 'Tournament';
            let progressCell;
            if (isCompleted) {
                progressCell = `<span class="badge-completed">🏆 ${t.completedMatches || 0} played</span>`;
            } else {
                const done = t.completedMatches || 0, total = t.totalMatches || 0;
                progressCell = total > 0
                    ? `<span style="color:var(--text-muted); font-size:0.82rem;">${done}/${total} played</span>`
                    : `<span class="badge-scheduled">◷ New</span>`;
            }
            tr.innerHTML = `
                <td style="font-weight:600; color:var(--primary-light);">${t.tournamentName}</td>
                <td><span class="badge badge-t20" style="text-transform:none;">${typeLabel}</span></td>
                <td><span class="badge ${t.format==='ODI'?'badge-odi':(t.format==='T20'?'badge-t20':'badge-test')}">${t.format}</span></td>
                <td>${t.totalTeams}</td>
                <td>${t.overs}</td>
                <td>${progressCell}</td>
                <td style="display:flex; gap:0.4rem; justify-content:center; flex-wrap:wrap;">
                    <button class="btn-view" style="font-size: 0.75rem;" onclick="viewStandings('${safeName}')">Standings</button>
                    <button class="btn-view" style="font-size: 0.75rem;" onclick="viewBracket('${safeName}')">Bracket</button>
                    ${getUser()?.isAdmin ? `
                    <button class="btn-view" style="font-size: 0.75rem;" onclick="startSquadSelection('${safeName}', ${JSON.stringify(t.teams || []).replace(/"/g, '&quot;')})">Manage Squads</button>
                    <button class="btn-edit" style="font-size: 0.75rem;" onclick="openEditSchedule('${safeName}')">Edit Schedule</button>
                    <button class="btn-edit" style="font-size: 0.75rem;" onclick="openEditDetails('${safeName}')">Edit Details</button>
                    <button class="btn-delete" style="font-size: 0.75rem; padding: 0.4rem;" onclick="deleteTournament('${safeName}')">🗑</button>
                    ` : ''}
                </td>            `;
            
            if (isCompleted) {
                tbodyCompleted.appendChild(tr);
            } else {
                tbodyRunning.appendChild(tr);
            }
        });
        
        if (tbodyCompleted.children.length === 0) {
            tbodyCompleted.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">No completed tournaments.</td></tr>`;
        }
    } catch {
        showToast('Failed to load tournaments', 'error');
    }
}

// ─── Flag helper (uses flagcdn based on nationality/team name) ───
function getCountryCodeT(countryOrTeam) {
    const s = String(countryOrTeam || '').toLowerCase();
    const map = { pakistan:'pk', india:'in', indian:'in', australia:'au', australian:'au',
        england:'gb', 'south africa':'za', 'new zealand':'nz', 'west indies':'jm',
        'sri lanka':'lk', bangladesh:'bd', afghanistan:'af', uae:'ae', ireland:'ie', zimbabwe:'zw' };
    for (const [k, code] of Object.entries(map)) if (s.includes(k)) return code;
    return '';
}
function getTeamFlag(name, size = 22) {
    if (!name || name === 'TBD') return '❓';
    const c = getCountryCodeT(name);
    return c ? `<img class="flag-img" src="https://flagcdn.com/w40/${c}.png" width="${size}" alt="" loading="lazy" onerror="this.style.display='none'">` : '🏏';
}

function standingsRowsHTML(rows, showQualify) {
    if (!rows || !rows.length) {
        return '<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:1.5rem;">No completed matches yet.</td></tr>';
    }
    return rows.map((r, i) => {
        const nrr = Number(r.NRR || 0);
        const nrrColor = nrr >= 0 ? 'var(--neon-green)' : 'var(--red-ball)';
        const nrrSign  = nrr >= 0 ? '+' : '';
        const posIcon  = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
        const qualifies = showQualify && i < 2;
        return `
        <tr class="${qualifies ? 'standings-qualifies' : ''}">
            <td class="standings-pos">${posIcon}</td>
            <td class="standings-team"><span class="team-flag-sm">${getTeamFlag(r.teamName, 20)}</span>${shortTeamName(r.teamName)}</td>
            <td class="sc-num">${r.P}</td>
            <td class="sc-num" style="color:var(--neon-green)">${r.W}</td>
            <td class="sc-num" style="color:var(--red-ball)">${r.L}</td>
            <td class="sc-num" style="color:var(--gold)">${r.NR}</td>
            <td class="sc-num" style="color:var(--primary-light); font-size:1.15rem; font-weight:700;">${r.Pts}</td>
            <td class="sc-num" style="color:${nrrColor}">${nrrSign}${nrr.toFixed(3)}</td>
        </tr>`;
    }).join('');
}

function standingsTableHTML(rows, showQualify) {
    return `<div style="overflow-x:auto"><table class="standings-table">
        <thead><tr>
          <th>#</th><th>Team</th>
          <th title="Played">P</th>
          <th title="Won" style="color:var(--neon-green)">W</th>
          <th title="Lost" style="color:var(--red-ball)">L</th>
          <th title="No Result / Tied" style="color:var(--gold)">NR</th>
          <th title="Points" style="color:var(--primary-light)">Pts</th>
          <th title="Net Run Rate">NRR</th>
        </tr></thead>
        <tbody>${standingsRowsHTML(rows, showQualify)}</tbody>
      </table></div>`;
}

async function viewStandings(name) {
    try {
        const res = await authFetch(`${API}/api/tournaments/${encodeURIComponent(name)}/standings`);
        const data = await res.json();
        // Backward compatible: accept either a plain array or {overall, pools}.
        const overall = Array.isArray(data) ? data : (data.overall || []);
        const pools = Array.isArray(data) ? null : (data.pools || null);

        document.getElementById('standings-tournament-name').textContent = `${name} — Standings`;
        const poolsWrap = document.getElementById('standings-pools');
        const overallTitle = document.getElementById('standings-overall-title');
        const tbody = document.getElementById('standings-tbody');
        const isKnockout = overall.length <= 2;

        if (pools && Object.keys(pools).length) {
            // Show a table per pool, then the overall table underneath.
            poolsWrap.innerHTML = Object.keys(pools).sort().map(k => `
                <div class="standings-section-title">${k}</div>
                ${standingsTableHTML(pools[k], true)}
            `).join('');
            overallTitle.style.display = 'block';
        } else {
            poolsWrap.innerHTML = '';
            overallTitle.style.display = 'none';
        }
        tbody.innerHTML = standingsRowsHTML(overall, !isKnockout && !(pools && Object.keys(pools).length));

        document.getElementById('standings-modal').style.display = 'flex';
    } catch {
        showToast('Failed to load standings', 'error');
    }
}

// ─── Bracket view ───
async function viewBracket(tournamentName) {
    try {
        const res = await authFetch(`${API}/api/tournaments/${encodeURIComponent(tournamentName)}/bracket`);
        const data = await res.json();
        const bracket = data.bracket || {};
        document.getElementById('bracket-tournament-name').textContent = tournamentName + ' — Bracket';
        const container = document.getElementById('bracket-container');
        // Use the backend's logical round order, covering every playoff type
        // (Qualifiers, Eliminator, Play-off, Semis, Final, etc.).
        const rounds = (data.order && data.order.length
            ? data.order
            : Object.keys(bracket)).filter(r => bracket[r] && bracket[r].length);
        const safeBN = String(tournamentName).replace(/'/g, "\\'");
        const poolsBtn = data.pools
            ? `<button class="btn-view" style="margin:0.5rem 0;" onclick="viewPools('${safeBN}')">👥 View Pools</button>` : '';
        if (!rounds.length) {
            container.innerHTML = '<div class="empty-state soft-empty" style="margin:auto;">No knockout stage for this tournament.</div>';
        } else {
            container.innerHTML = poolsBtn + '<div class="bracket-rounds-flow">' + rounds.map(round => `
                <div class="bracket-round">
                    <div class="bracket-round-label">${STAGE_LABELS[round] || round}</div>
                    ${bracket[round].map(m => renderBracketMatch(m)).join('')}
                </div>`).join('<div class="bracket-connector"></div>') + '</div>';
        }
        document.getElementById('bracket-modal').style.display = 'flex';
    } catch {
        showToast('Failed to load bracket', 'error');
    }
}

function renderBracketMatch(m) {
    const t1Won = m.winner && m.winner === m.team1;
    const t2Won = m.winner && m.winner === m.team2;
    const isTBD1 = m.team1 === 'TBD', isTBD2 = m.team2 === 'TBD';
    const teamRow = (name, won, isTBD) => {
        const cls = won ? 'bracket-team-won' : isTBD ? 'bracket-team-tbd' : 'bracket-team';
        return `<div class="${cls}">
            <span class="bracket-team-flag">${isTBD ? '?' : getTeamFlag(name, 18)}</span>
            <span class="bracket-team-name">${isTBD ? 'TBD' : shortTeamName(name)}</span>
            ${won ? '<span class="bracket-winner-tick">✓</span>' : ''}
        </div>`;
    };
    const statusBadge = m.status === 'Completed' ? '' :
        m.status === 'Live' ? '<span class="badge-live">● LIVE</span>' :
        '<span class="badge-scheduled">Scheduled</span>';
    return `
    <div class="bracket-match ${m.status === 'Completed' ? 'bracket-match-done' : ''}">
        ${statusBadge}
        ${teamRow(m.team1, t1Won, isTBD1)}
        <div class="bracket-vs">vs</div>
        ${teamRow(m.team2, t2Won, isTBD2)}
        ${m.date && m.date !== 'TBD' ? `<div class="bracket-date">${m.date}</div>` : ''}
    </div>`;
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
        // Pre-seed selection with existing squads so skipped teams keep their picks
        finalSquadSelection = [];
        Object.entries(squadData).forEach(([tm, players]) => {
            players.forEach(p => finalSquadSelection.push({ teamName: tm, playerID: p.playerID }));
        });
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

    const BAND_ORDER = { 'Top Order': 1, 'Middle Order': 2, 'Lower Order': 3, 'Tail': 4 };
    const ROLE_EMOJI = { 'Batsman': '🏏', 'Bowler': '🎯', 'AllRounder': '⚡', 'WicketKeeper': '🧤' };
    const BAND_COLORS = { 'Top Order': 'var(--gold-bright)', 'Middle Order': 'var(--primary-light)', 'Lower Order': 'var(--text-muted)', 'Tail': 'var(--text-muted)' };

    const sorted = [...players].sort((a, b) => (BAND_ORDER[a.battingOrder] || 99) - (BAND_ORDER[b.battingOrder] || 99)
                                              || a.playerName.localeCompare(b.playerName));
    
    const groups = {};
    sorted.forEach(p => {
        const band = p.battingOrder || 'Middle Order';
        if (!groups[band]) groups[band] = [];
        groups[band].push(p);
    });

    let html = '';
    const bandOrder = ['Top Order', 'Middle Order', 'Lower Order', 'Tail'];
    bandOrder.forEach(band => {
        const pts = groups[band];
        if (!pts || !pts.length) return;
        html += `<div style="grid-column:1/-1; margin-top:0.8rem;">
            <div style="font-size:0.75rem; font-weight:700; color:${BAND_COLORS[band]}; text-transform:uppercase; letter-spacing:1px; padding-bottom:0.3rem; border-bottom:1px solid rgba(255,255,255,0.1); margin-bottom:0.4rem;">${band} (${pts.length})</div>
        </div>`;
        pts.forEach(p => {
            const isChecked = existingSquad.includes(p.playerID) ? 'checked' : '';
            const emoji = ROLE_EMOJI[p.playerRole] || '🏏';
            html += `
        <label class="glass-card" style="padding:0.7rem 0.8rem; cursor:pointer; display:flex; align-items:center; gap:0.5rem; transition:background 0.3s;" onchange="updateSquadCounter()">
            <input type="checkbox" class="squad-checkbox" value="${p.playerID}" data-team="${teamName}" style="transform:scale(1.2);" ${isChecked}>
            <div style="min-width:0;">
                <div style="font-weight:600; font-size:0.9rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${emoji} ${p.playerName}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">${p.playerRole}</div>
            </div>
        </label>`;
        });
    });

    grid.innerHTML = html;
    
    updateSquadCounter();
}

function updateSquadCounter() {
    const checked = document.querySelectorAll('.squad-checkbox:checked').length;
    const el = document.getElementById('squadCounter');
    el.textContent = `Selected: ${checked} / 16 max (11–16 recommended)`;
    el.style.color = checked > 16 ? 'var(--red-ball)' : (checked >= 11 ? 'var(--neon-green)' : 'var(--text-muted)');
}

function nextSquadTeam() {
    const checkedBoxes = document.querySelectorAll('.squad-checkbox:checked');
    if (checkedBoxes.length > 16) {
        showToast('A squad can have at most 16 players.', 'error');
        return;
    }
    // Squads are flexible and can be finalised later — any count up to 16 is accepted.
    const teamName = teamsForSquads[currentSquadTeamIndex];
    // Remove any prior picks for this team (so re-visits overwrite cleanly)
    finalSquadSelection = finalSquadSelection.filter(s => s.teamName !== teamName);
    checkedBoxes.forEach(cb => {
        finalSquadSelection.push({ teamName: teamName, playerID: cb.value });
    });
    currentSquadTeamIndex++;
    renderSquadTeam();
}

function skipSquadTeam() {
    // Leave this team's squad for later and move on
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
            const ROLE_EMOJI = { 'Batsman': '🏏', 'Bowler': '🎯', 'AllRounder': '⚡', 'WicketKeeper': '🧤' };
            const BAND_ORDER = { 'Top Order': 1, 'Middle Order': 2, 'Lower Order': 3, 'Tail': 4 };
            const sorted = [...players].sort((a, b) => (BAND_ORDER[a.battingOrder] || 99) - (BAND_ORDER[b.battingOrder] || 99)
                                                      || a.playerName.localeCompare(b.playerName));
            const groups = {};
            sorted.forEach(p => {
                const band = p.battingOrder || 'Middle Order';
                if (!groups[band]) groups[band] = [];
                groups[band].push(p);
            });
            let ghtml = '<div style="display:flex; flex-direction:column; gap:1rem;">';
            ['Top Order', 'Middle Order', 'Lower Order', 'Tail'].forEach(band => {
                const pts = groups[band];
                if (!pts || !pts.length) return;
                ghtml += `<div style="font-size:0.75rem; font-weight:700; color:var(--primary-light); text-transform:uppercase; letter-spacing:1px; padding-bottom:0.3rem; border-bottom:1px solid rgba(255,255,255,0.1);">${band} (${pts.length})</div>`;
                ghtml += `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:0.6rem;">`;
                pts.forEach(p => {
                    const emoji = ROLE_EMOJI[p.playerRole] || '🏏';
                    ghtml += `<div class="glass-card" style="padding:0.7rem 0.9rem; border:1px solid rgba(255,255,255,0.1); display:flex; align-items:center; gap:0.5rem;">
                        <span style="font-size:1.1rem;">${emoji}</span>
                        <div>
                            <div style="font-weight:600; font-size:0.9rem;">${p.playerName}</div>
                            <div style="font-size:0.75rem; color:var(--text-muted);">${p.playerRole}</div>
                        </div>
                    </div>`;
                });
                ghtml += '</div>';
            });
            ghtml += '</div>';
            content.innerHTML = ghtml;
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


// ═══════════════════════════════════════════════
// Schedule + Hierarchy (Tree) View
// ═══════════════════════════════════════════════

let scheduleView = 'schedule';
let allTournamentsCache = [];
let scheduleMatchesCache = [];

function shortTeamName(n) {
    return String(n || 'TBD').replace(' Cricket Team', '');
}

function setScheduleView(view, btn) {
    scheduleView = view;
    document.querySelectorAll('#schedule-view-tabs .filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const sched = document.getElementById('schedule-board');
    const tree = document.getElementById('bracket-board');
    if (sched) sched.style.display = view === 'schedule' ? 'block' : 'none';
    if (tree) tree.style.display = view === 'tree' ? 'block' : 'none';
    renderScheduleBoard();
}

async function hydrateScheduleSelector(tournaments) {
    allTournamentsCache = tournaments || [];
    const sel = document.getElementById('schedule-tournament');
    if (!sel) return;
    const prev = sel.value;
    const params = new URLSearchParams(location.search);
    const focus = params.get('focus') || prev || '';
    sel.innerHTML = allTournamentsCache.map(t =>
        `<option value="${String(t.tournamentName).replace(/"/g, '&quot;')}">${t.tournamentName} (${t.format})</option>`
    ).join('') || '<option value="">No tournaments</option>';
    if (focus && [...sel.options].some(o => o.value === focus)) sel.value = focus;
    else if (sel.options.length) sel.selectedIndex = 0;
    await renderScheduleBoard();
}

async function renderScheduleBoard() {
    const sel = document.getElementById('schedule-tournament');
    const name = sel ? sel.value : '';
    const board = document.getElementById('schedule-board');
    const tree = document.getElementById('bracket-board');
    if (!name) {
        if (board) board.innerHTML = '<div class="empty-state soft-empty">Select a tournament to view its schedule.</div>';
        if (tree) tree.innerHTML = '';
        return;
    }
    try {
        const res = await authFetch(`${API}/api/matches?tournamentName=${encodeURIComponent(name)}`);
        scheduleMatchesCache = await res.json();
    } catch {
        scheduleMatchesCache = [];
    }

    const tMeta = allTournamentsCache.find(t => t.tournamentName === name) || {};
    if (scheduleView === 'tree') {
        if (tree) tree.innerHTML = buildBracketTree(scheduleMatchesCache, tMeta);
        return;
    }
    if (board) board.innerHTML = buildScheduleGrid(scheduleMatchesCache, tMeta);
}

// Friendly labels + logical order for every match / playoff type.
const STAGE_LABELS = {
    'Group-Stage': 'Group Stage', 'League': 'League',
    'Quarter-Final': 'Quarter-Finals',
    'SF-1': 'Semi-Final 1', 'SF-2': 'Semi-Final 2',
    'Semi-Final': 'Semi-Finals', '3rd-Place-SF': '3rd Place Semi',
    'Qualifier-1': 'Qualifier 1', 'Eliminator': 'Eliminator', 'Qualifier-2': 'Qualifier 2',
    'Play-off': 'Play-off', '1st-Place-Match': '1st Place Match',
    '2nd-Place-PO': '2nd Place Play-off', 'SF-Final': 'Semi-Final (Final)',
    'Final': 'Final'
};
const STAGE_ORDER_LIST = [
    'Group Stage', 'Pool A', 'Pool B', 'League',
    'Quarter-Finals', 'Semi-Final 1', 'Semi-Final 2', 'Semi-Finals', '3rd Place Semi',
    'Qualifier 1', 'Eliminator', 'Qualifier 2',
    'Play-off', '1st Place Match', '2nd Place Play-off', 'Semi-Final (Final)', 'Final'
];
// Match types that belong to the knockout / playoff phase.
const KNOCKOUT_TYPES = new Set([
    'Quarter-Final', 'SF-1', 'SF-2', 'Semi-Final', '3rd-Place-SF',
    'Qualifier-1', 'Eliminator', 'Qualifier-2', 'Play-off',
    '1st-Place-Match', '2nd-Place-PO', 'SF-Final', 'Final'
]);

function isKnockoutMatch(m) { return KNOCKOUT_TYPES.has(m.matchType); }
function isGroupMatch(m) { return m.matchType === 'Group-Stage' || m.matchType === 'League'; }

function stageKey(m) {
    // Group matches that belong to a pool are shown under their pool heading.
    if (isGroupMatch(m) && (m.matchGroup === 'Pool A' || m.matchGroup === 'Pool B'))
        return m.matchGroup;
    return STAGE_LABELS[m.matchType] || m.matchType || 'League';
}

function stageOrder(name) {
    const i = STAGE_ORDER_LIST.indexOf(name);
    return i === -1 ? 90 : i;
}

function matchBoxHTML(m) {
    const done = !!(m.winnerName && String(m.winnerName).trim());
    const t1 = shortTeamName(m.team1Name);
    const t2 = shortTeamName(m.team2Name);
    const s1 = `${m.team1TotalRuns || 0}/${m.team1TotalWickets || 0}`;
    const s2 = `${m.team2TotalRuns || 0}/${m.team2TotalWickets || 0}`;
    const w1 = done && m.winnerName === m.team1Name;
    const w2 = done && m.winnerName === m.team2Name;
    return `
    <a class="match-box ${done ? 'is-done' : 'is-live'}" href="matches.html?id=${m.matchID}">
      <div class="match-box-top">
        <span class="match-id">#${m.matchID}</span>
        <span class="match-date">${m.matchDate || 'TBD'}</span>
      </div>
      <div class="match-row ${w1 ? 'winner' : ''}"><span class="mn">${t1}</span><span class="ms">${s1}</span></div>
      <div class="match-row ${w2 ? 'winner' : ''}"><span class="mn">${t2}</span><span class="ms">${s2}</span></div>
      <div class="match-box-foot">${done ? ('Winner: ' + shortTeamName(m.winnerName)) : (m.matchStatus || 'Scheduled')}</div>
    </a>`;
}

function buildScheduleGrid(matches, meta) {
    if (!matches.length) {
        return `<div class="empty-state soft-empty">No matches scheduled yet for <strong>${meta.tournamentName || 'this tournament'}</strong>. Create fixtures in Matches.</div>`;
    }
    const groups = {};
    matches.forEach(m => {
        const k = stageKey(m);
        (groups[k] ||= []).push(m);
    });
    const stages = Object.keys(groups).sort((a, b) => stageOrder(a) - stageOrder(b));
    return `
      <div class="schedule-summary">
        <span class="badge ${meta.format === 'ODI' ? 'badge-odi' : meta.format === 'TEST' ? 'badge-test' : meta.format === 'T10' ? 'badge-t10' : 'badge-t20'}">${meta.format || '—'}</span>
        <span class="meta-dot">${matches.length} fixtures</span>
        <span class="meta-dot">${(meta.teams || []).length || meta.totalTeams || 0} teams</span>
        <span class="meta-dot">${meta.status || ''}</span>
      </div>
      <div class="schedule-stages">
        ${stages.map(st => `
          <div class="schedule-stage">
            <div class="schedule-stage-title">${st}</div>
            <div class="match-box-grid">
              ${groups[st].map(matchBoxHTML).join('')}
            </div>
          </div>`).join('')}
      </div>`;
}

// ─── Group-stage flowchart (arrows) ───
// Renders the league / pool matches as a horizontal flow connected by arrows,
// feeding into a "Standings" node. Used both for pure-league tournaments and
// as the lead-in to a playoff tree.
function buildGroupFlow(groupMatches) {
    if (!groupMatches.length) return '';
    // Split by pool if pool matches are present.
    const pools = {};
    groupMatches.forEach(m => {
        const key = (m.matchGroup === 'Pool A' || m.matchGroup === 'Pool B')
            ? m.matchGroup : 'Group Stage';
        (pools[key] ||= []).push(m);
    });
    const poolKeys = Object.keys(pools).sort((a, b) => stageOrder(a) - stageOrder(b));
    const lane = (label, list) => `
      <div class="flow-lane">
        <div class="flow-lane-title">${label}</div>
        <div class="flow-row">
          ${list.map((m, i) => `
            ${i > 0 ? '<span class="flow-arrow" aria-hidden="true">→</span>' : ''}
            <div class="flow-node">${matchBoxHTML(m)}</div>
          `).join('')}
          <span class="flow-arrow" aria-hidden="true">→</span>
          <div class="flow-standings">🏆<span>Standings</span></div>
        </div>
      </div>`;
    return `<div class="flow-section">
        ${poolKeys.map(k => lane(k, pools[k])).join('')}
      </div>`;
}

// ─── Playoff tree (bracket columns) ───
function buildPlayoffTree(koMatches) {
    const groups = {};
    koMatches.forEach(m => { (groups[stageKey(m)] ||= []).push(m); });
    const stages = Object.keys(groups).sort((a, b) => stageOrder(a) - stageOrder(b));
    return `
      <div class="bracket-wrap">
        <div class="bracket-columns">
          ${stages.map((st, idx) => `
            <div class="bracket-col">
              <div class="bracket-col-title">${st}</div>
              <div class="bracket-col-matches">
                ${groups[st].map(m => matchBoxHTML(m)).join('')}
              </div>
              ${idx < stages.length - 1 ? '<div class="bracket-connector" aria-hidden="true"></div>' : ''}
            </div>`).join('')}
        </div>
      </div>`;
}

function buildBracketTree(matches, meta) {
    if (!matches.length) {
        return `<div class="empty-state soft-empty">No fixtures yet for this tournament.</div>`;
    }
    const groupMatches = matches.filter(isGroupMatch);
    const koMatches = matches.filter(isKnockoutMatch);
    const hasPools = matches.some(m => m.matchGroup === 'Pool A' || m.matchGroup === 'Pool B');

    const header = `
      <div class="bracket-head">
        <h4>${meta.tournamentName || 'Tournament'} · Progression Map</h4>
        <p>${koMatches.length
            ? 'Group matches flow into the playoff tree (left → right).'
            : 'League format — flow of matches into the final standings.'}</p>
        ${hasPools ? `<button class="btn-view" style="margin-top:0.4rem;" onclick="viewPools()">👥 View Pools</button>` : ''}
      </div>`;

    const groupFlow = buildGroupFlow(groupMatches);

    // No playoffs → flowchart map only (arrows).
    if (!koMatches.length) {
        return `<div class="tree-view">${header}${groupFlow}</div>`;
    }

    // Playoffs present → group flow + a real playoff tree.
    const playoffTree = buildPlayoffTree(koMatches);
    return `
      <div class="tree-view">
        ${header}
        ${groupFlow}
        ${groupMatches.length ? '<div class="flow-arrow-down" aria-hidden="true">▼ top teams qualify ▼</div>' : ''}
        <div class="playoff-tree-label">Playoff Tree</div>
        ${playoffTree}
        <div class="bracket-legend">
          <span class="match-box is-live legend">Scheduled / in progress</span>
          <span class="match-box is-done legend">Completed</span>
        </div>
      </div>`;
}

// ─── Pools panel (shown from the Tree view "View Pools" button) ───
async function viewPools(nameArg) {
    const sel = document.getElementById('schedule-tournament');
    const name = nameArg || (sel ? sel.value : '');
    if (!name) return;
    let pools = null, matches = [];
    // Always fetch the tournament's matches so pool fixtures render even when
    // the pools modal is opened from the tournaments list (not the board).
    try {
        const mres = await authFetch(`${API}/api/matches?tournamentName=${encodeURIComponent(name)}`);
        matches = await mres.json();
    } catch { matches = scheduleMatchesCache || []; }
    try {
        const res = await authFetch(`${API}/api/tournaments/${encodeURIComponent(name)}/bracket`);
        const data = await res.json();
        pools = data.pools || null;
    } catch { /* fall back to deriving from matches */ }
    if (!pools) {
        pools = {};
        matches.forEach(m => {
            if (m.matchGroup === 'Pool A' || m.matchGroup === 'Pool B') {
                (pools[m.matchGroup] ||= new Set());
                [m.team1Name, m.team2Name].forEach(t => { if (t && t !== 'TBD') pools[m.matchGroup].add(t); });
            }
        });
        Object.keys(pools).forEach(k => pools[k] = [...pools[k]]);
    }
    const keys = Object.keys(pools).sort();
    if (!keys.length) { showToast('This tournament has no pools.', 'info'); return; }
    const poolMatches = (grp) => matches.filter(m => m.matchGroup === grp && isGroupMatch(m));
    const body = document.getElementById('pools-body');
    body.innerHTML = keys.map(k => `
        <div class="pool-card">
          <div class="pool-card-title">${k}</div>
          <div class="pool-teams">
            ${(pools[k] || []).map(t => `<span class="pool-team">${getTeamFlag(t, 18)} ${shortTeamName(t)}</span>`).join('') || '<em class="text-muted">No teams</em>'}
          </div>
          <div class="pool-matches">
            ${poolMatches(k).map(matchBoxHTML).join('') || '<em class="text-muted">No matches</em>'}
          </div>
        </div>`).join('');
    document.getElementById('pools-tournament-name').textContent = `${name} — Pools`;
    document.getElementById('pools-modal').style.display = 'flex';
}

// Hook into existing loadTournaments
const _origLoadTournaments = typeof loadTournaments === 'function' ? loadTournaments : null;
if (_origLoadTournaments) {
    loadTournaments = async function () {
        await _origLoadTournaments();
        try {
            const res = await authFetch(`${API}/api/tournaments`);
            const data = await res.json();
            await hydrateScheduleSelector(data);
        } catch (e) {
            console.error(e);
        }
    };
}


// ═══════════════════════════════════════════════════════════════════
// TOURNAMENT CREATION WIZARD
// ═══════════════════════════════════════════════════════════════════
let wizardState = {};
function resetWizard() {
    wizardState = {
        step: 1, seriesOrTournament: '', tournamentType: '',
        name: '', format: 'T20', overs: 20, teams: [],
        numMatches: 3,
        scheduleFormat: '',        // e.g. tri-1, quad-cup, tournament-odd-3, tournament-pool-2
        doubleRoundRobin: false,
        usePools: false,
        poolA: [], poolB: [],
        qualificationRules: '',
        schedule: []
    };
}

function getDefaultOvers(format) {
    return { T20: 20, T10: 10, ODI: 50, TEST: 90 }[format] || 20;
}

const TOTAL_WIZ_STEPS = 4;   // Details · Teams · Schedule · Review (squads managed later)

function openWizardModal() {
    resetWizard();
    document.getElementById('wiz-name').value = '';
    document.getElementById('wiz-format').value = 'T20';
    document.querySelectorAll('#wiz-sot-group .filter-btn, #wiz-seriestype-group .filter-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('series-subtype').style.display = 'none';
    document.getElementById('tournament-wizard-modal').style.display = 'flex';
    renderWizardStep();
}
function closeWizardModal() {
    document.getElementById('tournament-wizard-modal').style.display = 'none';
}

function setSeriesOrTournament(val, btn) {
    wizardState.seriesOrTournament = val;
    document.querySelectorAll('#wiz-sot-group .filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const sub = document.getElementById('series-subtype');
    if (val === 'Series') {
        sub.style.display = 'block';
        wizardState.tournamentType = '';
    } else {
        sub.style.display = 'none';
        wizardState.tournamentType = 'Tournament';
        document.querySelectorAll('#wiz-seriestype-group .filter-btn').forEach(b => b.classList.remove('active'));
    }
}
function setTournamentType(val, btn) {
    wizardState.tournamentType = val;
    document.querySelectorAll('#wiz-seriestype-group .filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
}

function updateWizardProgress() {
    const pct = (wizardState.step / TOTAL_WIZ_STEPS) * 100;
    document.getElementById('wizard-progress-bar').style.width = `${pct}%`;
    document.querySelectorAll('.wizard-steps-labels span').forEach(s => {
        s.classList.toggle('wizard-label-active', parseInt(s.dataset.step) === wizardState.step);
    });
}

function renderWizardStep() {
    document.querySelectorAll('#tournament-wizard-modal .wizard-step').forEach(el => el.classList.remove('wizard-active'));
    const panel = document.getElementById(`wizard-step-${wizardState.step}`);
    if (panel) panel.classList.add('wizard-active');
    updateWizardProgress();

    document.getElementById('wizard-back-btn').style.display = wizardState.step > 1 ? 'inline-block' : 'none';
    const isLast = wizardState.step === TOTAL_WIZ_STEPS;
    document.getElementById('wizard-next-btn').style.display = isLast ? 'none' : 'inline-block';
    document.getElementById('wizard-submit-btn').style.display = isLast ? 'inline-block' : 'none';

    if (wizardState.step === 2) populateTeamCheckboxes();
    if (wizardState.step === 3) renderScheduleOptions();
    if (wizardState.step === 4) fetchAndRenderSchedulePreview();
}

function wizardNext() {
    const errors = validateWizardStep(wizardState.step);
    if (errors.length) { showToast(errors[0], 'error'); return; }
    if (wizardState.step < TOTAL_WIZ_STEPS) { wizardState.step++; renderWizardStep(); }
}
function wizardBack() {
    if (wizardState.step > 1) { wizardState.step--; renderWizardStep(); }
}

const TEAM_LIMITS = {
    Bilateral: { min: 2, max: 2 }, Tri: { min: 3, max: 3 },
    Quad: { min: 4, max: 4 }, Tournament: { min: 5, max: 20 }
};

function validateWizardStep(step) {
    const e = [];
    const lim = TEAM_LIMITS[wizardState.tournamentType] || { min: 2, max: 20 };
    if (step === 1) {
        if (!wizardState.name.trim()) e.push('Tournament name is required.');
        if (!wizardState.tournamentType) e.push('Please select a tournament / series type.');
        if (!wizardState.format) e.push('Please select a match format.');
    } else if (step === 2) {
        if (wizardState.teams.length < lim.min) e.push(`${wizardState.tournamentType} requires ${lim.min === lim.max ? 'exactly' : 'at least'} ${lim.min} teams.`);
        if (wizardState.teams.length > lim.max) e.push(`Maximum ${lim.max} teams allowed for ${wizardState.tournamentType}.`);
    } else if (step === 3) {
        if (wizardState.tournamentType === 'Bilateral') {
            if (wizardState.numMatches < 1) e.push('Number of matches must be at least 1.');
        } else if (!wizardState.scheduleFormat) {
            e.push('Please choose a schedule format.');
        }
    } else if (step === 4) {
        if (!wizardState.schedule.length) e.push('Schedule is empty. Go back and choose a format.');
    }
    return e;
}

async function populateTeamCheckboxes() {
    const grid = document.getElementById('wiz-teams-grid');
    const hint = document.getElementById('team-selection-hint');
    const lim = TEAM_LIMITS[wizardState.tournamentType] || { min: 2, max: 20 };
    hint.textContent = `${wizardState.tournamentType}: select ${lim.min === lim.max ? `exactly ${lim.min}` : `${lim.min}–${lim.max}`} teams.`;
    try {
        const res = await authFetch(`${API}/api/teams`);
        const teams = (await res.json()).filter(t => t.teamName !== 'TBD');
        grid.innerHTML = teams.map(t => {
            const sel = wizardState.teams.includes(t.teamName) ? 'selected' : '';
            return `<label class="team-checkbox-card ${sel}" data-team="${t.teamName.replace(/"/g,'&quot;')}">
                <input type="checkbox" ${sel ? 'checked' : ''} value="${t.teamName.replace(/"/g,'&quot;')}" onchange="toggleWizTeam(this)">
                <span class="team-flag">${getTeamFlag(t.teamName, 20)}</span>
                <span class="team-label">${shortTeamName(t.teamName)}</span>
            </label>`;
        }).join('');
        document.getElementById('team-count').textContent = wizardState.teams.length;
    } catch { showToast('Failed to load teams', 'error'); }
}
function toggleWizTeam(cb) {
    const name = cb.value;
    const card = cb.closest('.team-checkbox-card');
    if (cb.checked) {
        if (!wizardState.teams.includes(name)) wizardState.teams.push(name);
        card.classList.add('selected');
    } else {
        wizardState.teams = wizardState.teams.filter(t => t !== name);
        card.classList.remove('selected');
    }
    document.getElementById('team-count').textContent = wizardState.teams.length;
}

// ─── Step 3: schedule format decision tree ───
function scheduleFormatCards() {
    const type = wizardState.tournamentType;
    const n = wizardState.teams.length;
    const g1 = n * (n - 1) / 2;               // single round robin group matches
    const g2 = n * (n - 1);                   // double
    if (type === 'Tri') {
        return [
            { code: 'tri-1', title: 'Single Round Robin + Final', desc: '3 group matches, top 2 meet in the Final', count: '4 matches' },
            { code: 'tri-2', title: 'Double Round Robin + Final', desc: '6 group matches, top 2 meet in the Final', count: '7 matches' }
        ];
    }
    if (type === 'Quad') {
        return [
            { code: 'quad-cup', title: 'Cup / Knockout', desc: '2 semis + play-off + final', count: '5 matches' },
            { code: 'quad-rr-top2', title: 'Round Robin + Final', desc: 'Everyone plays; top 2 reach the Final', count: 'rr', rr: true },
            { code: 'quad-rr-playoff', title: 'Round Robin + Play-off + Final', desc: '2nd vs 3rd play-off, winner meets 1st', count: 'rr', rr: true }
        ];
    }
    // Tournament (5+)
    if (wizardState.usePools) {
        const perPool = Math.floor(n / 2);
        const pg = perPool * (perPool - 1) / 2 * 2;
        return [
            { code: 'tournament-pool-1', title: 'Pool Winners Final', desc: 'Two pools; pool winners meet in the Final', count: 'rr', rr: true },
            { code: 'tournament-pool-2', title: 'Cross-Pool Semi-Finals', desc: '1A v 2B & 1B v 2A semis, then Final', count: 'rr', rr: true },
            { code: 'tournament-pool-3', title: 'Super-4 Style', desc: '1st-place match + 2nd-place play-off + Final', count: 'rr', rr: true }
        ];
    }
    return [
        { code: 'tournament-rr', title: 'League Only', desc: 'Full round robin, winner by points (no knockout)', count: 'rr', rr: true },
        { code: 'tournament-odd-1', title: 'League + Final', desc: 'Round robin, top 2 reach the Final', count: 'rr', rr: true },
        { code: 'tournament-odd-2', title: 'League + Play-off + Final', desc: '2nd vs 3rd play-off, winner meets 1st', count: 'rr', rr: true },
        { code: 'tournament-odd-3', title: 'League + Playoffs (IPL style)', desc: 'Qualifier 1, Eliminator, Qualifier 2, Final', count: 'rr', rr: true }
    ];
}

function renderScheduleOptions() {
    const type = wizardState.tournamentType;
    const isBilateral = type === 'Bilateral';
    const n = wizardState.teams.length;
    document.getElementById('bilateral-controls').style.display = isBilateral ? 'block' : 'none';
    document.getElementById('multiteam-controls').style.display = isBilateral ? 'none' : 'block';
    const poolWrap = document.getElementById('pool-toggle-wrap');
    if (poolWrap) {
        const eligible = type === 'Tournament' && n >= 6 && n % 2 === 0;
        poolWrap.style.display = eligible ? 'flex' : 'none';
        if (!eligible) wizardState.usePools = false;
        const pcb = document.getElementById('wiz-use-pools');
        if (pcb) pcb.checked = wizardState.usePools;
    }
    if (isBilateral) { updateMatchCountPreview(); return; }

    const cards = scheduleFormatCards();
    if (!cards.some(c => c.code === wizardState.scheduleFormat)) wizardState.scheduleFormat = '';
    const showDouble = cards.some(c => c.rr) ;
    document.getElementById('double-rr-wrap').style.display = showDouble ? 'flex' : 'none';
    const drr = document.getElementById('wiz-double-rr');
    if (drr) drr.checked = wizardState.doubleRoundRobin;

    const grid = document.getElementById('schedule-format-grid');
    grid.innerHTML = cards.map(c => {
        const active = wizardState.scheduleFormat === c.code ? 'selected' : '';
        return `<div class="fmt-card ${active}" onclick="selectScheduleFormat('${c.code}', this)">
            <strong>${c.title}</strong>
            <small>${c.desc}</small>
        </div>`;
    }).join('');
    updateMatchCountPreview();
}

function selectScheduleFormat(code, el) {
    wizardState.scheduleFormat = code;
    document.querySelectorAll('#schedule-format-grid .fmt-card').forEach(c => c.classList.remove('selected'));
    if (el) el.classList.add('selected');
    updateMatchCountPreview();
}

function toggleDoubleRR(cb) { wizardState.doubleRoundRobin = cb.checked; updateMatchCountPreview(); }
function toggleUsePools(cb) { wizardState.usePools = cb.checked; wizardState.scheduleFormat = ''; renderScheduleOptions(); }

function updateMatchCountPreview() {
    const el = document.getElementById('match-count-preview');
    if (!el) return;
    const n = wizardState.teams.length;
    if (wizardState.tournamentType === 'Bilateral') {
        el.textContent = `${wizardState.numMatches} match${wizardState.numMatches > 1 ? 'es' : ''} in the series.`;
        return;
    }
    if (!wizardState.scheduleFormat) { el.textContent = 'Select a format to preview the number of matches.'; return; }
    const dbl = wizardState.doubleRoundRobin ? 2 : 1;
    const rr = n * (n - 1) / 2 * dbl;
    const map = {
        'tri-1': '3 group + 1 final = 4 matches',
        'tri-2': '6 group + 1 final = 7 matches',
        'quad-cup': '2 semis + 1 play-off + 1 final = 5 matches',
        'quad-rr-top2': `${6 * dbl} group + 1 final = ${6 * dbl + 1} matches`,
        'quad-rr-playoff': `${6 * dbl} group + 1 play-off + 1 final = ${6 * dbl + 2} matches`,
        'tournament-rr': `${rr} league matches (no knockout)`,
        'tournament-odd-1': `${rr} group + 1 final = ${rr + 1} matches`,
        'tournament-odd-2': `${rr} group + 1 play-off + 1 final = ${rr + 2} matches`,
        'tournament-odd-3': `${rr} group + 4 playoff matches = ${rr + 4} matches`,
    };
    if (wizardState.scheduleFormat.startsWith('tournament-pool')) {
        const per = Math.floor(n / 2);
        const pg = per * (per - 1) / 2 * 2 * dbl;
        const extra = wizardState.scheduleFormat === 'tournament-pool-1' ? 1 : 3;
        el.textContent = `${pg} pool + ${extra} knockout = ${pg + extra} matches`;
        return;
    }
    el.textContent = map[wizardState.scheduleFormat] || '';
}

function _computePools() {
    const a = [], b = [];
    wizardState.teams.forEach((t, i) => (i % 2 === 0 ? a : b).push(t));
    return { a, b };
}

async function fetchAndRenderSchedulePreview() {
    try {
        const body = {
            teams: wizardState.teams, tournamentType: wizardState.tournamentType,
            format: wizardState.format, scheduleFormat: wizardState.scheduleFormat,
            numMatches: wizardState.numMatches, doubleRoundRobin: wizardState.doubleRoundRobin
        };
        if (wizardState.usePools) {
            const { a, b } = _computePools();
            body.poolA = a; body.poolB = b;
        }
        const res = await authFetch(`${API}/api/tournaments/preview-schedule`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) { showToast(data.error || 'Failed to generate schedule', 'error'); return; }
        wizardState.schedule = data.fixtures || [];
        renderScheduleReviewTable(data);
    } catch { showToast('Failed to generate schedule', 'error'); }
}

function renderScheduleReviewTable(meta) {
    const tbody = document.getElementById('schedule-preview-tbody');
    tbody.innerHTML = wizardState.schedule.map((f, i) => `
        <tr>
          <td>${f.sequenceNumber ?? (i + 1)}</td>
          <td>${f.team1Name === 'TBD' ? '<em class="text-muted">TBD</em>' : shortTeamName(f.team1Name)}</td>
          <td class="text-center text-muted">vs</td>
          <td>${f.team2Name === 'TBD' ? '<em class="text-muted">TBD</em>' : shortTeamName(f.team2Name)}</td>
          <td><span class="badge badge-t20" style="text-transform:none;">${f.matchType}</span></td>
          <td>${f.matchGroup || '—'}</td>
          <td><input type="date" class="fixture-date-input" value="${f.matchDate === 'TBD' ? '' : (f.matchDate || '')}"
              onchange="wizardState.schedule[${i}].matchDate = this.value || 'TBD'"></td>
        </tr>`).join('');
    const summ = document.getElementById('schedule-preview-summary');
    if (summ && meta) {
        summ.textContent = `${meta.total} matches total · ${meta.groupStage} group/league · ${meta.knockouts} knockout`;
    }
}

async function submitTournamentWizard() {
    const errors = validateWizardStep(4);
    if (errors.length) { showToast(errors[0], 'error'); return; }
    wizardState.qualificationRules = (document.getElementById('wiz-qual-rules')?.value || '').trim();
    const payload = {
        tournamentName: wizardState.name, format: wizardState.format,
        overs: wizardState.overs || getDefaultOvers(wizardState.format),
        tournamentType: wizardState.tournamentType, teams: wizardState.teams,
        scheduleFormat: wizardState.scheduleFormat, schedule: wizardState.schedule,
        qualificationRules: wizardState.qualificationRules, squads: {},
        // Send the exact format parameters so the backend can regenerate the
        // fixtures authoritatively (guarantees the right number of matches,
        // including playoffs/semis/final, for the chosen format).
        numMatches: wizardState.numMatches,
        doubleRoundRobin: wizardState.doubleRoundRobin
    };
    if (wizardState.usePools) {
        const { a, b } = _computePools();
        payload.poolA = a; payload.poolB = b;
    }
    const btn = document.getElementById('wizard-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
    try {
        const res = await authFetch(`${API}/api/tournaments/generate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const d = await res.json();
        if (res.ok) {
            showToast(`Tournament created — ${d.matchIds.length} matches scheduled! You can add squads any time.`, 'success');
            if (window.DataSync) DataSync.emit('tournament-created', { name: wizardState.name });
            closeWizardModal();
            await loadTournaments();
            // Offer to set up squads right away
            setTimeout(() => {
                startSquadSelection(payload.tournamentName, payload.teams);
            }, 400);
        } else {
            showToast(d.error || 'Failed to create tournament', 'error');
        }
    } catch { showToast('Network error', 'error'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = 'Create Tournament'; } }
}

// ═══════════════════════════════════════════════════════════════
// POST-CREATION EDITING — details, teams, schedule (updatable later)
// ═══════════════════════════════════════════════════════════════
let editingTournament = null;

async function openEditDetails(name) {
    editingTournament = name;
    try {
        const res = await authFetch(`${API}/api/tournaments`);
        const t = (await res.json()).find(x => x.tournamentName === name) || {};
        document.getElementById('edit-det-title').textContent = `Edit — ${name}`;
        document.getElementById('edit-det-format').value = t.format || 'T20';
        document.getElementById('edit-det-overs').value = t.overs || getDefaultOvers(t.format || 'T20');
        document.getElementById('edit-det-qual').value = t.qualificationRules || '';
        document.getElementById('edit-details-modal').style.display = 'flex';
    } catch { showToast('Failed to load tournament', 'error'); }
}
function closeEditDetails() { document.getElementById('edit-details-modal').style.display = 'none'; }

async function saveEditDetails() {
    const payload = {
        format: document.getElementById('edit-det-format').value,
        overs: parseInt(document.getElementById('edit-det-overs').value) || undefined,
        qualificationRules: document.getElementById('edit-det-qual').value
    };
    try {
        const res = await authFetch(`${API}/api/tournaments/${encodeURIComponent(editingTournament)}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const d = await res.json();
        if (res.ok) { showToast('Tournament updated', 'success'); closeEditDetails(); loadTournaments(); }
        else showToast(d.error || 'Update failed', 'error');
    } catch { showToast('Network error', 'error'); }
}

async function openEditSchedule(name) {
    editingTournament = name;
    document.getElementById('edit-sched-title').textContent = `Schedule — ${name}`;
    document.getElementById('edit-schedule-modal').style.display = 'flex';
    await renderEditScheduleList();
}
function closeEditSchedule() { document.getElementById('edit-schedule-modal').style.display = 'none'; }

async function renderEditScheduleList() {
    const box = document.getElementById('edit-sched-list');
    try {
        const [mRes, tRes] = await Promise.all([
            authFetch(`${API}/api/matches?tournamentName=${encodeURIComponent(editingTournament)}`),
            authFetch(`${API}/api/tournaments`)
        ]);
        const matches = await mRes.json();
        const t = (await tRes.json()).find(x => x.tournamentName === editingTournament) || {};
        const teams = ['TBD', ...(t.teams || [])];
        const teamOpts = (sel) => teams.map(tm => `<option value="${tm}" ${tm === sel ? 'selected' : ''}>${tm === 'TBD' ? 'TBD' : shortTeamName(tm)}</option>`).join('');
        const types = ['League','Group-Stage','Semi-Final','Final','Play-off','Quarter-Final','Qualifier-1','Qualifier-2','Eliminator','SF-1','SF-2','SF-Final','3rd-Place-SF','1st-Place-Match','2nd-Place-PO'];
        if (!matches.length) { box.innerHTML = '<p class="modal-hint">No matches yet.</p>'; return; }
        box.innerHTML = matches.map(m => {
            const editable = (m.status === 'Scheduled' || !m.status);
            const statusBadge = m.status === 'Completed' ? '<span class="badge-completed">✓ Done</span>'
                : m.status === 'Live' ? '<span class="badge-live">● Live</span>' : '<span class="badge-scheduled">◷ Scheduled</span>';
            if (!editable) {
                return `<div class="sched-edit-row locked"><span class="sched-seq">#${m.sequenceNumber || m.matchID}</span>
                    <span>${shortTeamName(m.team1Name)} vs ${shortTeamName(m.team2Name)}</span>
                    <span>${m.matchType}</span>${statusBadge}</div>`;
            }
            return `<div class="sched-edit-row" data-mid="${m.matchID}">
                <span class="sched-seq">#${m.sequenceNumber || m.matchID}</span>
                <select class="form-input se-t1">${teamOpts(m.team1Name)}</select>
                <span class="text-muted">vs</span>
                <select class="form-input se-t2">${teamOpts(m.team2Name)}</select>
                <select class="form-input se-type">${types.map(x => `<option ${x === m.matchType ? 'selected' : ''}>${x}</option>`).join('')}</select>
                <input type="date" class="fixture-date-input se-date" value="${m.matchDate && m.matchDate !== 'TBD' ? m.matchDate : ''}">
                <button class="btn-view" onclick="saveSchedRow(${m.matchID}, this)">Save</button>
                <button class="btn-delete" onclick="deleteSchedMatch(${m.matchID})">✕</button>
            </div>`;
        }).join('');
    } catch { box.innerHTML = '<p class="modal-hint">Failed to load matches.</p>'; }
}

async function saveSchedRow(mid, btn) {
    const row = btn.closest('.sched-edit-row');
    const payload = {
        team1Name: row.querySelector('.se-t1').value,
        team2Name: row.querySelector('.se-t2').value,
        matchType: row.querySelector('.se-type').value,
        matchDate: row.querySelector('.se-date').value || 'TBD'
    };
    try {
        const res = await authFetch(`${API}/api/matches/${mid}/schedule`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        const d = await res.json();
        if (res.ok) showToast('Match updated', 'success'); else showToast(d.error || 'Update failed', 'error');
    } catch { showToast('Network error', 'error'); }
}

async function deleteSchedMatch(mid) {
    if (!await customConfirm('Delete this scheduled match?')) return;
    try {
        const res = await authFetch(`${API}/api/matches/${mid}`, { method: 'DELETE' });
        if (res.ok) { showToast('Match removed', 'success'); renderEditScheduleList(); loadTournaments(); }
        else showToast('Delete failed', 'error');
    } catch { showToast('Network error', 'error'); }
}

async function addSchedMatch() {
    const type = document.getElementById('add-sched-type').value;
    const payload = { schedule: [{ team1Name: 'TBD', team2Name: 'TBD', matchType: type, matchDate: 'TBD' }] };
    try {
        const res = await authFetch(`${API}/api/tournaments/${encodeURIComponent(editingTournament)}/schedule`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        const d = await res.json();
        if (res.ok) { showToast('Match added', 'success'); renderEditScheduleList(); loadTournaments(); }
        else showToast(d.error || 'Add failed', 'error');
    } catch { showToast('Network error', 'error'); }
}

// Cross-tab sync for new tournament / activated match events
if (window.DataSync) {
    DataSync.on('tournament-created', () => loadTournaments());
    DataSync.on('match-activated', () => loadTournaments());
}
