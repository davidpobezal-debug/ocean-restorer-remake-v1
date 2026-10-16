// iPhone home-screen fix (from V2.2.1 IOS-BOTTOM-01): installed WebKit can shorten
// innerHeight and viewport units, leaving an empty strip at the bottom. We size the
// app box explicitly from the visual viewport, or from the screen when standalone.
(function () {
  const root = document.documentElement, standaloneQ = matchMedia('(display-mode: standalone)');
  const isIPhone = /iPhone|iPod/.test(navigator.userAgent);
  let frame = 0, settleT = 0;
  function update() {
    frame = 0;
    const vv = window.visualViewport;
    let h = vv && vv.scale === 1 ? vv.height : innerHeight;
    if (isIPhone && (navigator.standalone === true || standaloneQ.matches)) {
      // screen is in CSS px: no devicePixelRatio, no safe insets. Older iOS keeps portrait dims.
      const angle = typeof window.orientation === 'number' ? window.orientation : null;
      const landscape = angle !== null ? Math.abs(angle) % 180 === 90 : matchMedia('(orientation: landscape)').matches;
      const full = landscape ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height);
      if (full > 0) h = full;
    }
    if (!(h > 0)) h = innerHeight || 1;
    const v = Math.ceil(h) + 'px';
    if (root.style.getPropertyValue('--app-h') !== v) { root.style.setProperty('--app-h', v); dispatchEvent(new Event('appresize')); }
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  const settle = () => { schedule(); clearTimeout(settleT); settleT = setTimeout(schedule, 350); };
  for (const e of ['resize', 'orientationchange', 'pageshow', 'focus']) addEventListener(e, settle, { passive: true });
  if (window.visualViewport) for (const e of ['resize', 'scroll']) visualViewport.addEventListener(e, settle, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) settle(); });
  standaloneQ.addEventListener?.('change', settle);
  update();
})();
