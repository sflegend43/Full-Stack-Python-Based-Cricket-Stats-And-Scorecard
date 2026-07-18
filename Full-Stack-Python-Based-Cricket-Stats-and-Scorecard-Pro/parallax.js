// parallax.js — Stadium background parallax scroll effect
// The stadium image shifts downward at 35% of scroll speed,
// making it feel like you're looking into a stadium as you scroll.

(function () {
    var el = null;

    function getEl() {
        if (!el) el = document.querySelector('.stadium-bg-overlay');
        return el;
    }

    function onScroll() {
        var bg = getEl();
        if (!bg) return;
        // Shift UP at 35% of scroll distance — reversed parallax
        bg.style.transform = 'translateY(' + (window.scrollY * -0.35) + 'px)';
    }

    // Run once on load to set initial position
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
})();
