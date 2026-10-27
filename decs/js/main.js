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