(() => {
  'use strict';
  if (window.__MAVIK_MORALE_CLIENT__) return;
  window.__MAVIK_MORALE_CLIENT__ = true;

  const style = document.createElement('style');
  style.textContent = `.mavik-morale-toast{position:fixed;z-index:9100;right:18px;bottom:96px;max-width:min(430px,calc(100% - 24px));padding:14px 16px;border:1px solid rgba(181,224,137,.42);border-radius:16px;background:linear-gradient(145deg,rgba(21,47,56,.98),rgba(7,23,29,.98));color:#f1fbff;box-shadow:0 24px 70px rgba(0,0,0,.48);line-height:1.45;opacity:0;transform:translateY(12px);transition:.25s ease;pointer-events:none}.mavik-morale-toast.show{opacity:1;transform:translateY(0)}.mavik-morale-toast strong{display:block;color:#b9de8d;margin-bottom:4px}@media(max-width:700px){.mavik-morale-toast{left:10px;right:10px;bottom:88px;max-width:none}}`;
  document.head.appendChild(style);

  async function api(url) {
    const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Erreur ${response.status}`);
    return data;
  }
  function show(message) {
    if (!message) return;
    let toast = document.querySelector('.mavik-morale-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'mavik-morale-toast';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<strong>Jarvis</strong><span></span>`;
    toast.querySelector('span').textContent = message;
    requestAnimationFrame(() => toast.classList.add('show'));
    clearTimeout(show.timer);
    show.timer = setTimeout(() => toast.classList.remove('show'), 8500);
  }
  async function poll() {
    try {
      const result = await api('/api/jarvis/morale');
      if (result?.morale?.message) show(result.morale.message);
    } catch {}
  }
  setTimeout(poll, 90000);
  setInterval(poll, 30 * 60 * 1000);
  window.MAVIKMorale = { poll, show };
})();
