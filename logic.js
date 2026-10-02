// logic.js — CricketStats Pro | Dashboard Logic

const API = 'http://localhost:5001';

function getUser() {
    try { return JSON.parse(localStorage.getItem('cricketUser')); }
    catch { return null; }
}

async function authFetch(url, options = {}) {
    const user = getUser();
    const headers = options.headers || {};
    if (user && user.token) headers['Authorization'] = `Bearer ${user.token}`;
    return fetch(url, { ...options, headers });
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

function fmtFormat(fmt) {
    const map = { T20: 'badge-t20', ODI: 'badge-odi', TEST: 'badge-test', T10: 'badge-t10' };
    return `<span class="badge ${map[fmt] || 'badge-t20'}">${fmt || '—'}</span>`;
}

function shortTeam(name) {
    if (!name) return '—';
    return String(name).replace(' Cricket Team', '');
}

function esc(v) {
    return String(v ?? '')
        .replace(/&/g, '&' + 'amp;')
        .replace(/</g, '&' + 'lt;')
        .replace(/>/g, '&' + 'gt;')
        .replace(/"/g, '&' + 'quot;');
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function statusBadge(status) {
    const s = (status || 'upcoming').toLowerCase();
    const cls = s === 'running' ? 'status-running' : s === 'completed' ? 'status-finished' : 'status-upcoming';
    const label = s === 'completed' ? 'Finished' : s.charAt(0).toUpperCase() + s.slice(1);
    return `<span class="status-pill ${cls}">${label}</span>`;
}

function progressBar(done, total) {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return `
      <div class="progress-track" title="${done}/${total} matches">
        <div class="progress-fill" style="width:${pct}%"></div>
      </div>
      <div class="progress-meta">${done}/${total} matches · ${pct}%</div>`;
}

document.addEventListener('DOMContentLoaded', async () => {
    const user = getUser();
    if (!user) { window.location.href = 'login.html'; return; }

    const nameEl = document.getElementById('user-name-display');
    const avatarEl = document.getElementById('user-avatar');
    if (nameEl) nameEl.textContent = user.fullname || user.email;
    if (avatarEl) avatarEl.textContent = (user.fullname || 'A')[0].toUpperCase();

    try { await fetch(`${API}/api/seed`, { method: 'POST' }); } catch { /* ignore */ }

    await Promise.all([
        loadTournamentDashboard(),
        loadRecentMatches(),
        refreshAIInsight()
    ]);
});

if (window.DataSync) {
    DataSync.on('ball-recorded', refreshDashboard);
    DataSync.on('match-completed', refreshDashboard);
    DataSync.on('match-created', refreshDashboard);
    DataSync.on('data-changed', refreshDashboard);
}

function refreshDashboard() {
    loadTournamentDashboard();
    loadRecentMatches();
    refreshAIInsight();
}

async function refreshAIInsight() {
    try {
        const res = await fetch(`${API}/api/stats/ai-insight`);
        if (!res.ok) return;
        const data = await res.json();
        const el = document.getElementById('ai-insight-text');
        if (el && data.insight) el.textContent = data.insight;
    } catch { /* silent */ }
}

async function loadTournamentDashboard() {
    try {
        const [tRes, oRes] = await Promise.all([
            fetch(`${API}/api/tournaments`),
            fetch(`${API}/api/stats/overview`)
        ]);
        const tournaments = await tRes.json();
        const overview = oRes.ok ? await oRes.json() : {};

        // Split cleanly by server status
        const runningList = tournaments.filter(t => t.status === 'running');
        const finishedList = tournaments.filter(t => t.status === 'completed');
        const upcomingList = tournaments.filter(t => t.status === 'upcoming');

        setText('stat-running', runningList.length);
        setText('stat-finished', finishedList.length);
        setText('stat-upcoming', upcomingList.length);
        setText('stat-matches', overview.totalMatches ?? tournaments.reduce((s, t) => s + (t.totalMatches || 0), 0));
        setText('stat-teams', overview.totalTeams ?? '—');
        setText('stat-live', tournaments.reduce((s, t) => s + (t.liveMatches || 0), 0));
        setText('running-count', runningList.length);
        setText('finished-count', finishedList.length);

        renderTournamentCards('running-tournaments', runningList.length ? runningList : upcomingList, runningList.length ? 'running' : 'upcoming');
        renderTournamentCards('finished-tournaments', finishedList, 'finished');
    } catch (e) {
        console.error('Tournament dashboard failed', e);
    }
}

function renderTournamentCards(containerId, list, mode) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!list.length) {
        el.innerHTML = `<div class="empty-state soft-empty">No ${mode} tournaments yet.</div>`;
        return;
    }
    el.innerHTML = list.map(t => {
        const total = t.totalMatches || 0;
        const done = t.completedMatches || 0;
        const teams = (t.teams || []).map(shortTeam).slice(0, 6);
        const more = (t.teams || []).length - teams.length;
        return `
        <article class="tour-mini-card">
            <div class="tour-mini-top">
                <div>
                    <h4>${esc(t.tournamentName)}</h4>
                    <div class="tour-mini-meta">
                        ${fmtFormat(t.format)}
                        ${statusBadge(t.status)}
                        <span class="meta-dot">${t.totalTeams || (t.teams || []).length || 0} teams</span>
                        ${t.overs ? `<span class="meta-dot">${t.overs} overs</span>` : ''}
                    </div>
                </div>
                <a class="btn-view" href="tournaments.html?focus=${encodeURIComponent(t.tournamentName)}">Schedule</a>
            </div>
            ${progressBar(done, total)}
            <div class="tour-team-chips">
                ${teams.map(n => `<span class="team-chip">${esc(n)}</span>`).join('')}
                ${more > 0 ? `<span class="team-chip muted">+${more}</span>` : ''}
            </div>
            <div class="tour-mini-foot">
                <span>${esc(t.startDate || 'TBD')} → ${esc(t.endDate || 'TBD')}</span>
                <span>${t.liveMatches || 0} open fixtures</span>
            </div>
        </article>`;
    }).join('');
}

async function loadRecentMatches() {
    try {
        const res = await fetch(`${API}/api/matches?exclude=Scheduled`);
        const data = await res.json();
        const tb = document.getElementById('matches-table');
        if (!tb) return;
        const rows = (data || []).slice().reverse().slice(0, 12);
        if (!rows.length) {
            tb.innerHTML = `<tr><td colspan="8" class="empty-state">No matches found.</td></tr>`;
            return;
        }
        tb.innerHTML = rows.map(m => {
            const done = m.winnerName;
            const score = `${m.team1TotalRuns || 0}/${m.team1TotalWickets || 0} · ${m.team2TotalRuns || 0}/${m.team2TotalWickets || 0}`;
            const status = done
                ? `<span style="color:var(--neon-green);font-weight:700">${esc(shortTeam(m.winnerName))} won</span>`
                : `<span style="color:var(--gold)">In progress</span>`;
            return `<tr>
                <td><strong style="color:var(--gold)">#${m.matchID}</strong></td>
                <td>${esc(m.tournamentName)}</td>
                <td>${fmtFormat(m.matchFormat)}</td>
                <td><strong>${esc(shortTeam(m.team1Name))}</strong> vs <strong>${esc(shortTeam(m.team2Name))}</strong></td>
                <td>${score}</td>
                <td>${status}</td>
                <td style="color:var(--text-muted)">${esc(m.matchDate || '—')}</td>
                <td><a href="matches.html?id=${m.matchID}" class="btn-view">Scorecard →</a></td>
            </tr>`;
        }).join('');
    } catch {
        console.error('Matches fetch failed');
    }
}
