// =============================================
//  LANG & THEME MANAGER — iyu.portfolio
// =============================================
(function () {

  // ── Theme ──────────────────────────────────
  function getTheme() { return localStorage.getItem('theme') || 'dark'; }

  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    const btn = document.getElementById('themeToggle');
    if (btn) {
      btn.innerHTML = t === 'dark'
        ? '<i class="fa-solid fa-sun"></i>'
        : '<i class="fa-solid fa-moon"></i>';
    }
  }

  function toggleTheme() {
    const next = getTheme() === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    applyTheme(next);
  }

  // ── Language ───────────────────────────────
  function getLang() { return localStorage.getItem('lang') || 'vi'; }

  function applyLang(l) {
    document.documentElement.setAttribute('data-lang', l);

    document.querySelectorAll('[data-vi]').forEach(el => {
      const val = el.getAttribute('data-' + l);
      if (val === null) return;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = val;
      } else {
        el.innerHTML = val;
      }
    });

    // page <title>
    const titleEl = document.querySelector('title[data-vi]');
    if (titleEl) {
      const val = titleEl.getAttribute('data-' + l);
      if (val) document.title = val;
    }

    const btn = document.getElementById('langToggle');
    if (btn) btn.textContent = l === 'vi' ? 'EN' : 'VI';
  }

  function toggleLang() {
    const next = getLang() === 'vi' ? 'en' : 'vi';
    localStorage.setItem('lang', next);
    applyLang(next);
  }

  // ── Apply immediately (prevent flash) ──────
  applyTheme(getTheme());

  // ── Bind after DOM ready ───────────────────
  function onReady() {
    const themeBtn = document.getElementById('themeToggle');
    const langBtn  = document.getElementById('langToggle');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
    if (langBtn)  langBtn.addEventListener('click', toggleLang);
    applyTheme(getTheme());
    applyLang(getLang());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }

  // expose for script.js
  window._iyu = { toggleTheme, toggleLang, getLang, getTheme };
})();
