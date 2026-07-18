// cricket_scene.js — injects stadium background only (no animations)
(function () {
    const bg = document.createElement('div');
    bg.className = 'stadium-bg-overlay';
    document.body.prepend(bg);
})();
