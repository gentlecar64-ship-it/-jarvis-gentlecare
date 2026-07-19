(() => {
  'use strict';
  if (window.__MAVIK_NAVIGATION_ENHANCER__) return;
  window.__MAVIK_NAVIGATION_ENHANCER__ = true;

  function enhance() {
    document.querySelectorAll('a').forEach((link) => {
      const label = (link.textContent || '').trim().toLowerCase();
      if (label.includes('planning') && !link.href.includes('/planning')) link.href = '/planning';
    });

    const sideNav = document.querySelector('.side .nav');
    if (sideNav && !sideNav.querySelector('a[href="/quotes"]')) {
      const quote = document.createElement('a');
      quote.href = '/quotes';
      quote.innerHTML = '<b>€</b>Devis';
      const dashboard = sideNav.querySelector('a');
      dashboard?.insertAdjacentElement('afterend', quote);
    }

    const mobile = document.querySelector('.mobile');
    if (mobile) {
      const planning = [...mobile.querySelectorAll('a')].find((link) => /planning/i.test(link.textContent || ''));
      if (planning) planning.href = '/planning';
      if (!mobile.querySelector('a[href="/quotes"]')) {
        const quote = document.createElement('a');
        quote.href = '/quotes';
        quote.innerHTML = '<b>€</b>Devis';
        mobile.prepend(quote);
      }
    }

    const heroButtons = document.querySelector('.hero-buttons');
    if (heroButtons && !heroButtons.querySelector('a[href="/quotes"]')) {
      const quote = document.createElement('a');
      quote.href = '/quotes';
      quote.className = 'button primary';
      quote.textContent = 'Créer un devis';
      heroButtons.prepend(quote);
      const planning = document.createElement('a');
      planning.href = '/planning';
      planning.className = 'button';
      planning.textContent = 'Ouvrir le planning';
      quote.insertAdjacentElement('afterend', planning);
    }

    const quick = document.querySelector('.quick');
    if (quick && !quick.querySelector('a[href="/quotes"]')) {
      const quote = document.createElement('a');
      quote.href = '/quotes';
      quote.className = 'button';
      quote.textContent = '€ Devis manuel et vocal';
      quick.prepend(quote);
      const planning = document.createElement('a');
      planning.href = '/planning';
      planning.className = 'button';
      planning.textContent = '▣ Planning complet';
      quote.insertAdjacentElement('afterend', planning);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhance, { once: true });
  else enhance();
})();
