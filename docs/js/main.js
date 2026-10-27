/**
 * 图提取官网交互
 * - 滚动时导航吸顶样式
 * - 移动端汉堡菜单
 * - IntersectionObserver 入场动画
 * - 滚动监听当前区块高亮导航
 */

(function () {
  'use strict';

  const header = document.querySelector('.site-header');
  const navToggle = document.querySelector('.nav-toggle');
  const navMenu = document.getElementById('nav-menu');
  const navLinks = document.querySelectorAll('.nav-link');
  const sections = document.querySelectorAll('main section[id]');

  /* ---------- 吸顶阴影 ---------- */
  function updateHeaderState() {
    if (!header) return;
    header.classList.toggle('is-scrolled', window.scrollY > 8);
  }

  /* ---------- 移动端菜单 ---------- */
  function closeMobileMenu() {
    if (!navToggle || !navMenu) return;
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', '打开菜单');
    navMenu.classList.remove('is-open');
  }

  function toggleMobileMenu() {
    if (!navToggle || !navMenu) return;
    const open = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!open));
    navToggle.setAttribute('aria-label', open ? '打开菜单' : '关闭菜单');
    navMenu.classList.toggle('is-open', !open);
  }

  if (navToggle) {
    navToggle.addEventListener('click', toggleMobileMenu);
  }

  navLinks.forEach((link) => {
    link.addEventListener('click', () => {
      closeMobileMenu();
    });
  });

  // 点击菜单外关闭
  document.addEventListener('click', (e) => {
    if (!navMenu || !navToggle) return;
    if (!navMenu.classList.contains('is-open')) return;
    if (navMenu.contains(e.target) || navToggle.contains(e.target)) return;
    closeMobileMenu();
  });

  /* ---------- 滚动入场动画 ---------- */
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      },
      { root: null, rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }

  /* ---------- 导航高亮当前区块 ---------- */
  const sectionIds = ['intro', 'features', 'install', 'download'];

  function setActiveLink(id) {
    navLinks.forEach((link) => {
      const href = link.getAttribute('href') || '';
      const match = href === `#${id}`;
      link.classList.toggle('is-active', match);
    });
  }

  function updateActiveNav() {
    const offset = (header ? header.offsetHeight : 68) + 24;
    let current = '';

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      if (top - offset <= 0) {
        current = id;
      }
    });

    // 接近页底时高亮「下载插件」
    const nearBottom =
      window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 80;
    if (nearBottom) current = 'download';

    if (current) setActiveLink(current);
    else {
      navLinks.forEach((l) => l.classList.remove('is-active'));
    }
  }

  // 也观察各 section，辅助高亮
  if ('IntersectionObserver' in window && sections.length) {
    const sectionIo = new IntersectionObserver(
      () => updateActiveNav(),
      { rootMargin: '-40% 0px -45% 0px', threshold: 0 }
    );
    sections.forEach((s) => sectionIo.observe(s));
  }

  window.addEventListener('scroll', () => {
    updateHeaderState();
    updateActiveNav();
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) closeMobileMenu();
  });

  updateHeaderState();
  updateActiveNav();
})();
