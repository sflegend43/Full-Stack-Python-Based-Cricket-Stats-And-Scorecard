// matches.js — CricketStats Pro | Matches Page + Ball-by-Ball Entry

const API = 'http://localhost:5001';

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
        const res = await fetch(`${API}/api/matches`);
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
                <button class="btn-delete" onclick="deleteMatch(${m.matchID})">🗑</button>
            </td>
        </tr>`;
    }).join('');
}

// ── Scorecard view ──────────────────────────────────────
async function viewScorecard(matchId) {
    try {
        const res  = await fetch(`${API}/api/stats/scorecard/${matchId}`);
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
    renderXITable('xi-body', data.playingXI || []);
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
        const overs = r.balls ? Math.floor(r.balls / 6) + '.' + (r.balls % 6) : '0';
        const econ  = r.balls ? ((r.runs / r.balls) * 6).toFixed(2) : '0.00';
        return `<tr>
            <td><strong>${r.playerName}</strong></td>
            <td>${overs}</td>
            <td>${r.runs}</td>
            <td><strong style="color:var(--red-ball-light);">${r.wickets}</strong></td>
            <td>${r.extras}</td>
            <td style="color:var(--text-muted);">${econ}</td>
        </tr>`;
    }).join('');
}

function renderXITable(tbId, rows) {
    const tb = document.getElementById(tbId);
    if (!tb) return;
    if (!rows.length) {
        tb.innerHTML = `<tr><td colspan="4" class="empty-state">No Playing XI data.</td></tr>`;
        return;
    }
    const cls = { Batsman:'badge-batsman', Bowler:'badge-bowler', AllRounder:'badge-allrounder', WicketKeeper:'badge-keeper' };
    tb.innerHTML = rows.map(r => `<tr>
        <td><strong>${r.playerName}</strong></td>
        <td style="font-size:0.8rem;">${r.playerNationality || '—'}</td>
        <td><span class="badge ${cls[r.playerRole]||'badge-batsman'}">${r.playerRole}</span></td>
        <td><span class="badge badge-odi">${r.matchRole}</span></td>
    </tr>`).join('');
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
async function deleteMatch(mid) {
    if (!confirm(`Delete Match #${mid}? All ball-by-ball data will also be removed.`)) return;
    try {
        const res = await fetch(`${API}/api/matches/${mid}`, { method: 'DELETE' });
        if (res.ok) { showToast(`Match #${mid} deleted.`); await loadMatches(); }
        else { const d = await res.json(); showToast(d.error || 'Delete failed', 'error'); }
    } catch { showToast('Server error.', 'error'); }
}

// ── Add Match ────────────────────────────────────────────
async function populateSelectDropdowns() {
    try {
        const [teams, venues, umpires, tournaments] = await Promise.all([
            fetch(`${API}/api/teams`).then(r => r.json()),
            fetch(`${API}/api/venues`).then(r => r.json()),
            fetch(`${API}/api/umpires`).then(r => r.json()),
            fetch(`${API}/api/tournaments`).then(r => r.json())
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
        const res = await fetch(`${API}/api/tournaments/${encodeURIComponent(tournamentName)}/squad`);
        const squads = await res.json();
        
        const squad1 = squads[t1] || [];
        const squad2 = squads[t2] || [];
        
        const xi1 = document.getElementById('m-team1-xi');
        const xi2 = document.getElementById('m-team2-xi');
        
        if (squad1.length === 0 || squad2.length === 0) {
            showToast('Warning: One or both teams have no tournament squad assigned.', 'error');
        }

        xi1.innerHTML = squad1.map(p => `
            <label style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.4rem; cursor:pointer;">
                <input type="checkbox" name="team1_xi" value="${p.playerID}" style="accent-color:var(--primary);">
                <span style="color:var(--text); font-size:0.85rem;">${p.playerName} <span style="color:var(--text-muted); font-size:0.75rem;">(${p.playerRole})</span></span>
            </label>
        `).join('');
        
        xi2.innerHTML = squad2.map(p => `
            <label style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.4rem; cursor:pointer;">
                <input type="checkbox" name="team2_xi" value="${p.playerID}" style="accent-color:var(--primary);">
                <span style="color:var(--text); font-size:0.85rem;">${p.playerName} <span style="color:var(--text-muted); font-size:0.75rem;">(${p.playerRole})</span></span>
            </label>
        `).join('');
        
        document.getElementById('wizard-step-2').style.display = 'none';
        document.getElementById('wizard-step-3').style.display = 'block';
    } catch {
        showToast('Failed to load tournament squads', 'error');
    }
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
    
    const team1Xi = team1Cbs.map(cb => cb.value);
    const team2Xi = team2Cbs.map(cb => cb.value);
    
    if(team1Xi.length !== 11 || team2Xi.length !== 11) {
        showToast(`Please select exactly 11 players for each team. (${team1Xi.length} and ${team2Xi.length} selected)`, 'error');
        return;
    }

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
        onFieldUmpire1ID: parseInt(document.getElementById('m-ump1').value),
        onFieldUmpire2ID: parseInt(document.getElementById('m-ump2').value),
    };
    
    try {
        const res = await fetch(`${API}/api/matches`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
        const data = await res.json();
        if (!res.ok) { showToast(data.error || 'Add failed', 'error'); return; }
        
        // Now post Playing XI
        const xiRes = await fetch(`${API}/api/matches/${body.matchID}/xi`, {
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
    } catch { showToast('Server error.', 'error'); }
}

// ═══════════════════════════════════════════════════════
// BALL-BY-BALL ENTRY
// ═══════════════════════════════════════════════════════

async function openBallEntry() {
    if (!beMatchId) { showToast('Open a scorecard first.', 'error'); return; }

    // Fetch current state from server
    try {
        const res  = await fetch(`${API}/api/balls/state/${beMatchId}?innings=${beInnings}`);
        const data = await res.json();

        bePlayers = data.players || [];
        populateBallDropdowns();
        updateScoreboardStrip(data.totalRuns, data.wickets, data.nextOver, data.nextBall);

        // Pre-fill over/ball
        document.getElementById('be-over').value = data.nextOver;
        document.getElementById('be-ball').value = data.nextBall;
    } catch {
        bePlayers = [];
        populateBallDropdowns();
    }

    document.getElementById('ballEntryModal').style.display = 'flex';
    clearBallForm(false); // clear but keep over/ball pre-fill
    updatePreview();
    updateTimeline();
}

function closeBallEntry() {
    document.getElementById('ballEntryModal').style.display = 'none';
}

function populateBallDropdowns() {
    const allOpts     = bePlayers.map(p => `<option value="${p.playerID}">${p.playerName} (${p.playerRole})</option>`).join('');
    const batOpts     = bePlayers.filter(p => p.canBat || true)  // allow any player to bat (captain's call)
                                 .map(p => `<option value="${p.playerID}">${p.playerName}</option>`).join('');
    const bowlOpts    = bePlayers.filter(p => p.canBowl || p.playerRole === 'AllRounder')
                                 .map(p => `<option value="${p.playerID}">${p.playerName} (${p.playerRole})</option>`).join('');
    const fieldOpts   = '<option value="">— Select Fielder —</option>' + allOpts;

    const batSel = document.getElementById('be-batsman');
    if (batSel) batSel.innerHTML  = bePlayers.length ? batOpts  : '<option value="">No players — add Playing XI</option>';

    // bowlers: show all if no XI defined
    const bowlSel = document.getElementById('be-bowler');
    if (bowlSel) bowlSel.innerHTML = bePlayers.length
        ? (bowlOpts || allOpts)
        : '<option value="">No players — add Playing XI</option>';

    const dismissedSel = document.getElementById('be-dismissed');
    if (dismissedSel) dismissedSel.innerHTML = '<option value="">— Same as Striker —</option>' + batOpts;

    const fielderSel = document.getElementById('be-fielder');
    if (fielderSel) fielderSel.innerHTML = fieldOpts;
}

function updateScoreboardStrip(runs, wickets, over, ball) {
    const scoreEl  = document.getElementById('be-score-display');
    const overEl   = document.getElementById('be-over-display');
    const innLabel = document.getElementById('be-innings-label');
    if (scoreEl)  scoreEl.textContent  = `${runs}/${wickets}`;
    if (overEl)   overEl.textContent   = `${over - 1}.${ball - 1}`;
    if (innLabel) innLabel.textContent = beInnings === 1 ? '1st' : '2nd';
}

function switchEntryInnings(inn) {
    beInnings = inn;
    document.getElementById('inn-btn-1').classList.toggle('active', inn === 1);
    document.getElementById('inn-btn-2').classList.toggle('active', inn === 2);
    document.getElementById('be-innings-label').textContent = inn === 1 ? '1st' : '2nd';

    // Reload state for the new innings
    if (beMatchId) {
        fetch(`${API}/api/balls/state/${beMatchId}?innings=${inn}`)
            .then(r => r.json())
            .then(data => {
                document.getElementById('be-over').value = data.nextOver;
                document.getElementById('be-ball').value = data.nextBall;
                updateScoreboardStrip(data.totalRuns, data.wickets, data.nextOver, data.nextBall);
                updateTimeline();
            }).catch(() => {});
    }
    updatePreview();
}

function setDeliveryType(btn) {
    document.querySelectorAll('.del-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    beDelType = btn.dataset.type;

    // Sync extra-type select for Wide/NoBall
    const extraSel = document.getElementById('be-extra-type');
    const note     = document.getElementById('be-extra-note');
    if (beDelType === 'Wide') {
        extraSel.value = '';          // extras still handled separately
        note.style.display = 'block';
    } else if (beDelType === 'NoBall') {
        extraSel.value = '';
        note.style.display = 'block';
    } else {
        note.style.display = 'none';
    }
    updatePreview();
}

function setRuns(btn) {
    document.querySelectorAll('.run-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    beRuns = parseInt(btn.dataset.runs);
    updatePreview();

    // Auto submit if it's a simple delivery
    const isWicket = document.getElementById('be-wicket').checked;
    const extraType = document.getElementById('be-extra-type').value;
    if (!isWicket && extraType === '' && beDelType === 'Normal') {
        submitBall();
    }
}

function onExtraTypeChange() { updatePreview(); }

function onWicketToggle() {
    const checked = document.getElementById('be-wicket').checked;
    document.getElementById('be-wicket-details').style.display = checked ? 'block' : 'none';
    onDismissalChange();
    updatePreview();
}

function onDismissalChange() {
    const type    = document.getElementById('be-dismissal').value;
    const needF   = ['Caught','RunOut','Stumped'].includes(type);
    document.getElementById('be-fielder-row').style.display = needF ? 'block' : 'none';
    updatePreview();
}

function updatePreview() {
    const over       = document.getElementById('be-over')?.value     || '?';
    const ball       = document.getElementById('be-ball')?.value     || '?';
    const batName    = document.getElementById('be-batsman')?.selectedOptions[0]?.text || '—';
    const bowlName   = document.getElementById('be-bowler')?.selectedOptions[0]?.text  || '—';
    const extras     = parseInt(document.getElementById('be-extras')?.value || 0);
    const extraType  = document.getElementById('be-extra-type')?.value || '';
    const isWicket   = document.getElementById('be-wicket')?.checked;
    const dismissal  = document.getElementById('be-dismissal')?.value || '';
    const dismissed  = document.getElementById('be-dismissed')?.selectedOptions[0]?.text || '';

    let deliveryLabel = beDelType === 'Wide' ? 'WIDE' : beDelType === 'NoBall' ? 'NO BALL' : `${over}.${ball}`;
    let runsLabel     = `${beRuns} run${beRuns !== 1 ? 's' : ''}`;
    let extrasLabel   = (beDelType !== 'Normal' ? 1 : 0) + extras;
    let wicketLabel   = isWicket ? ` | ✖ ${dismissal} (${dismissed})` : '';
    let extTypeLabel  = extraType ? ` [${extraType}]` : beDelType !== 'Normal' ? ` [${beDelType}]` : '';

    const preview = `Over ${deliveryLabel} | ${batName} vs ${bowlName} | ${runsLabel}${extrasLabel ? ` + ${extrasLabel} extra${extTypeLabel}` : ''}${wicketLabel}`;
    const pEl = document.getElementById('be-preview');
    if (!pEl) return;
    let s = `O:${document.getElementById('be-over').value} B:${document.getElementById('be-ball').value} | `;
    s += `${beDelType} | Runs: ${beRuns}`;
    const ext = document.getElementById('be-extra-type').value;
    if (ext) s += ` | Extra: ${ext}`;
    if (document.getElementById('be-wicket').checked) {
        s += ` | WICKET: ${document.getElementById('be-dismissal').value}`;
    }
    pEl.textContent = 'Preview: ' + s;
}

let beEditingBallId = null;

async function submitBall() {
    if (!beMatchId) return;

    const over      = parseInt(document.getElementById('be-over').value);
    const ball      = parseInt(document.getElementById('be-ball').value);
    const batsmanID = document.getElementById('be-batsman').value || null;
    const bowlerID  = document.getElementById('be-bowler').value || null;
    const extraT    = document.getElementById('be-extra-type').value;
    const extraR    = parseInt(document.getElementById('be-extras').value || '0');
    
    let totalExtras = extraR;
    let effectiveExtraType = extraT || null;

    if (beDelType === 'Wide' || beDelType === 'NoBall') {
        totalExtras += 1;
        if (!effectiveExtraType) effectiveExtraType = beDelType;
    }

    const isWicket  = document.getElementById('be-wicket').checked;
    const dismissal = document.getElementById('be-dismissal').value;
    const dismissed = document.getElementById('be-dismissed').value || batsmanID;
    const fielder   = document.getElementById('be-fielder').value || null;

    if (!batsmanID) { showToast('Please select a batsman.', 'error'); return; }
    if (!bowlerID)  { showToast('Please select a bowler.',  'error'); return; }

    const body = {
        matchID:           beMatchId,
        inningsNumber:     beInnings,
        overNumber:        over,
        ballNumber:        ball,
        batsmanID,
        bowlerID,
        runsScored:        beRuns,
        extras:            totalExtras,
        extraType:         effectiveExtraType,
        wicketFallen:      isWicket ? 1 : 0,
        dismissedPlayerID: isWicket ? dismissed : null,
        wicketType:        isWicket ? dismissal : null,
        fielderID:         isWicket ? fielder : null,
    };

    try {
        let res, data;
        if (beEditingBallId) {
            res = await fetch(`${API}/api/balls/${beEditingBallId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            data = await res.json();
            if (!res.ok) { showToast(data.error || 'Failed to update ball.', 'error'); return; }
            beEditingBallId = null;
        } else {
            res = await fetch(`${API}/api/balls`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            data = await res.json();
            if (!res.ok) { showToast(data.error || 'Failed to record ball.', 'error'); return; }
        }

        // Play sounds
        if (isWicket) playCrowdSound('wicket');
        else if (beRuns === 4 || beRuns === 6) playCrowdSound('boundary');

        // Update scoreboard strip
        updateScoreboardStrip(data.totalRuns, data.wickets, over, ball + 1);

        // Advance ball counter
        let nextBall = ball + 1;
        let nextOver = over;
        if (beDelType === 'Normal' && nextBall > 6) { nextOver++; nextBall = 1; }
        document.getElementById('be-over').value = nextOver;
        document.getElementById('be-ball').value = nextBall;

        showToast(`Ball ${over}.${ball} recorded! ${data.totalRuns}/${data.wickets}`);

        updateTimeline();

        // Clear form for next ball
        clearBallForm(false);
    } catch {
        showToast('Server error.', 'error');
    }
}

async function updateTimeline() {
    if(!beMatchId) return;
    try {
        const res = await fetch(`${API}/api/balls/${beMatchId}?innings=${beInnings}`);
        const balls = await res.json();
        
        const timeline = document.getElementById('be-timeline');
        if(!timeline) return;
        
        // Get last 6 balls
        const recent = balls.slice(-6);
        timeline.innerHTML = recent.length ? recent.map(b => {
            let cls = 'dot', label = '·';
            if (b.wicketFallen)          { cls = 'wicket'; label = 'W'; }
            else if (b.runsScored === 6) { cls = 'six';    label = '6'; }
            else if (b.runsScored === 4) { cls = 'four';   label = '4'; }
            else if (b.extraType === 'Wide')   { cls = 'wide';   label = 'Wd'; }
            else if (b.extraType === 'NoBall') { cls = 'noball'; label = 'Nb'; }
            else if (b.runsScored > 0)         { cls = 'run';    label = String(b.runsScored); }
            return `<div class="ball-chip ${cls}" title="Over ${b.overNumber}.${b.ballNumber}" style="cursor:pointer;" onclick="confirmDeleteBall(${b.ballID})">${label}</div>`;
        }).join('') : '<span style="color:var(--text-muted); font-size:0.8rem; padding:0.4rem;">No balls in this innings yet.</span>';
    } catch {
        // ignore errors
    }
}

function clearBallForm(resetOverBall = true) {
    // Reset run buttons
    document.querySelectorAll('.run-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.run-btn[data-runs="0"]')?.classList.add('active');
    beRuns = 0;

    // Reset delivery type
    document.querySelectorAll('.del-type-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.del-type-btn[data-type="Normal"]')?.classList.add('active');
    beDelType = 'Normal';

    // Reset extra fields
    const extType = document.getElementById('be-extra-type');
    const extRuns = document.getElementById('be-extras');
    const note    = document.getElementById('be-extra-note');
    if (extType) extType.value = '';
    if (extRuns) extRuns.value = '0';
    if (note)    note.style.display = 'none';

    // Reset wicket
    const wicketCb = document.getElementById('be-wicket');
    const wicketDtl = document.getElementById('be-wicket-details');
    if (wicketCb)  wicketCb.checked = false;
    if (wicketDtl) wicketDtl.style.display = 'none';
    document.getElementById('be-fielder-row').style.display = 'none';

    if (resetOverBall) {
        document.getElementById('be-over').value = 1;
        document.getElementById('be-ball').value = 1;
    }

    updatePreview();
}

async function undoLastBall() {
    if (!beMatchId) return;
    try {
        // Find last ball ID from log
        const res  = await fetch(`${API}/api/balls/${beMatchId}?innings=${beInnings}`);
        const balls = await res.json();
        if (!balls.length) { showToast('No balls to undo.', 'error'); return; }

        const last = balls[balls.length - 1];
        const del  = await fetch(`${API}/api/balls/${last.ballID}`, { method: 'DELETE' });
        const data = await del.json();
        if (!del.ok) { showToast(data.error || 'Undo failed.', 'error'); return; }

        showToast(`Ball ${last.overNumber}.${last.ballNumber} undone.`);
        // Refresh state
        const state = await fetch(`${API}/api/balls/state/${beMatchId}?innings=${beInnings}`).then(r => r.json());
        updateScoreboardStrip(state.totalRuns, state.wickets, state.nextOver, state.nextBall);
        document.getElementById('be-over').value = state.nextOver;
        document.getElementById('be-ball').value = state.nextBall;
        updateTimeline();
    } catch {
        showToast('Server error.', 'error');
    }
}

// ── Ball Log ────────────────────────────────────────────
let beBallLog = [];

async function loadBallLog(matchId, innings = 1) {
    try {
        const res   = await fetch(`${API}/api/balls/${matchId}?innings=${innings}`);
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
            else if (b.extraType === 'Wide')   { cls = 'wide';   label = 'Wd'; }
            else if (b.extraType === 'NoBall') { cls = 'noball'; label = 'Nb'; }
            else if (b.runsScored > 0)         { cls = 'run';    label = String(b.runsScored); }
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
            : `<span class="badge badge-t20">Legal</span>`;

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
            <td style="color:var(--text-muted);">${b.extras || 0}</td>
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
    if (!confirm('Delete this ball? Match scores will be recalculated.')) return;
    try {
        const res  = await fetch(`${API}/api/balls/${ballId}`, { method: 'DELETE' });
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

