// =============================================
//  PORTFOLIO SCRIPT — Điền Nguyễn (Iyu)
//  Multi-page version
// =============================================

/* ── Navbar: solid on sub-pages (.scrolled) ── */
const navbar = document.getElementById('navbar');

if (navbar && !navbar.classList.contains('scrolled')) {
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
  }, { passive: true });
}

/* ── Mobile hamburger menu ── */
const hamburger = document.getElementById('hamburger');
const navLinksEl = document.getElementById('navLinks');

if (hamburger && navLinksEl) {
  hamburger.addEventListener('click', () => navLinksEl.classList.toggle('open'));
  navLinksEl.querySelectorAll('a').forEach(l => l.addEventListener('click', () => navLinksEl.classList.remove('open')));
}

/* ── Scroll animations (custom AOS) ── */
const aoObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('aos-animate'); });
}, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('[data-aos]').forEach(el => aoObserver.observe(el));

/* ── Animated counter for stats ── */
function animateCounter(el) {
  if (el.hasAttribute('data-no-counter')) return;         // skip non-integer stats
  const text = el.textContent;
  const num  = parseInt(text.replace(/\D/g, ''), 10);
  if (isNaN(num) || num === 0) return;
  const suffix = text.replace(/[\d]/g, '');
  let current = 0;
  const step  = Math.max(1, Math.floor(num / 40));
  const timer = setInterval(() => {
    current += step;
    if (current >= num) { current = num; clearInterval(timer); }
    el.textContent = current + suffix;
  }, 30);
}

const statObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.querySelectorAll('.stat-value').forEach(animateCounter);
      statObserver.unobserve(e.target);
    }
  });
}, { threshold: 0.5 });

const statsSection = document.querySelector('.about-stats');
if (statsSection) statObserver.observe(statsSection);

/* ── Cursor glow effect (desktop only) ── */
if (window.matchMedia('(pointer: fine)').matches) {
  const glow = document.createElement('div');
  glow.style.cssText = [
    'position:fixed','pointer-events:none','z-index:9999',
    'width:300px','height:300px','border-radius:50%',
    'background:radial-gradient(circle,rgba(99,102,241,0.05) 0%,transparent 70%)',
    'transform:translate(-50%,-50%)','transition:left .12s ease,top .12s ease','will-change:left,top'
  ].join(';');
  document.body.appendChild(glow);
  document.addEventListener('mousemove', e => {
    glow.style.left = e.clientX + 'px';
    glow.style.top  = e.clientY + 'px';
  }, { passive: true });
}

/* ── Page entrance fade ── */
document.body.style.opacity = '0';
document.body.style.transition = 'opacity 0.3s ease';
window.addEventListener('load', () => { document.body.style.opacity = '1'; });

/* ── Page exit fade on .html link clicks ── */
document.querySelectorAll('a[href]').forEach(link => {
  const href = link.getAttribute('href');
  if (href && /\.html$/.test(href) && !/^https?/.test(href)) {
    link.addEventListener('click', e => {
      e.preventDefault();
      document.body.style.opacity = '0';
      setTimeout(() => { window.location.href = href; }, 240);
    });
  }
});
