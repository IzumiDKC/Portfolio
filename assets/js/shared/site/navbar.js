(function () {
  function initNavbarScroll() {
    const navbar = document.getElementById('navbar');
    if (!navbar || navbar.classList.contains('scrolled')) {
      return;
    }

    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 40);
    }, { passive: true });
  }

  window.IyuSiteNavbar = {
    initNavbarScroll
  };
})();
