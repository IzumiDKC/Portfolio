(function () {
  function getTheme() {
    return localStorage.getItem('theme') || 'dark';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const button = document.getElementById('themeToggle');
    if (!button) {
      return;
    }

    button.innerHTML = theme === 'dark'
      ? '<i class="fa-solid fa-sun"></i>'
      : '<i class="fa-solid fa-moon"></i>';
  }

  function toggleTheme() {
    const nextTheme = getTheme() === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', nextTheme);
    applyTheme(nextTheme);
  }

  window.IyuTheme = {
    applyTheme,
    getTheme,
    toggleTheme
  };
})();
