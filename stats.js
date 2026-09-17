const API = 'http://localhost:5001';

let chartInstance = null;
let playersCache = [];
let teamsCache = [];

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

function esc(v) {
    return String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function num(v, digits = 0) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return digits > 0 ? n.toFixed(digits) : String(Math.round(n));
}

function pct(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return `${n.toFixed(1)}%`;
}

function resultBadge(result) {
    const r = (result || '').toLowerCase();
    if (r === 'won' || r === 'win' || r === 'yes') {
        return `<span class="ai-badge-pill ai-badge-win">Won</span>`;
    }
    if (r === 'lost' || r === 'loss' || r === 'no') {
        return `<span class="ai-badge-pill ai-badge-loss">Lost</span>`;
    }
    if (r === 'draw' || r === 'nr' || r === 'no result' || r === 'tied') {
        return `<span class="ai-badge-pill ai-badge-draw">${esc(result || 'NR')}</span>`;
    }
    return `<span class="ai-badge-pill ai-badge-draw">${esc(result || '—')}</span>`;
}

function yesNoBadge(flag) {
    const yes = flag === true || flag === 1 || String(flag).toLowerCase() === 'yes';
    return yes
        ? `<span class="ai-badge-pill ai-badge-win">Yes</span>`
        : `<span class="ai-badge-pill ai-badge-loss">No</span>`;
}

function setLoading(on) {
    const el = document.getElementById('stats-loading');
    const btn = document.getElementById('get-stats-btn');
    if (el) el.style.display = on ? 'flex' : 'none';
    if (btn) {
        btn.disabled = !!on;
        btn.textContent = on ? '⏳ Loading…' : '🔍 Get Stats';
    }
}

function hideCards() {
    ['player-stats-card', 'h2h-stats-card', 'pvp-stats-card', 'pvt-stats-card', 'generic-stats-card']
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
}

function showGenericResult(title, text) {
    document.getElementById('generic-stats-title').textContent = title;
    document.getElementById('generic-stats-text').textContent = text;
    document.getElementById('generic-stats-card').style.display = 'block';
}

function renderKpis(containerId, items) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = items.map((it, i) => {
        const tone = ['green', 'gold', 'cyber', 'red', 'gold', 'green'][i % 6];
        return `
            <div class="stat-box ${tone}">
                <h4>${esc(it.label)}</h4>
                <p>${esc(it.value)}</p>
                ${it.sub ? `<span class="ai-kpi-sub">${esc(it.sub)}</span>` : ''}
            </div>`;
    }).join('');
}

function metricRows(rows) {
    return rows.map(([metric, a, b]) => `
        <tr>
            <td class="ai-metric-name">${esc(metric)}</td>
            <td><strong>${a}</strong></td>
            ${b !== undefined ? `<td><strong>${b}</strong></td>` : ''}
        </tr>`).join('');
}

/* ─── Mode switching ─── */
function setStatType(type) {
    const select = document.getElementById('stat-type');
    if (select) select.value = type;

    document.querySelectorAll('.ai-type-pill').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });

    document.querySelectorAll('.stat-input-group').forEach(g => g.style.display = 'none');

    const labelTeam1 = document.getElementById('label-team1');
    if (type === 'player') {
        document.getElementById('input-player').style.display = 'block';
    } else if (type === 'h2h') {
        document.getElementById('input-team1').style.display = 'block';
        document.getElementById('input-team2').style.display = 'block';
        if (labelTeam1) labelTeam1.textContent = 'Team 1';
    } else if (type === 'pvp') {
        document.getElementById('input-batsman').style.display = 'block';
        document.getElementById('input-bowler').style.display = 'block';
    } else if (type === 'pvt') {
        document.getElementById('input-player').style.display = 'block';
        document.getElementById('input-team1').style.display = 'block';
        if (labelTeam1) labelTeam1.textContent = 'Opposition Team';
    }
}

function onStatTypeChange() {
    setStatType(document.getElementById('stat-type').value);
}

function resetStatsForm() {
    ['stat-player-name', 'stat-team1', 'stat-team2', 'stat-batsman', 'stat-bowler']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('results-container').style.display = 'none';
    hideCards();
    setLoading(false);
}

/* ─── Datalists ─── */
async function loadLookups() {
    // populates caches then typeahead binds on DOMContentLoaded
    try {
        const [pRes, tRes] = await Promise.all([
            fetch(`${API}/api/players`),
            fetch(`${API}/api/teams`)
        ]);
        if (pRes.ok) {
            playersCache = await pRes.json();
            const dl = document.getElementById('players-datalist');
            if (dl) {
                dl.innerHTML = playersCache
                    .map(p => `<option value="${esc(p.playerName)}"></option>`)
                    .join('');
            }
        }
        if (tRes.ok) {
            teamsCache = await tRes.json();
            const dl = document.getElementById('teams-datalist');
            if (dl) {
                dl.innerHTML = teamsCache
                    .map(t => `<option value="${esc(t.teamName)}"></option>`)
                    .join('');
            }
        }
    } catch {
        /* silent — free-text still works */
    }
}

/* ─── Submit ─── */
async function submitStatsQuery(e) {
    e.preventDefault();
    const results = document.getElementById('results-container');
    results.style.display = 'block';
    hideCards();

    const type = document.getElementById('stat-type').value;
    setLoading(true);

    try {
        if (type === 'player') {
            const name = document.getElementById('stat-player-name').value.trim();
            if (!name) { showGenericResult('Missing player', 'Enter a player name.'); return; }
            await fetchPlayerStats(name);
        } else if (type === 'h2h') {
            const t1 = document.getElementById('stat-team1').value.trim();
            const t2 = document.getElementById('stat-team2').value.trim();
            if (!t1 || !t2) { showGenericResult('Missing teams', 'Enter both team names.'); return; }
            await fetchH2H(t1, t2);
        } else if (type === 'pvp') {
            const bat = document.getElementById('stat-batsman').value.trim();
            const bowl = document.getElementById('stat-bowler').value.trim();
            if (!bat || !bowl) { showGenericResult('Missing players', 'Enter both player names.'); return; }
            await fetchPvP(bat, bowl);
        } else if (type === 'pvt') {
            const player = document.getElementById('stat-player-name').value.trim();
            const team = document.getElementById('stat-team1').value.trim();
            if (!player || !team) { showGenericResult('Missing fields', 'Enter player and opposition team.'); return; }
            await fetchPvT(player, team);
        }
    } finally {
        setLoading(false);
    }
}

/* ─── Player Stats ─── */
async function fetchPlayerStats(name) {
    try {
        const res = await fetch(`${API}/api/stats/player?name=${encodeURIComponent(name)}`);
        const data = await res.json();
        if (!res.ok) {
            showGenericResult(`Could not find player: ${name}`, data.error || 'Not found');
            return;
        }

        const p = data.player || {};
        const bat = data.batting || {};
        const bowl = data.bowling || {};
        const recent = data.recent || [];
        const yearly = data.yearly || [];

        document.getElementById('player-stats-title').textContent =
            `${p.playerName || data.playerName || name} — Complete Stats`;
        document.getElementById('player-stats-meta').textContent =
            [p.playerRole, p.playerNationality, p.battingStyle, p.bowlingStyle]
                .filter(Boolean).join(' · ') || 'Career overview from ball-by-ball data';

        renderKpis('player-kpi-grid', [
            { label: 'Matches', value: num(data.matchesPlayed ?? bat.innings ?? recent.length) },
            { label: 'Total Runs', value: num(bat.runs), sub: `${num(bat.balls)} balls` },
            { label: 'Batting Avg', value: num(bat.average, 2), sub: `SR ${num(bat.strikeRate, 1)}` },
            { label: 'Wickets', value: num(bowl.wickets), sub: `${num(bowl.runsConceded)} conc.` },
            { label: 'Bowling Avg', value: num(bowl.average, 2), sub: `Econ ${num(bowl.economy, 2)}` },
            { label: 'High Score', value: num(bat.highScore ?? bat.topScore) }
        ]);

        document.getElementById('player-career-tbody').innerHTML = metricRows([
            ['Innings / Spells', num(bat.innings), num(bowl.innings)],
            ['Runs / Runs Conceded', num(bat.runs), num(bowl.runsConceded)],
            ['Balls Faced / Bowled', num(bat.balls), num(bowl.balls)],
            ['Dismissals / Wickets', num(bat.dismissals), num(bowl.wickets)],
            ['Fours / Dot Balls*', num(bat.fours), num(bowl.dots)],
            ['Sixes / Maidens*', num(bat.sixes), num(bowl.maidens)],
            ['Average', num(bat.average, 2), num(bowl.average, 2)],
            ['Strike Rate / Economy', num(bat.strikeRate, 1), num(bowl.economy, 2)],
            ['50s / Best Figures', num(bat.fifties), esc(bowl.bestFigures || '—')],
            ['100s / —', num(bat.hundreds), '—']
        ]);

        const tb = document.getElementById('player-recent-tbody');
        if (!recent.length) {
            tb.innerHTML = '<tr><td colspan="9" class="empty-state">No recent match data found.</td></tr>';
        } else {
            tb.innerHTML = recent.map(r => `
                <tr>
                    <td>${esc(r.matchDate || '—')}</td>
                    <td>${esc(r.matchLabel || r.opponent || `${r.team1Name || ''} vs ${r.team2Name || ''}`)}</td>
                    <td><strong class="ai-val-green">${num(r.runs)}</strong></td>
                    <td>${num(r.balls)}</td>
                    <td>${num(r.fours)}</td>
                    <td>${num(r.sixes)}</td>
                    <td>${num(r.strikeRate, 1)}</td>
                    <td><strong class="ai-val-gold">${num(r.wickets)}</strong></td>
                    <td>${resultBadge(r.result || r.teamResult)}</td>
                </tr>`).join('');
        }

        const ytb = document.getElementById('player-yearly-tbody');
        if (!yearly.length) {
            ytb.innerHTML = '<tr><td colspan="8" class="empty-state">No yearly breakdown available.</td></tr>';
        } else {
            ytb.innerHTML = yearly.map(y => `
                <tr>
                    <td><strong>${esc(y.year)}</strong></td>
                    <td>${num(y.matches)}</td>
                    <td class="ai-val-green">${num(y.runs)}</td>
                    <td>${num(y.balls)}</td>
                    <td>${num(y.average, 2)}</td>
                    <td>${num(y.strikeRate, 1)}</td>
                    <td class="ai-val-gold">${num(y.wickets)}</td>
                    <td>${num(y.bowlRuns)}</td>
                </tr>`).join('');
        }

        // Chart
        const ctx = document.getElementById('player-year-chart').getContext('2d');
        if (chartInstance) chartInstance.destroy();
        const labels = yearly.map(y => y.year);
        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        type: 'line',
                        label: 'Runs',
                        data: yearly.map(y => y.runs || 0),
                        borderColor: '#22c55e',
                        backgroundColor: 'rgba(34,197,94,0.15)',
                        borderWidth: 2,
                        tension: 0.35,
                        yAxisID: 'y',
                        fill: true
                    },
                    {
                        type: 'bar',
                        label: 'Wickets',
                        data: yearly.map(y => y.wickets || 0),
                        backgroundColor: 'rgba(251,191,36,0.55)',
                        borderRadius: 6,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        labels: { color: '#94a3b8', boxWidth: 12, font: { family: 'Poppins' } }
                    }
                },
                scales: {
                    y: {
                        position: 'left',
                        ticks: { color: '#9ca3af' },
                        grid: { color: 'rgba(255,255,255,0.06)' },
                        title: { display: true, text: 'Runs', color: '#86efac' }
                    },
                    y1: {
                        position: 'right',
                        ticks: { color: '#9ca3af', stepSize: 1 },
                        grid: { drawOnChartArea: false },
                        title: { display: true, text: 'Wickets', color: '#fcd34d' }
                    },
                    x: {
                        ticks: { color: '#9ca3af' },
                        grid: { display: false }
                    }
                }
            }
        });

        document.getElementById('player-stats-card').style.display = 'block';
        document.getElementById('ai-insight-text').textContent =
            `${p.playerName || name}: ${num(bat.runs)} runs @ ${num(bat.average, 1)} avg, ${num(bowl.wickets)} wickets`;
    } catch {
        showToast('Network Error', 'error');
        showGenericResult('Network error', 'Could not reach the stats API.');
    }
}

/* ─── Head to Head ─── */
async function fetchH2H(t1, t2) {
    try {
        const res = await fetch(`${API}/api/stats/h2h?team1=${encodeURIComponent(t1)}&team2=${encodeURIComponent(t2)}`);
        const data = await res.json();
        if (!res.ok) {
            showGenericResult('Error', data.error || 'Failed to load H2H');
            return;
        }

        const team1 = data.team1 || t1;
        const team2 = data.team2 || t2;
        const s1 = data.side1 || data[team1] || {};
        const s2 = data.side2 || data[team2] || {};
        const summary = data.summary || {};

        // Legacy fallback if API still returns simple counts
        const t1Wins = s1.wins ?? data[team1] ?? 0;
        const t2Wins = s2.wins ?? data[team2] ?? 0;
        const draws = summary.draws ?? data.draw ?? 0;
        const played = summary.played ?? (Number(t1Wins) + Number(t2Wins) + Number(draws));

        document.getElementById('h2h-stats-title').textContent = `${team1} vs ${team2}`;
        document.getElementById('h2h-stats-meta').textContent =
            `${played} meetings · ${draws} draws/NR`;
        document.getElementById('h2h-col-t1').textContent = team1;
        document.getElementById('h2h-col-t2').textContent = team2;

        renderKpis('h2h-kpi-grid', [
            { label: 'Meetings', value: num(played) },
            { label: `${team1} Wins`, value: num(t1Wins) },
            { label: `${team2} Wins`, value: num(t2Wins) },
            { label: 'Draws / NR', value: num(draws) },
            { label: `${team1} Win %`, value: pct(s1.winPct ?? (played ? (100 * t1Wins / played) : 0)) },
            { label: `${team2} Win %`, value: pct(s2.winPct ?? (played ? (100 * t2Wins / played) : 0)) }
        ]);

        document.getElementById('h2h-compare-tbody').innerHTML = metricRows([
            ['Wins', num(t1Wins), num(t2Wins)],
            ['Losses', num(s1.losses ?? t2Wins), num(s2.losses ?? t1Wins)],
            ['Win Percentage', pct(s1.winPct ?? (played ? 100 * t1Wins / played : 0)),
                pct(s2.winPct ?? (played ? 100 * t2Wins / played : 0))],
            ['Total Runs Scored', num(s1.runsScored), num(s2.runsScored)],
            ['Total Runs Conceded', num(s1.runsConceded), num(s2.runsConceded)],
            ['Wickets Taken', num(s1.wicketsTaken), num(s2.wicketsTaken)],
            ['Wickets Lost', num(s1.wicketsLost), num(s2.wicketsLost)],
            ['Highest Team Total', num(s1.highestTotal), num(s2.highestTotal)],
            ['Lowest Team Total', num(s1.lowestTotal), num(s2.lowestTotal)],
            ['Avg Runs / Match', num(s1.avgRuns, 1), num(s2.avgRuns, 1)]
        ]);

        const hist = data.matches || [];
        const htb = document.getElementById('h2h-history-tbody');
        if (!hist.length) {
            htb.innerHTML = '<tr><td colspan="7" class="empty-state">No head-to-head matches found.</td></tr>';
        } else {
            htb.innerHTML = hist.map(m => `
                <tr>
                    <td>${esc(m.matchDate || '—')}</td>
                    <td>${esc(m.matchFormat || '—')}</td>
                    <td>${esc(m.team1Name)} vs ${esc(m.team2Name)}</td>
                    <td><strong class="ai-val-green">${esc(m.winnerName || 'NR')}</strong></td>
                    <td>${esc(m.winMargin || '—')}</td>
                    <td>${num(m.team1TotalRuns)}/${num(m.team1TotalWickets)}</td>
                    <td>${num(m.team2TotalRuns)}/${num(m.team2TotalWickets)}</td>
                </tr>`).join('');
        }

        document.getElementById('h2h-stats-card').style.display = 'block';
        document.getElementById('ai-insight-text').textContent =
            `H2H ${team1} ${t1Wins}–${t2Wins} ${team2} (${draws} NR)`;
    } catch {
        showToast('Network Error', 'error');
        showGenericResult('Network error', 'Could not reach the stats API.');
    }
}

/* ─── Player vs Player ─── */
async function fetchPvP(bat, bowl) {
    try {
        const res = await fetch(
            `${API}/api/stats/player_vs_player?batsman=${encodeURIComponent(bat)}&bowler=${encodeURIComponent(bowl)}`
        );
        const data = await res.json();
        if (!res.ok) {
            showGenericResult('Error', data.error || 'Failed to load duel stats');
            return;
        }

        const a = data.batsman || { name: bat };
        const b = data.bowler || { name: bowl };
        const duel = data.duel || data;
        const reverse = data.reverse || {};
        const matches = data.matches || [];

        document.getElementById('pvp-stats-title').textContent =
            `${a.name || bat} vs ${b.name || bowl}`;
        document.getElementById('pvp-stats-meta').textContent =
            'Runs scored · wickets taken · winning performances · team wins when facing each other';
        document.getElementById('pvp-col-a').textContent = a.name || bat;
        document.getElementById('pvp-col-b').textContent = b.name || bowl;

        renderKpis('pvp-kpi-grid', [
            { label: 'Balls Faced', value: num(duel.balls) },
            { label: 'Runs Scored', value: num(duel.runs), sub: `SR ${num(duel.strikeRate, 1)}` },
            { label: 'Dismissals', value: num(duel.dismissals), sub: 'how many times' },
            { label: 'Winning Perf. (A)', value: num(duel.winningPerformances) },
            { label: 'Team Wins (A side)', value: num(duel.teamWinsWhenFacing) },
            { label: 'Matches Contested', value: num(duel.matches ?? matches.length) }
        ]);

        document.getElementById('pvp-compare-tbody').innerHTML = metricRows([
            ['Role in duel', 'Batsman', 'Bowler'],
            ['Runs scored vs opponent', num(duel.runs), num(reverse.runs)],
            ['Balls in contest', num(duel.balls), num(reverse.balls)],
            ['Wickets / times dismissed', num(reverse.dismissals ?? duel.dismissals), num(duel.dismissals)],
            ['Strike rate / Econ', num(duel.strikeRate, 1), num(duel.economy, 2)],
            ['Boundary 4s / —', num(duel.fours), '—'],
            ['Boundary 6s / —', num(duel.sixes), '—'],
            ['Winning performances', num(duel.winningPerformances), num(reverse.winningPerformances)],
            ['Team wins when playing against', num(duel.teamWinsWhenFacing), num(reverse.teamWinsWhenFacing)],
            ['Team losses when playing against', num(duel.teamLossesWhenFacing), num(reverse.teamLossesWhenFacing)]
        ]);

        const mtb = document.getElementById('pvp-matches-tbody');
        if (!matches.length) {
            mtb.innerHTML = '<tr><td colspan="7" class="empty-state">No direct confrontations found in ball-by-ball data.</td></tr>';
        } else {
            mtb.innerHTML = matches.map(m => `
                <tr>
                    <td>${esc(m.matchDate || '—')}</td>
                    <td>${esc(m.matchLabel || `${m.team1Name || ''} vs ${m.team2Name || ''}`)}</td>
                    <td class="ai-val-green"><strong>${num(m.runs)}</strong></td>
                    <td>${num(m.balls)}</td>
                    <td class="ai-val-gold"><strong>${num(m.wickets)}</strong></td>
                    <td>${yesNoBadge(m.winningPerformance)}</td>
                    <td>${resultBadge(m.batsmanTeamResult || m.teamResult)} <span class="ai-muted">${esc(m.batsmanTeam || '')}</span></td>
                </tr>`).join('');
        }

        document.getElementById('pvp-stats-card').style.display = 'block';
        document.getElementById('ai-insight-text').textContent =
            `${a.name || bat} scored ${num(duel.runs)} off ${num(duel.balls)} vs ${b.name || bowl} (${num(duel.dismissals)} dismissals)`;
    } catch {
        showToast('Network Error', 'error');
        showGenericResult('Network error', 'Could not reach the stats API.');
    }
}

/* ─── Player vs Team ─── */
async function fetchPvT(player, team) {
    try {
        const res = await fetch(
            `${API}/api/stats/player_vs_team?player=${encodeURIComponent(player)}&team=${encodeURIComponent(team)}`
        );
        const data = await res.json();
        if (!res.ok) {
            showGenericResult('Error', data.error || 'Failed to load player vs team');
            return;
        }

        const summary = data.summary || data;
        const matches = data.matches || [];
        const pname = data.playerName || player;
        const tname = data.team || team;

        document.getElementById('pvt-stats-title').textContent = `${pname} vs ${tname}`;
        document.getElementById('pvt-stats-meta').textContent =
            data.playerTeam
                ? `${pname} (${data.playerTeam}) against ${tname}`
                : `Career record against ${tname}`;

        renderKpis('pvt-kpi-grid', [
            { label: 'Matches vs Team', value: num(summary.matches) },
            { label: 'Runs Scored', value: num(summary.runs), sub: `${num(summary.balls)} balls` },
            { label: 'Batting Avg', value: num(summary.average, 2), sub: `SR ${num(summary.strikeRate, 1)}` },
            { label: 'Wickets Taken', value: num(summary.wickets) },
            { label: 'Team Wins (when played)', value: num(summary.teamWins) },
            { label: 'Win Rate', value: pct(summary.winPct) }
        ]);

        document.getElementById('pvt-summary-tbody').innerHTML = [
            ['Player', esc(pname)],
            ['Opposition', esc(tname)],
            ['Matches', num(summary.matches)],
            ['Innings batted', num(summary.innings)],
            ['Runs scored', num(summary.runs)],
            ['Balls faced', num(summary.balls)],
            ['Dismissals', num(summary.dismissals)],
            ['Batting average', num(summary.average, 2)],
            ['Strike rate', num(summary.strikeRate, 1)],
            ['Fours / Sixes', `${num(summary.fours)} / ${num(summary.sixes)}`],
            ['High score', num(summary.highScore)],
            ['Wickets taken', num(summary.wickets)],
            ['Bowling runs conceded', num(summary.bowlRuns)],
            ['Bowling average', num(summary.bowlAverage, 2)],
            ['Team wins when playing against', num(summary.teamWins)],
            ['Team losses when playing against', num(summary.teamLosses)],
            ['Win percentage', pct(summary.winPct)]
        ].map(([k, v]) => `
            <tr>
                <td class="ai-metric-name">${k}</td>
                <td><strong>${v}</strong></td>
            </tr>`).join('');

        const mtb = document.getElementById('pvt-matches-tbody');
        if (!matches.length) {
            mtb.innerHTML = '<tr><td colspan="11" class="empty-state">No matches found against this team.</td></tr>';
        } else {
            mtb.innerHTML = matches.map(m => `
                <tr>
                    <td>${esc(m.matchDate || '—')}</td>
                    <td>${esc(m.matchLabel || `${m.team1Name || ''} vs ${m.team2Name || ''}`)}</td>
                    <td>${esc(m.playerTeam || '—')}</td>
                    <td class="ai-val-green"><strong>${num(m.runs)}</strong></td>
                    <td>${num(m.balls)}</td>
                    <td>${num(m.fours)}</td>
                    <td>${num(m.sixes)}</td>
                    <td>${num(m.strikeRate, 1)}</td>
                    <td class="ai-val-gold"><strong>${num(m.wickets)}</strong></td>
                    <td>${num(m.bowlRuns)}</td>
                    <td>${resultBadge(m.result)}</td>
                </tr>`).join('');
        }

        document.getElementById('pvt-stats-card').style.display = 'block';
        document.getElementById('ai-insight-text').textContent =
            `${pname} vs ${tname}: ${num(summary.runs)} runs, ${num(summary.wickets)} wickets, ${num(summary.teamWins)} team wins`;
    } catch {
        showToast('Network Error', 'error');
        showGenericResult('Network error', 'Could not reach the stats API.');
    }
}

/* ─── Boot ─── */
document.addEventListener('DOMContentLoaded', () => {
    const user = getUser();
    if (!user) { window.location.href = 'login.html'; return; }

    const nameEl = document.getElementById('user-name-display');
    const avatarEl = document.getElementById('user-avatar');
    if (nameEl) nameEl.textContent = user.fullname || user.email;
    if (avatarEl) avatarEl.textContent = (user.fullname || 'A')[0].toUpperCase();

    document.querySelectorAll('.ai-type-pill').forEach(btn => {
        btn.addEventListener('click', () => setStatType(btn.dataset.type));
    });

    setStatType('player');
    loadLookups().then(() => initAllTypeaheads());

    const scrollBtn = document.getElementById('scroll-top-btn');
    if (scrollBtn) {
        window.addEventListener('scroll', () => {
            scrollBtn.classList.toggle('show', window.scrollY > 320);
        });
        scrollBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }
});


// ── Typeahead suggestions (filter as user types each letter) ──
function bindTypeahead(inputId, kind) {
    const input = document.getElementById(inputId);
    if (!input || input.dataset.typeaheadBound === '1') return;
    input.dataset.typeaheadBound = '1';
    input.setAttribute('autocomplete', 'off');

    let box = document.getElementById(inputId + '-suggest');
    if (!box) {
        box = document.createElement('div');
        box.id = inputId + '-suggest';
        box.className = 'suggest-box';
        input.parentElement.style.position = 'relative';
        input.parentElement.appendChild(box);
    }

    const close = () => { box.style.display = 'none'; box.innerHTML = ''; };
    const openWith = (q) => {
        const query = (q || '').trim().toLowerCase();
        if (!query) { close(); return; }
        let items = [];
        if (kind === 'player') {
            items = (playersCache || [])
                .filter(p => String(p.playerName || '').toLowerCase().includes(query))
                .slice(0, 12)
                .map(p => ({ label: p.playerName, sub: p.playerNationality || p.playerRole || '' }));
        } else {
            items = (teamsCache || [])
                .filter(t => String(t.teamName || '').toLowerCase().includes(query) || String(t.country || '').toLowerCase().includes(query))
                .slice(0, 12)
                .map(t => ({ label: t.teamName, sub: t.country || '' }));
        }
        if (!items.length) {
            box.innerHTML = `<div class="suggest-empty">No matches for “${query}”</div>`;
            box.style.display = 'block';
            return;
        }
        box.innerHTML = items.map((it, i) =>
            `<button type="button" class="suggest-item" data-idx="${i}" data-value="${String(it.label).replace(/"/g, '&quot;')}">
                <strong>${it.label}</strong>
                <span>${it.sub || ''}</span>
             </button>`
        ).join('');
        box.style.display = 'block';
        box.querySelectorAll('.suggest-item').forEach(btn => {
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                input.value = btn.getAttribute('data-value') || '';
                close();
                input.dispatchEvent(new Event('change', { bubbles: true }));
            });
        });
    };

    input.addEventListener('input', () => openWith(input.value));
    input.addEventListener('focus', () => openWith(input.value));
    input.addEventListener('blur', () => setTimeout(close, 150));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
    });
}

function initAllTypeaheads() {
    ['stat-player-name', 'stat-batsman', 'stat-bowler'].forEach(id => bindTypeahead(id, 'player'));
    ['stat-team1', 'stat-team2'].forEach(id => bindTypeahead(id, 'team'));
}
