(function () {
  function getLang() {
    return localStorage.getItem('lang') || 'vi';
  }

  function applyLang(lang) {
    document.documentElement.setAttribute('data-lang', lang);

    document.querySelectorAll('[data-vi]').forEach((element) => {
      const value = element.getAttribute(`data-${lang}`);
      if (value === null) {
        return;
      }

      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.placeholder = value;
      } else {
        element.innerHTML = value;
      }
    });

    const titleElement = document.querySelector('title[data-vi]');
    if (titleElement) {
      const titleValue = titleElement.getAttribute(`data-${lang}`);
      if (titleValue) {
        document.title = titleValue;
      }
    }

    const button = document.getElementById('langToggle');
    if (button) {
      button.textContent = lang === 'vi' ? 'EN' : 'VI';
    }
  }

  function toggleLang() {
    const nextLang = getLang() === 'vi' ? 'en' : 'vi';
    localStorage.setItem('lang', nextLang);
    applyLang(nextLang);
  }

  window.IyuLanguage = {
    applyLang,
    getLang,
    toggleLang
  };
})();
