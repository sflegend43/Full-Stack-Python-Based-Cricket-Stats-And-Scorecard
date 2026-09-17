// parallax.js — subtle pointer-based depth on stadium overlay (optional polish)
(function () {
    const overlay = document.querySelector('.stadium-bg-overlay');
    if (!overlay || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    let tx = 0, ty = 0;

    window.addEventListener('pointermove', (e) => {
        const x = (e.clientX / window.innerWidth - 0.5) * 8;
        const y = (e.clientY / window.innerHeight - 0.5) * 6;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
            tx += (x - tx) * 0.08;
            ty += (y - ty) * 0.08;
            overlay.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(1.03)`;
        });
    }, { passive: true });
})();
