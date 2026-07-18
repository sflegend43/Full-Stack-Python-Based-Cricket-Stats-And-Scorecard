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

document.addEventListener('DOMContentLoaded', () => {
    const user = getUser();
    if (!user) { window.location.href = 'login.html'; return; }
    
    const nameEl   = document.getElementById('user-name-display');
    const avatarEl = document.getElementById('user-avatar');
    if (nameEl)   nameEl.textContent   = user.fullname || user.email;
    if (avatarEl) avatarEl.textContent = (user.fullname || 'A')[0].toUpperCase();
    
    // initSpeechRecognition() is removed.
});

let chartInstance = null;

function onStatTypeChange() {
    const type = document.getElementById('stat-type').value;
    const groups = document.querySelectorAll('.stat-input-group');
    groups.forEach(g => g.style.display = 'none');
    
    if (type === 'player') {
        document.getElementById('input-player').style.display = 'block';
    } else if (type === 'h2h') {
        document.getElementById('input-team1').style.display = 'block';
        document.getElementById('input-team2').style.display = 'block';
    } else if (type === 'pvp') {
        document.getElementById('input-batsman').style.display = 'block';
        document.getElementById('input-bowler').style.display = 'block';
    } else if (type === 'pvt') {
        document.getElementById('input-player').style.display = 'block'; // recycle player input
        document.getElementById('input-team1').style.display = 'block';  // recycle team input
    }
}

async function submitStatsQuery(e) {
    e.preventDefault();
    document.getElementById('results-container').style.display = 'block';
    hideCards();
    
    showToast('Fetching stats...', 'success');
    const type = document.getElementById('stat-type').value;
    
    if (type === 'player') {
        const name = document.getElementById('stat-player-name').value.trim();
        if(name) await fetchPlayerStats(name);
    } else if (type === 'h2h') {
        const t1 = document.getElementById('stat-team1').value.trim();
        const t2 = document.getElementById('stat-team2').value.trim();
        if(t1 && t2) await fetchH2H(t1, t2);
    } else if (type === 'pvp') {
        const bat = document.getElementById('stat-batsman').value.trim();
        const bowl = document.getElementById('stat-bowler').value.trim();
        if(bat && bowl) await fetchPvP(bat, bowl);
    } else if (type === 'pvt') {
        const player = document.getElementById('stat-player-name').value.trim();
        const team = document.getElementById('stat-team1').value.trim();
        if(player && team) await fetchPvT(player, team);
    }
}

function hideCards() {
    document.getElementById('player-stats-card').style.display = 'none';
    document.getElementById('generic-stats-card').style.display = 'none';
}

function showGenericResult(title, text) {
    document.getElementById('generic-stats-title').textContent = title;
    document.getElementById('generic-stats-text').textContent = text;
    document.getElementById('generic-stats-card').style.display = 'block';
}

async function fetchPlayerStats(name) {
    try {
        const res = await fetch(`${API}/api/stats/player?name=${encodeURIComponent(name)}`);
        const data = await res.json();
        
        if (!res.ok) {
            showGenericResult(`Could not find player: ${name}`, data.error);
            return;
        }
        
        document.getElementById('player-stats-title').textContent = `${data.player} - Stats Overview`;
        
        const tb = document.getElementById('player-recent-tbody');
        if (data.recent.length === 0) {
            tb.innerHTML = '<tr><td colspan="2" class="empty-state">No recent matches found.</td></tr>';
        } else {
            tb.innerHTML = data.recent.map(r => `<tr><td>${r.matchDate || 'Unknown'}</td><td><strong style="color:var(--neon-green);">${r.runs}</strong></td></tr>`).join('');
        }
        
        // Render Chart
        const ctx = document.getElementById('player-year-chart').getContext('2d');
        if (chartInstance) chartInstance.destroy();
        
        const labels = data.yearly.map(y => y.year);
        const runs = data.yearly.map(y => y.runs);
        
        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Runs per Year',
                    data: runs,
                    borderColor: '#22c55e',
                    backgroundColor: 'rgba(34,197,94,0.2)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.1)' } },
                    x: { ticks: { color: '#9ca3af' }, grid: { display: false } }
                }
            }
        });
        
        document.getElementById('player-stats-card').style.display = 'block';
        
    } catch { showToast('Network Error', 'error'); }
}

async function fetchH2H(t1, t2) {
    try {
        const res = await fetch(`${API}/api/stats/h2h?team1=${encodeURIComponent(t1)}&team2=${encodeURIComponent(t2)}`);
        const data = await res.json();
        if (!res.ok) { showGenericResult('Error', data.error); return; }
        
        let msg = `${t1.toUpperCase()}: ${data[t1] || 0} Wins<br>${t2.toUpperCase()}: ${data[t2] || 0} Wins<br>Draws/No Result: ${data.draw || 0}`;
        showGenericResult(`Head to Head: ${t1.toUpperCase()} vs ${t2.toUpperCase()}`, '');
        document.getElementById('generic-stats-text').innerHTML = msg;
    } catch { showToast('Network Error', 'error'); }
}

async function fetchPvP(bat, bowl) {
    try {
        const res = await fetch(`${API}/api/stats/player_vs_player?batsman=${encodeURIComponent(bat)}&bowler=${encodeURIComponent(bowl)}`);
        const data = await res.json();
        if (!res.ok) { showGenericResult('Error', data.error); return; }
        
        let msg = `Balls Faced: ${data.balls}<br>Runs Scored: <span style="color:var(--neon-green);">${data.runs}</span><br>Dismissals: <span style="color:var(--red-ball-light);">${data.dismissals}</span>`;
        showGenericResult(`${bat.toUpperCase()} vs ${bowl.toUpperCase()}`, '');
        document.getElementById('generic-stats-text').innerHTML = msg;
    } catch { showToast('Network Error', 'error'); }
}

async function fetchPvT(player, team) {
    try {
        const res = await fetch(`${API}/api/stats/player_vs_team?player=${encodeURIComponent(player)}&team=${encodeURIComponent(team)}`);
        const data = await res.json();
        if (!res.ok) { showGenericResult('Error', data.error); return; }
        
        let msg = `Total Runs Scored: <span style="color:var(--neon-green);">${data.runs}</span>`;
        showGenericResult(`${player.toUpperCase()} against ${team.toUpperCase()}`, '');
        document.getElementById('generic-stats-text').innerHTML = msg;
    } catch { showToast('Network Error', 'error'); }
}
