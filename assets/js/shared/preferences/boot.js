(function () {
  const themeApi = window.IyuTheme;
  const languageApi = window.IyuLanguage;

  if (!themeApi || !languageApi) {
    return;
  }

  themeApi.applyTheme(themeApi.getTheme());

  function onReady() {
    const themeButton = document.getElementById('themeToggle');
    const langButton = document.getElementById('langToggle');

    if (themeButton) {
      themeButton.addEventListener('click', themeApi.toggleTheme);
    }

    if (langButton) {
      langButton.addEventListener('click', languageApi.toggleLang);
    }

    themeApi.applyTheme(themeApi.getTheme());
    languageApi.applyLang(languageApi.getLang());

    window._iyu = {
      getLang: languageApi.getLang,
      getTheme: themeApi.getTheme,
      toggleLang: languageApi.toggleLang,
      toggleTheme: themeApi.toggleTheme
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
})();
