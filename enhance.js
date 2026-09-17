// enhance.js — CricketStats Pro | shared UX layer
// Adds: AI insight nav pill refresh, CSV export helper.
(function () {
    'use strict';

    const API = (window.API || 'http://localhost:5001');

    function getUser() {
        try { return JSON.parse(localStorage.getItem('cricketUser')); }
        catch { return null; }
    }

    function esc(v) {
        return String(v ?? '')
            .replace(/&/g, '&' + 'amp;')
            .replace(/</g, '&' + 'lt;')
            .replace(/>/g, '&' + 'gt;')
            .replace(/"/g, '&' + 'quot;');
    }

    // ── AI Insight — refresh the nav pill on every page ──
    async function refreshAIInsight() {
        try {
            const res = await fetch(`${API}/api/stats/ai-insight`);
            if (!res.ok) return;
            const data = await res.json();
            const el = document.getElementById('ai-insight-text');
            if (el && data.insight) el.textContent = data.insight;
        } catch { /* silent */ }
    }

    document.addEventListener('DOMContentLoaded', () => {
        refreshAIInsight();
    });

    // ── CSV export helper (used by pages that opt in) ──
    window.exportTableToCSV = function (filename, headers, rows) {
        const escCell = (c) => {
            const s = String(c ?? '');
            return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };
        const lines = [headers.map(escCell).join(',')]
            .concat(rows.map(r => r.map(escCell).join(',')));
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
})();
