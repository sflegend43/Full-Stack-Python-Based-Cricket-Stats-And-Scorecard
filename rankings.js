// rankings.js — CricketStats Pro | Rankings Logic

const API = 'http://localhost:5001';

function getUser() {
    try { return JSON.parse(localStorage.getItem('cricketUser')); }
    catch { return null; }
}

function logout() {
    localStorage.removeItem('cricketUser');
    window.location.href = 'login.html';
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

document.addEventListener('DOMContentLoaded', () => {
    const user = getUser();
    if (!user) { window.location.href = 'login.html'; return; }

    const nameEl   = document.getElementById('user-name-display');
    const avatarEl = document.getElementById('user-avatar');
    if (nameEl)   nameEl.textContent   = user.fullname || user.email;
    if (avatarEl) avatarEl.textContent = (user.fullname || 'A')[0].toUpperCase();

    loadRankings();

    // Auto-refresh when data changes on other pages
    if (window.DataSync) {
        DataSync.on('ball-recorded', () => loadRankings());
        DataSync.on('match-completed', () => loadRankings());
        DataSync.on('data-changed', () => loadRankings());
    }
});

async function loadRankings() {
    const formatFilter = document.getElementById('format-filter').value;
    const q = formatFilter ? `?format=${encodeURIComponent(formatFilter)}` : '';
    
    try {
        const [teamsRes, playersRes] = await Promise.all([
            fetch(`${API}/api/rankings/teams${q}`),
            fetch(`${API}/api/rankings/players${q}`)
        ]);
        
        const teams = await teamsRes.json();
        const players = await playersRes.json();
        
        renderTeamRankings(teams);
        renderPlayerRankings(players);
    } catch (err) {
        console.error('Failed to load rankings:', err);
    }
}

function renderTeamRankings(teams) {
    const tb = document.getElementById('team-rankings');
    if (!teams.length) {
        tb.innerHTML = `<tr><td colspan="4" class="empty-state">No team data available.</td></tr>`;
        return;
    }
    
    tb.innerHTML = teams.map((t, idx) => {
        let rankColor = 'var(--text)';
        if (idx === 0) rankColor = 'var(--gold)';
        else if (idx === 1) rankColor = '#e2e8f0'; // silver
        else if (idx === 2) rankColor = '#b45309'; // bronze
        
        return `<tr>
            <td><strong style="color:${rankColor}; font-size: 1.2rem;">#${idx + 1}</strong></td>
            <td><strong>${t.teamName.replace(' Cricket Team', '')}</strong></td>
            <td>${t.matchesPlayed}</td>
            <td><strong style="color:var(--primary-light)">${t.wins}</strong></td>
        </tr>`;
    }).join('');
}

function renderPlayerRankings(players) {
    const tb = document.getElementById('player-rankings');
    if (!players.length) {
        tb.innerHTML = `<tr><td colspan="5" class="empty-state">No player data available.</td></tr>`;
        return;
    }
    
    tb.innerHTML = players.map((p, idx) => {
        let rankColor = 'var(--text)';
        if (idx === 0) rankColor = 'var(--gold)';
        else if (idx === 1) rankColor = '#e2e8f0'; // silver
        else if (idx === 2) rankColor = '#b45309'; // bronze
        
        return `<tr>
            <td><strong style="color:${rankColor}; font-size: 1.2rem;">#${idx + 1}</strong></td>
            <td><strong>${p.playerName}</strong></td>
            <td>${fmtRole(p.playerRole)}</td>
            <td><strong style="color:var(--primary-light)">${p.totalRuns || 0}</strong></td>
            <td><strong style="color:var(--red-ball-light)">${p.totalWickets || 0}</strong></td>
        </tr>`;
    }).join('');
}
