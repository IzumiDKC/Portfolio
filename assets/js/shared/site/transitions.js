(function () {
  function initPageTransitions() {
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.3s ease';

    window.addEventListener('load', () => {
      document.body.style.opacity = '1';
    });

    document.querySelectorAll('a[href]').forEach((link) => {
      const href = link.getAttribute('href');
      if (!href || !/\.html$/.test(href) || /^https?/.test(href)) {
        return;
      }

      link.addEventListener('click', (event) => {
        event.preventDefault();
        document.body.style.opacity = '0';
        setTimeout(() => {
          window.location.href = href;
        }, 240);
      });
    });
  }

  window.IyuSiteTransitions = {
    initPageTransitions
  };
})();
