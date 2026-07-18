
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

// ── Helpers ─────────────────────────────────────────────
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
        const res = await authFetch(`${API}/api/matches`);
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

function renderScorecard(data) {
    const m = data.match;
    document.getElementById('scorecard-header-box').innerHTML = `
        <div class="scorecard-header">
            <div class="scorecard-team"><h3>${shortTeam(m.team1Name)}</h3><div class="scorecard-runs">${m.team1TotalRuns}/${m.team1TotalWickets}</div></div>
            <div class="scorecard-vs">VS</div>
            <div class="scorecard-team"><h3>${shortTeam(m.team2Name)}</h3><div class="scorecard-runs">${m.team2TotalRuns}/${m.team2TotalWickets}</div></div>
        </div>
        <div style="display:flex; gap:1.2rem; flex-wrap:wrap; margin-bottom:1rem; font-size:0.82rem; color:var(--text-muted);">
            <span>🏆 ${m.tournamentName}</span>
            <span>${fmtBadge(m.matchFormat)}</span>
            <span>📅 ${m.matchDate || '—'}</span>
            ${m.winnerName ? `<span style="color:var(--neon-green); font-weight:700;">🥇 Winner: ${shortTeam(m.winnerName)}</span>` : ''}
            ${m.winMargin  ? `<span>📊 ${m.winMargin}</span>` : ''}
        </div>`;

    renderBatTable('inn1-bat-body', data.innings1Bat);
    renderBatTable('inn2-bat-body', data.innings2Bat);
    renderBowlTable('inn1-bowl-body', data.innings1Bowl);
    renderBowlTable('inn2-bowl-body', data.innings2Bowl);
    renderXIBoxes(data.match.team1Name, data.team1XI || [], data.match.team2Name, data.team2XI || []);
    switchInnings(1);
}

function renderBatTable(tbId, rows) {
    const tb = document.getElementById(tbId);
    if (!tb) return;
    if (!rows || !rows.length) {
        tb.innerHTML = `<tr><td colspan="7" class="empty-state">No batting data.</td></tr>`;
        return;
    }
    tb.innerHTML = rows.map(r => {
        const sr = r.balls ? ((r.runs / r.balls) * 100).toFixed(1) : '0.0';
        return `<tr>
            <td><strong>${r.playerName}</strong></td>
            <td><strong style="color:var(--neon-green);">${r.runs}</strong></td>
            <td>${r.balls}</td>
            <td style="color:var(--gold-bright);">⚡${r.fours}</td>
            <td style="color:var(--red-ball-light);">💥${r.sixes}</td>
            <td style="color:var(--text-muted);">${sr}</td>
            <td style="color:var(--text-muted); font-size:0.78rem;">${r.dismissal || '—'}</td>
        </tr>`;
    }).join('');
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
        return `<tr>
            <td><strong>${r.playerName}</strong></td>
            <td>${overs}</td>
            <td>${r.runsConceded}</td>
            <td><strong style="color:var(--red-ball-light);">${r.wicketsTaken}</strong></td>
            <td>${r.maidens || 0}</td>
            <td style="color:var(--text-muted);">${econ}</td>
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
        
        // Sort rows by role: Batsman > WicketKeeper > AllRounder > Bowler
        const roleOrder = { 'Batsman': 1, 'WicketKeeper': 2, 'AllRounder': 3, 'Bowler': 4 };
        rows.sort((a, b) => (roleOrder[a.playerRole] || 99) - (roleOrder[b.playerRole] || 99));
        
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

        const topOrder = rows.slice(0, 3);
        const remaining = rows.slice(3);
        const middleOrder = remaining.filter(r => r.playerRole === 'Batsman' || r.playerRole === 'WicketKeeper');
        const allRounders = remaining.filter(r => r.playerRole === 'AllRounder');
        const bowlers = remaining.filter(r => r.playerRole === 'Bowler');

        listEl.innerHTML = renderGroup('Openers & Top Order', topOrder) + 
                           renderGroup('Middle Order', middleOrder) + 
                           renderGroup('All-Rounders', allRounders) + 
                           renderGroup('Bowlers', bowlers);
    };

    renderList(team1Rows, list1);
    renderList(team2Rows, list2);
}

function switchInnings(tab) {
    const panels = ['inn1-card','inn2-card','bowl1-card','bowl2-card','xi-card','balllog-card'];
    const tabs   = ['tab-inn1','tab-inn2','tab-bowl1','tab-bowl2','tab-xi','tab-balllog'];
    panels.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    tabs.forEach(id   => { const el = document.getElementById(id); if (el) el.classList.remove('active'); });

    const map    = { 1:'inn1-card', 2:'inn2-card', bowl1:'bowl1-card', bowl2:'bowl2-card', xi:'xi-card', balllog:'balllog-card' };
    const tabMap = { 1:'tab-inn1',  2:'tab-inn2',  bowl1:'tab-bowl1', bowl2:'tab-bowl2', xi:'tab-xi', balllog:'tab-balllog' };

    const el    = document.getElementById(map[tab]);
    const tabEl = document.getElementById(tabMap[tab]);
    if (el)    el.style.display = 'block';
    if (tabEl) tabEl.classList.add('active');

    // Load ball log when that tab is clicked
    if (tab === 'balllog' && beMatchId) loadBallLog(beMatchId, beInnings);
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

        const KNOWN_OPENERS = [
            "Rohit Sharma", "Shubman Gill", "Yashasvi Jaiswal", "Ishan Kishan",
            "Fakhar Zaman", "Saim Ayub", "Imam-ul-Haq", "Babar Azam", "Mohammad Rizwan",
            "David Warner", "Travis Head", "Usman Khawaja", "Mitchell Marsh", "Matt Short",
            "Quinton de Kock", "Temba Bavuma", "Reeza Hendricks", "Ryan Rickelton", 
            "Devon Conway", "Finn Allen", "Will Young", "Tom Latham", "Rachin Ravindra",
            "Jos Buttler", "Phil Salt", "Jonny Bairstow", "Zak Crawley", "Ben Duckett", "Jason Roy",
            "Brandon King", "Kyle Mayers", "Johnson Charles", "Shai Hope", "Kraigg Brathwaite", "Evin Lewis",
            "Pathum Nissanka", "Kusal Mendis", "Dimuth Karunaratne", "Avishka Fernando",
            "Litton Das", "Tanzid Hasan", "Najmul Hossain Shanto", "Tamim Iqbal",
            "Rahmanullah Gurbaz", "Ibrahim Zadran", "Hazratullah Zazai"
        ];

        function buildSquadUI(squad, teamIndex) {
            const categories = {
                'Openers': [],
                'Middle Order': [],
                'AllRounders': [],
                'Spinners': [],
                'Fast Bowlers': []
            };

            squad.forEach(p => {
                const role = p.playerRole || '';
                const bowl = p.bowlingStyle || '';
                const name = p.playerName || '';
                
                if (role === 'Batsman' || role === 'WicketKeeper') {
                    if (KNOWN_OPENERS.includes(name)) {
                        categories['Openers'].push(p);
                    } else {
                        categories['Middle Order'].push(p);
                    }
                } else if (role === 'AllRounder') {
                    categories['AllRounders'].push(p);
                } else if (role === 'Bowler') {
                    if (bowl.includes('Spin') || bowl.includes('Break') || bowl.includes('Orthodox')) {
                        categories['Spinners'].push(p);
                    } else {
                        categories['Fast Bowlers'].push(p);
                    }
                } else {
                    categories['Middle Order'].push(p);
                }
            });

            let html = '';
            const order = ['Openers', 'Middle Order', 'AllRounders', 'Spinners', 'Fast Bowlers'];
            
            order.forEach(cat => {
                const players = categories[cat];
                if (players.length > 0) {
                    html += `<div style="font-size:0.75rem; font-weight:700; color:var(--primary-light); margin-top:0.8rem; margin-bottom:0.4rem; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:0.2rem; text-transform:uppercase;">${cat}</div>`;
                    players.forEach(p => {
                        html += `
                        <label style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.4rem; cursor:pointer;">
                            <input type="checkbox" name="team${teamIndex}_xi" value="${p.playerID}" data-role="${p.playerRole}" data-name="${p.playerName.replace(/"/g, '&quot;')}" style="accent-color:var(--primary);" onchange="updateXICounts()">
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

    const team1Xi = team1Cbs.map(cb => {
        const id = cb.value;
        let role = null;
        if (id === t1c && id === t1wk) role = 'Captain & WK';
        else if (id === t1c) role = 'Captain';
        else if (id === t1wk) role = 'WicketKeeper';
        return { playerID: id, matchRole: role };
    });
    
    const team2Xi = team2Cbs.map(cb => {
        const id = cb.value;
        let role = null;
        if (id === t2c && id === t2wk) role = 'Captain & WK';
        else if (id === t2c) role = 'Captain';
        else if (id === t2wk) role = 'WicketKeeper';
        return { playerID: id, matchRole: role };
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

async function openBallEntry() {
    if (!beMatchId) { showToast('Open a scorecard first.', 'error'); return; }

    try {
        const res  = await authFetch(`${API}/api/balls/state/${beMatchId}?innings=${beInnings}`);
        const data = await res.json();

        bePlayers = data.players || [];
        beDismissedIDs = data.dismissedPlayerIDs || [];
        beBowlerOvers = data.bowlerOvers || {};
        beMaxOversPerBowler = data.maxOversPerBowler;
        beLastOverBowlerID = data.lastOverBowlerID || null;
        populateBallDropdowns();
        
        lsCurrentOver = data.nextOver || 1;
        lsCurrentBall = data.nextBall || 1;

        if (data.battingTeam) currentBattingTeam = data.battingTeam;
        if (data.bowlingTeam) currentBowlingTeam = data.bowlingTeam;

        // Restore the persisted crease context (so batters/bowler auto-appear on reload)
        currentStriker   = data.strikerID   || null;
        currentNonStriker = data.nonStrikerID || null;
        currentBowler    = data.bowlerID    || null;
        // If the restored striker was dismissed, force new batter selection
        pendingNewBatter = currentStriker && beDismissedIDs.includes(currentStriker);
        if (pendingNewBatter) currentStriker = null;
        populateBallDropdowns();

        updateScoreboardStrip(data.totalRuns, data.wickets, lsCurrentOver, lsCurrentBall);

        const battingLabel = document.getElementById('ls-batting-team');
        const bowlingLabel = document.getElementById('ls-bowling-team');
        if (battingLabel) battingLabel.textContent = `🏏 ${shortTeam(currentBattingTeam).toUpperCase()} BATTING`;
        if (bowlingLabel) bowlingLabel.textContent = `🎯 ${shortTeam(currentBowlingTeam).toUpperCase()} BOWLING`;

        // Only prompt for openers when we have no persisted context at all
        if (!currentStriker || !currentBowler) {
            openContextModal('innings_start');
        } else if (pendingNewBatter) {
            openContextModal('wicket');
        }

        lsRefreshStats();
        updateTimeline();
    } catch {
        bePlayers = [];
        populateBallDropdowns();
    }

    document.getElementById('live-scoring-view').style.display = 'flex';
    document.getElementById('list-view').style.display = 'none';
    document.getElementById('scorecard-view').style.display = 'none';
    
    document.getElementById('ls-teams-title').textContent = `Match #${beMatchId} • Innings ${beInnings}`;
}

function closeLiveScoring() {
    document.getElementById('live-scoring-view').style.display = 'none';
    document.getElementById('scorecard-view').style.display = 'block';
    viewScorecard(beMatchId);
}

function populateBallDropdowns() {
    const allOpts  = bePlayers.map(p => `<option value="${p.playerID}">${p.playerName} (${p.playerRole})</option>`).join('');
    const fieldOpts = '<option value="">— Select Fielder —</option>' + allOpts;

    if (document.getElementById('ls-wicket-fielder')) {
        document.getElementById('ls-wicket-fielder').innerHTML = fieldOpts;
    }
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
    const teams = getMatchTeams();
    if (!currentBattingTeam && teams.length > 0) {
        currentBattingTeam = teams[0];
    }
    const bowlingTeam = currentBowlingTeam || teams.find(t => t !== currentBattingTeam) || teams[0];

    // Batters: ALL players from the batting team's XI (any player can bat,
    // including bowlers). Dismissed shown struck-through + disabled.
    // Sorted by role order to match the Playing XI display (renderXIBoxes).
    const roleOrder = { 'Batsman': 1, 'WicketKeeper': 2, 'AllRounder': 3, 'Bowler': 4 };
    const battingTeamPlayers = bePlayers
        .filter(p => p.teamName === currentBattingTeam)
        .sort((a, b) => (roleOrder[a.playerRole] || 99) - (roleOrder[b.playerRole] || 99));

    const batOpts = battingTeamPlayers.map(p => {
        const dismissed = beDismissedIDs.includes(p.playerID);
        const label = p.playerName + (dismissed ? ' (out)' : '');
        return dismissed
            ? `<option value="${p.playerID}" disabled style="text-decoration:line-through; color:#64748b;">${label}</option>`
            : `<option value="${p.playerID}">${label}</option>`;
    }).join('');

    // New-batter-after-wicket list: show ALL batting team players.
    // - Dismissed: struck-through, disabled, "(out)"
    // - Current non-striker at crease: disabled, "(playing)"
    // - Available: selectable
    const newBatterOpts = battingTeamPlayers.map(p => {
        const dismissed = beDismissedIDs.includes(p.playerID);
        const isNonStriker = p.playerID === currentNonStriker;
        if (dismissed) {
            return `<option value="${p.playerID}" disabled style="text-decoration:line-through; color:#64748b;">${p.playerName} (out)</option>`;
        }
        if (isNonStriker) {
            return `<option value="${p.playerID}" disabled style="color:#64748b;">${p.playerName} (playing)</option>`;
        }
        return `<option value="${p.playerID}">${p.playerName}</option>`;
    }).join('');

        // Bowlers: eligible = can bowl + on the bowling side. Ineligible bowlers
        // (just bowled the previous over, or have used up their over quota) are
        // still SHOWN but rendered struck-through and disabled so the user can
        // see why they cannot be selected.
        const quotaTxt = beMaxOversPerBowler != null ? `/${beMaxOversPerBowler}` : '';
        const bowlOpts = bePlayers
            .filter(p => p.teamName === bowlingTeam && p.canBowl)
            .map(p => {
                const legal  = bowlerLegalBalls(p.playerID);
                const ovBowled = Math.floor(legal / 6);
                const balls   = legal % 6;
                const oversTxt = `${ovBowled}.${balls}`;

                let disabled = false, reason = '';
                if ((mode === 'new_over' || mode === 'end_over') && beLastOverBowlerID && p.playerID === beLastOverBowlerID) {
                    disabled = true; reason = ' (bowled last over)';
                } else if (beMaxOversPerBowler != null && ovBowled >= beMaxOversPerBowler) {
                    disabled = true; reason = ' (quota full)';
                }
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
}

async function lsRefreshStats() {
    if (!beMatchId) return;
    try {
        const res = await fetch(`${API}/api/stats/scorecard/${beMatchId}?_t=${Date.now()}`);
        if (!res.ok) return;
        const data = await res.json();
        
        let batList = beInnings === 1 ? data.innings1Bat : data.innings2Bat;
        let bowlList = beInnings === 1 ? data.innings1Bowl : data.innings2Bowl;

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
    } catch(e) {}
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
            html += `<div class="${cls}" title="Over ${b.overNumber}.${b.ballNumber}" onclick="confirmDeleteBall(${b.ballID})">${label}</div>`;
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
    
    let fieldOpts = '<option value="">— Select Fielder —</option>';
    if (bowlingTeam) {
        fieldOpts += bePlayers.filter(p => p.teamName === bowlingTeam).map(p => `<option value="${p.playerID}">${p.playerName}</option>`).join('');
    } else {
        fieldOpts += bePlayers.map(p => `<option value="${p.playerID}">${p.playerName}</option>`).join('');
    }
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

        if (isWicket) {
            pendingNewBatter = true;
            openContextModal('wicket', overEnded);
        } else if (overEnded) {
            openContextModal('new_over');
        } else {
            lsRefreshStats();
        }

        updateTimeline();

        // Auto-refresh ball log if visible
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
    document.getElementById('log-inn-1').classList.toggle('active', inn === 1);
    document.getElementById('log-inn-2').classList.toggle('active', inn === 2);
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

    viz.innerHTML = Object.entries(overs).map(([overNum, bs]) => {
        const chips = bs.map(b => {
            let cls = 'dot', label = '·';
            if (b.wicketFallen)          { cls = 'wicket'; label = 'W'; }
            else if (b.runsScored === 6) { cls = 'six';    label = '6'; }
            else if (b.runsScored === 4) { cls = 'four';   label = '4'; }
            else if (b.extraType === 'Wide') {
                cls = 'wide';
                const total = (b.runsScored || 0) + (b.extras || 0);
                label = total + 'WD';
            } else if (b.extraType === 'NoBall') {
                cls = 'noball';
                const total = (b.runsScored || 0) + (b.extras || 0);
                label = total + 'NB';
            } else if (b.extraType === 'Bye') {
                cls = 'extra'; label = (b.extras || 0) + 'BY';
            } else if (b.extraType === 'LegBye') {
                cls = 'extra'; label = (b.extras || 0) + 'LB';
            } else if (b.extraType === 'Penalty') {
                cls = 'extra'; label = '5PEN';
            } else if (b.runsScored > 0)         { cls = 'run';    label = String(b.runsScored); }
            return `<div class="ball-chip ${cls}" title="Over ${b.overNumber}.${b.ballNumber}: ${b.batsmanName} vs ${b.bowlerName}">${label}</div>`;
        }).join('');
        return `<div class="over-group"><div class="over-group-label">Over ${overNum}</div><div class="over-balls">${chips}</div></div>`;
    }).join('') || '<p style="color:var(--text-muted); font-size:0.85rem;">No balls recorded yet.</p>';
}

function renderBallLogTable(balls) {
    const tb = document.getElementById('ball-log-body');
    if (!balls.length) {
        tb.innerHTML = `<tr><td colspan="8" class="empty-state">No balls recorded yet. Use 🏏 Enter Ball to start scoring.</td></tr>`;
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
                <button class="btn-view" style="font-size:0.75rem; padding:0.3rem 0.6rem; margin-right:0.3rem;" onclick="editBall(${b.ballID})">✏️</button>
                <button class="btn-delete" style="font-size:0.75rem; padding:0.3rem 0.6rem;" onclick="confirmDeleteBall(${b.ballID})">↩</button>
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
