(function () {
  const navbarApi = window.IyuSiteNavbar;
  const menuApi = window.IyuSiteMenu;
  const observerApi = window.IyuSiteObservers;
  const effectsApi = window.IyuSiteEffects;
  const transitionsApi = window.IyuSiteTransitions;

  if (!navbarApi || !menuApi || !observerApi || !effectsApi || !transitionsApi) {
    return;
  }

  navbarApi.initNavbarScroll();
  menuApi.initMobileMenu();
  observerApi.initScrollAnimations();
  observerApi.initStatsObserver();
  effectsApi.initCursorGlow();
  transitionsApi.initPageTransitions();
})();
