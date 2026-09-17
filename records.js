// records.js — CricketStats Pro | Records & Hall of Fame

const API = 'http://localhost:5001';
let recordsFormat = '';

function getUser() {
    try { return JSON.parse(localStorage.getItem('cricketUser')); }
    catch { return null; }
}
function logout() {
    localStorage.removeItem('cricketUser');
    window.location.href = 'login.html';
}
function esc(v) {
    return String(v ?? '')
        .replace(/&/g, '&' + 'amp;')
        .replace(/</g, '&' + 'lt;')
        .replace(/>/g, '&' + 'gt;')
        .replace(/"/g, '&' + 'quot;');
}
function getCountryCode(country) {
    const s = String(country || '').toLowerCase();
    const map = {
        pakistan: 'pk', india: 'in', australia: 'au', england: 'gb',
        'south africa': 'za', 'new zealand': 'nz', 'west indies': 'jm',
        'sri lanka': 'lk', bangladesh: 'bd', afghanistan: 'af', uae: 'ae'
    };
    for (const [k, code] of Object.entries(map)) if (s.includes(k)) return code;
    return '';
}
function flag(country) {
    const c = getCountryCode(country);
    return c ? `<img class="flag-img" src="https://flagcdn.com/w40/${c}.png" alt="" loading="lazy" onerror="this.style.display='none'">` : '';
}

document.addEventListener('DOMContentLoaded', () => {
    const user = getUser();
    if (!user) { window.location.href = 'login.html'; return; }
    const nameEl = document.getElementById('user-name-display');
    const avatarEl = document.getElementById('user-avatar');
    if (nameEl) nameEl.textContent = user.fullname || user.email;
    if (avatarEl) avatarEl.textContent = (user.fullname || 'A')[0].toUpperCase();
    loadRecords();

    if (window.DataSync) {
        DataSync.on('ball-recorded', loadRecords);
        DataSync.on('match-completed', loadRecords);
        DataSync.on('data-changed', loadRecords);
    }
});

function setRecordsFormat(fmt, btn) {
    recordsFormat = fmt;
    document.querySelectorAll('#records-format-tabs .filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    loadRecords();
}

async function loadRecords() {
    const q = recordsFormat ? `?format=${encodeURIComponent(recordsFormat)}` : '';
    try {
        const res = await fetch(`${API}/api/stats/records${q}`);
        const d = await res.json();
        renderList('rec-most-runs', d.mostRuns, r => `${r.val} runs`);
        renderList('rec-most-wickets', d.mostWickets, r => `${r.val} wkts`);
        renderList('rec-most-sixes', d.mostSixes, r => `${r.val} sixes`);
        renderList('rec-most-fours', d.mostFours, r => `${r.val} fours`);
        renderList('rec-top-knocks', d.topKnocks, r => `${r.val} runs`, r => `Match #${r.matchID}`);
        renderList('rec-best-bowling', d.bestBowling, r => `${r.wkts}/${r.conceded}`, r => `Match #${r.matchID}`);
    } catch (e) {
        console.error('records load failed', e);
    }
}

function renderList(id, rows, valFn, subFn) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!rows || !rows.length) {
        el.innerHTML = `<li class="record-empty">No data yet.</li>`;
        return;
    }
    el.innerHTML = rows.map((r, i) => `
        <li class="record-row ${i === 0 ? 'is-top' : ''}">
            <span class="record-rank">${i + 1}</span>
            <span class="record-name">
                ${flag(r.playerNationality)}
                <span>${esc(r.playerName)}</span>
                ${subFn ? `<small>${esc(subFn(r))}</small>` : ''}
            </span>
            <span class="record-val">${esc(valFn(r))}</span>
        </li>
    `).join('');
}
