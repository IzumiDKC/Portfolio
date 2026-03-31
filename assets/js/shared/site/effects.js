(function () {
  function initCursorGlow() {
    if (!window.matchMedia('(pointer: fine)').matches) {
      return;
    }

    const glow = document.createElement('div');
    glow.style.cssText = [
      'position:fixed', 'pointer-events:none', 'z-index:9999',
      'width:300px', 'height:300px', 'border-radius:50%',
      'background:radial-gradient(circle,rgba(99,102,241,0.05) 0%,transparent 70%)',
      'transform:translate(-50%,-50%)', 'transition:left .12s ease,top .12s ease', 'will-change:left,top'
    ].join(';');

    document.body.appendChild(glow);
    document.addEventListener('mousemove', (event) => {
      glow.style.left = `${event.clientX}px`;
      glow.style.top = `${event.clientY}px`;
    }, { passive: true });
  }

  window.IyuSiteEffects = {
    initCursorGlow
  };
})();
