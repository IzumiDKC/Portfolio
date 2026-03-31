(function () {
  function initScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('aos-animate');
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('[data-aos]').forEach((element) => observer.observe(element));
  }

  function animateCounter(element) {
    if (element.hasAttribute('data-no-counter')) {
      return;
    }

    const text = element.textContent;
    const value = parseInt(text.replace(/\D/g, ''), 10);
    if (Number.isNaN(value) || value === 0) {
      return;
    }

    const suffix = text.replace(/[\d]/g, '');
    let current = 0;
    const step = Math.max(1, Math.floor(value / 40));
    const timer = setInterval(() => {
      current += step;
      if (current >= value) {
        current = value;
        clearInterval(timer);
      }
      element.textContent = current + suffix;
    }, 30);
  }

  function initStatsObserver() {
    const statsSection = document.querySelector('.about-stats');
    if (!statsSection) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.querySelectorAll('.stat-value').forEach(animateCounter);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    observer.observe(statsSection);
  }

  window.IyuSiteObservers = {
    initScrollAnimations,
    initStatsObserver
  };
})();
