// transitions.js — CricketStats Pro | Cross-Document View Transitions
// Progressive enhancement: gracefully degrades on unsupported browsers.

(function () {
    'use strict';

    const SUPPORTED = CSS.supports && CSS.supports('view-transition-name', 'auto');

    // ── 1. Capture source element geometry before navigation ──
    function captureSource(el) {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
    }

    // ── 2. On click of [data-transition] elements, store source info ──
    document.addEventListener('click', function (e) {
        const link = e.target.closest('[data-transition]');
        if (!link || !SUPPORTED) return;

        const key = link.getAttribute('data-transition');
        const src = captureSource(link);
        if (src) {
            try { sessionStorage.setItem('vt-source-' + key, JSON.stringify(src)); } catch {}
        }

        // Set source view-transition-name dynamically just before navigation
        link.style.viewTransitionName = 'morph-source-' + key;

        // Clean up after the snapshot is taken
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                link.style.viewTransitionName = '';
            });
        });
    });

    // ── 3. On page load, restore target view-transition-name if source was captured ──
    function restoreTargets() {
        if (!SUPPORTED) return;

        document.querySelectorAll('[data-transition-target]').forEach(el => {
            const key = el.getAttribute('data-transition-target');
            try {
                const raw = sessionStorage.getItem('vt-source-' + key);
                if (raw) {
                    el.style.viewTransitionName = 'morph-source-' + key;

                    // Animate from captured geometry to final position
                    const src = JSON.parse(raw);
                    const dest = el.getBoundingClientRect();

                    // Only apply morph effect if positions differ meaningfully
                    const dx = Math.abs(src.x - dest.x);
                    const dy = Math.abs(src.y - dest.y);
                    if (dx > 20 || dy > 20) {
                        el.style.setProperty('--morph-start-x', (src.x - dest.x) + 'px');
                        el.style.setProperty('--morph-start-y', (src.y - dest.y) + 'px');
                        el.style.setProperty('--morph-start-w', src.w + 'px');
                        el.style.setProperty('--morph-start-h', src.h + 'px');
                        el.classList.add('vt-morph-active');
                    }

                    // Clean up session storage
                    sessionStorage.removeItem('vt-source-' + key);
                }
            } catch {}
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', restoreTargets);
    } else {
        restoreTargets();
    }

    // ── 4. Match card morph: auto-detect .match-card links ──
    document.addEventListener('click', function (e) {
        const card = e.target.closest('.match-card, .glass-card[data-match-id]');
        if (!card || !SUPPORTED) return;

        const id = card.getAttribute('data-match-id') || card.closest('tr')?.querySelector('strong')?.textContent?.replace('#', '');
        if (!id) return;

        try {
            sessionStorage.setItem('vt-match-id', id);
            sessionStorage.setItem('vt-match-rect', JSON.stringify(captureSource(card)));
        } catch {}
    });

    // ── 5. Player card morph: auto-detect player links ──
    document.addEventListener('click', function (e) {
        const row = e.target.closest('tr[data-player-id], .player-card');
        if (!row || !SUPPORTED) return;

        const id = row.getAttribute('data-player-id');
        if (!id) return;

        try {
            sessionStorage.setItem('vt-player-id', id);
            sessionStorage.setItem('vt-player-rect', JSON.stringify(captureSource(row)));
        } catch {}
    });

    // ── 6. Restore match/player morph targets on destination pages ──
    function restoreMatchMorph() {
        if (!SUPPORTED) return;

        // Match morph
        try {
            const matchId = sessionStorage.getItem('vt-match-id');
            const matchRect = sessionStorage.getItem('vt-match-rect');
            if (matchId && matchRect) {
                const target = document.querySelector(`[data-transition-target="match-${matchId}"]`);
                if (target) {
                    target.style.viewTransitionName = 'morph-match';
                    target.classList.add('vt-morph-active');
                    const src = JSON.parse(matchRect);
                    target.style.setProperty('--morph-start-x', src.x + 'px');
                    target.style.setProperty('--morph-start-y', src.y + 'px');
                }
                sessionStorage.removeItem('vt-match-id');
                sessionStorage.removeItem('vt-match-rect');
            }
        } catch {}

        // Player morph
        try {
            const playerId = sessionStorage.getItem('vt-player-id');
            const playerRect = sessionStorage.getItem('vt-player-rect');
            if (playerId && playerRect) {
                const target = document.querySelector(`[data-transition-target="player-${playerId}"]`);
                if (target) {
                    target.style.viewTransitionName = 'morph-player';
                    target.classList.add('vt-morph-active');
                    const src = JSON.parse(playerRect);
                    target.style.setProperty('--morph-start-x', src.x + 'px');
                    target.style.setProperty('--morph-start-y', src.y + 'px');
                }
                sessionStorage.removeItem('vt-player-id');
                sessionStorage.removeItem('vt-player-rect');
            }
        } catch {}
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', restoreMatchMorph);
    } else {
        restoreMatchMorph();
    }
})();

// ═══════════════════════════════════════════════════════
// DATA SYNC — Cross-Page Live Update System
// Uses BroadcastChannel (with localStorage fallback) to
// notify all open tabs/pages when data changes.
// ═══════════════════════════════════════════════════════
window.DataSync = (function () {
    'use strict';

    const CHANNEL_NAME = 'cricketstats-sync';
    let bc = null;
    try { bc = new BroadcastChannel(CHANNEL_NAME); } catch {}

    // Listeners registry: { eventType: [callback, ...] }
    const listeners = {};

    // Listen for incoming messages
    function onMessage(e) {
        const { type, data } = e.data || {};
        if (!type || !listeners[type]) return;
        listeners[type].forEach(fn => {
            try { fn(data); } catch {}
        });
    }

    if (bc) {
        bc.onmessage = onMessage;
    } else {
        // localStorage fallback
        window.addEventListener('storage', function (e) {
            if (e.key !== CHANNEL_NAME) return;
            try { onMessage(JSON.parse(e.newValue)); } catch {}
        });
    }

    return {
        // Broadcast a data-change event to all open tabs + this tab
        emit(type, data) {
            const msg = { type, data: data || {} };
            if (bc) {
                bc.postMessage(msg);
            } else {
                try { localStorage.setItem(CHANNEL_NAME, JSON.stringify(msg)); } catch {}
            }
            // Also fire locally for same-tab listeners
            if (listeners[type]) {
                listeners[type].forEach(fn => {
                    try { fn(data); } catch {}
                });
            }
        },

        // Subscribe to a data-change event
        on(type, callback) {
            if (!listeners[type]) listeners[type] = [];
            listeners[type].push(callback);
        },

        // Convenience: emit standard events
        ballRecorded(matchId, innings) {
            this.emit('ball-recorded', { matchId, innings });
        },
        matchCompleted(matchId) {
            this.emit('match-completed', { matchId });
        },
        matchCreated(matchId) {
            this.emit('match-created', { matchId });
        },
        dataChanged(section) {
            this.emit('data-changed', { section });
        }
    };
})();

// ═══════════════════════════════════════════════════════
// SCROLL BEHAVIOR — Nav Hide/Show + Scroll-to-Top
// ═══════════════════════════════════════════════════════
(function () {
    'use strict';

    let lastScrollY = 0;
    let ticking = false;
    const SCROLL_THRESHOLD = 8;

    function onScroll() {
        if (ticking) return;
        ticking = true;

        requestAnimationFrame(function () {
            const currentY = window.scrollY || window.pageYOffset;
            const delta = currentY - lastScrollY;

            // ── Nav hide/show ──
            const nav = document.querySelector('nav');
            if (nav) {
                if (currentY > 60) {
                    if (delta > SCROLL_THRESHOLD) {
                        // Scrolling DOWN — hide nav
                        nav.classList.add('nav-hidden');
                    } else if (delta < -SCROLL_THRESHOLD) {
                        // Scrolling UP — show nav
                        nav.classList.remove('nav-hidden');
                    }
                } else {
                    // Near top — always show
                    nav.classList.remove('nav-hidden');
                }
            }

            // ── Scroll-to-top button visibility ──
            const scrollBtn = document.getElementById('scroll-top-btn');
            if (scrollBtn) {
                if (currentY > 400) {
                    scrollBtn.classList.add('visible');
                } else {
                    scrollBtn.classList.remove('visible');
                }
            }

            lastScrollY = currentY;
            ticking = false;
        });
    }

    // Attach scroll listener (passive for performance)
    window.addEventListener('scroll', onScroll, { passive: true });

    // Scroll-to-top click handler
    document.addEventListener('click', function (e) {
        const btn = e.target.closest('#scroll-top-btn');
        if (!btn) return;
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
})();
