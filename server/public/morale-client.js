(() => {
  'use strict';
  if (window.__MAVIK_MORALE_CLIENT__) return;
  window.__MAVIK_MORALE_CLIENT__ = true;

  const style = document.createElement('style');
  style.textContent = `.mavik-morale-toast{position:fixed;z-index:9100;right:18px;bottom:96px;max-width:min(430px,calc(100% - 24px));padding:14px 16px;border:1px solid rgba(181,224,137,.42);border-radius:16px;background:linear-gradient(145deg,rgba(21,47,56,.98),rgba(7,23,29,.98));color:#f1fbff;box-shadow:0 24px 70px rgba(0,0,0,.48);line-height:1.45;opacity:0;transform:translateY(12px);transition:.25s ease;pointer-events:none}.mavik-morale-toast.show{opacity:1;transform:translateY(0)}.mavik-morale-toast strong{display:block;color:#b9de8d;margin-bottom:4px}.mavik-morale-settings .switch{display:flex;justify-content:space-between;gap:14px;align-items:center}.mavik-morale-settings .switch input{width:20px;height:20px;accent-color:#91bc5b}@media(max-width:700px){.mavik-morale-toast{left:10px;right:10px;bottom:88px;max-width:none}}`;
  document.head.appendChild(style);

  async function api(url, options = {}) {
    const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, cache: 'no-store', ...options });
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

  async function installProfileSettings() {
    if (location.pathname !== '/profile' || document.getElementById('mavikMoraleForm')) return;
    const grid = document.querySelector('.grid');
    if (!grid) return;
    const panel = document.createElement('section');
    panel.className = 'panel mavik-morale-settings';
    panel.innerHTML = `<div class="panel-head"><div><h2>Esprit de Jarvis</h2><div class="muted">Humour français populaire, absurde, pince-sans-rire et théâtral, avec des encouragements originaux adaptés au travail. Aucune imitation exacte ni phrase attribuée à une personnalité.</div></div></div><form id="mavikMoraleForm" class="fields"><label class="switch"><span><strong>Humour et mots sympathiques</strong><div class="muted">Jarvis peut intervenir de temps en temps, jamais pendant une urgence ou un sujet sensible.</div></span><input id="humourEnabled" type="checkbox"></label><label class="switch"><span><strong>Encouragements</strong><div class="muted">Petites phrases positives pour soutenir l’équipe.</div></span><input id="encouragementEnabled" type="checkbox"></label><div><label>Intensité</label><select id="humourLevel"><option value="light">Discrète</option><option value="normal">Normale</option><option value="high">Soutenue</option></select></div><div><label>Style</label><select id="humourStyle"><option value="professional">Professionnel avec une pointe d’humour</option><option value="warm">Chaleureux</option><option value="workshop">Atelier français, franc et absurde</option></select></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="primary" type="submit">Enregistrer l’esprit de Jarvis</button><button id="testMoraleButton" type="button">Tester un encouragement</button></div><div class="message" id="moraleSettingsMessage"></div></form>`;
    grid.appendChild(panel);
    try {
      const data = await api('/api/reputation/preferences');
      const settings = data.settings || {};
      document.getElementById('humourEnabled').checked = settings.humourEnabled !== false;
      document.getElementById('encouragementEnabled').checked = settings.encouragementEnabled !== false;
      document.getElementById('humourLevel').value = settings.humourLevel || 'normal';
      document.getElementById('humourStyle').value = settings.humourStyle || 'workshop';
    } catch {}
    panel.querySelector('form').onsubmit = async (event) => {
      event.preventDefault();
      const message = document.getElementById('moraleSettingsMessage');
      try {
        await api('/api/reputation/preferences', { method: 'PATCH', body: JSON.stringify({ humourEnabled: document.getElementById('humourEnabled').checked, encouragementEnabled: document.getElementById('encouragementEnabled').checked, humourLevel: document.getElementById('humourLevel').value, humourStyle: document.getElementById('humourStyle').value }) });
        message.textContent = 'Esprit de Jarvis enregistré.';
        message.className = 'message ok';
      } catch (error) { message.textContent = error.message; message.className = 'message bad'; }
    };
    document.getElementById('testMoraleButton').onclick = async () => {
      try {
        const result = await api('/api/jarvis/command', { method: 'POST', body: JSON.stringify({ text: 'Encourage-moi pour la suite du travail.', forceMorale: true }) });
        show(result.morale?.message || result.answer || 'Jarvis est prêt.');
      } catch (error) { show(error.message); }
    };
  }

  installProfileSettings();
  setTimeout(poll, 90000);
  setInterval(poll, 30 * 60 * 1000);
  window.MAVIKMorale = { poll, show };
})();
