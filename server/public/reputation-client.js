(() => {
  'use strict';

  const css = document.createElement('style');
  css.textContent = `
  .mavik-snow{position:fixed;inset:0;pointer-events:none;z-index:-1;overflow:hidden}.mavik-snow i{position:absolute;top:-8vh;color:rgba(235,250,255,.72);font-style:normal;filter:drop-shadow(0 0 5px rgba(220,245,255,.55));animation:mavikSnow linear infinite}.mavik-snow i:nth-child(3n){opacity:.45}.mavik-snow i:nth-child(4n){opacity:.85}@keyframes mavikSnow{0%{transform:translate3d(0,-10vh,0) rotate(0deg)}100%{transform:translate3d(var(--drift),115vh,0) rotate(420deg)}}
  .mavik-feedback-backdrop{position:fixed;inset:0;z-index:9998;background:rgba(1,8,12,.72);backdrop-filter:blur(12px);display:grid;place-items:center;padding:16px}.mavik-feedback{width:min(520px,100%);border:1px solid rgba(218,241,249,.18);border-radius:24px;padding:22px;background:linear-gradient(145deg,rgba(15,38,48,.98),rgba(5,17,23,.98));box-shadow:0 30px 90px rgba(0,0,0,.56);color:#edf7fb}.mavik-feedback h2{margin:0 0 8px;font-size:22px}.mavik-feedback p{color:#b4c8d0;line-height:1.55}.mavik-stars{display:flex;gap:8px;margin:16px 0}.mavik-stars button{width:48px;height:48px;border-radius:14px;border:1px solid rgba(218,241,249,.18);background:rgba(3,14,20,.65);color:#81939b;font-size:27px;cursor:pointer}.mavik-stars button.on{color:#ffcf72;border-color:rgba(255,207,114,.48);background:rgba(116,82,29,.25)}.mavik-feedback textarea{width:100%;min-height:96px;resize:vertical;border:1px solid rgba(218,241,249,.16);border-radius:13px;background:rgba(2,11,16,.62);color:white;padding:12px;font:inherit}.mavik-feedback-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.mavik-feedback-actions button{border:1px solid rgba(218,241,249,.18);border-radius:12px;padding:10px 13px;background:linear-gradient(180deg,#244e61,#102a35);color:white;font-weight:800;cursor:pointer}.mavik-feedback-actions .primary{background:linear-gradient(180deg,#84b55a,#466f2d)}.mavik-feedback-actions .link{background:transparent}.mavik-review-settings{grid-column:1/-1}.mavik-review-settings .setting-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.mavik-review-settings label{display:block;font-size:12px;font-weight:800;margin-bottom:5px}.mavik-review-settings input,.mavik-review-settings select{width:100%;border:1px solid rgba(218,241,249,.14);border-radius:12px;background:rgba(2,11,16,.58);color:#fff;padding:11px 12px}.mavik-review-settings .row{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 0;border-top:1px solid rgba(222,241,247,.09)}.mavik-review-settings .row input{width:20px;height:20px}.mavik-review-settings .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.mavik-review-settings button{border:1px solid rgba(218,241,249,.18);border-radius:12px;padding:10px 13px;background:linear-gradient(180deg,#244e61,#102a35);color:white;font-weight:800;cursor:pointer}.mavik-review-settings .save{background:linear-gradient(180deg,#84b55a,#466f2d)}@media(max-width:700px){.mavik-review-settings .setting-grid{grid-template-columns:1fr}.mavik-feedback{padding:18px}.mavik-stars button{width:43px;height:43px}}
  `;
  document.head.appendChild(css);

  function snow() {
    if (document.querySelector('.mavik-snow')) return;
    const layer = document.createElement('div');
    layer.className = 'mavik-snow';
    const count = innerWidth < 700 ? 24 : 42;
    for (let i = 0; i < count; i += 1) {
      const flake = document.createElement('i');
      flake.textContent = i % 5 === 0 ? '✦' : i % 3 === 0 ? '❄' : '•';
      flake.style.left = `${Math.random() * 100}%`;
      flake.style.fontSize = `${5 + Math.random() * 13}px`;
      flake.style.animationDuration = `${11 + Math.random() * 18}s`;
      flake.style.animationDelay = `${-Math.random() * 28}s`;
      flake.style.setProperty('--drift', `${-80 + Math.random() * 160}px`);
      layer.appendChild(flake);
    }
    document.body.prepend(layer);
  }

  async function api(url, options = {}) {
    const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Opération impossible');
    return data;
  }

  let selectedRating = 0;
  function closeModal() { document.querySelector('.mavik-feedback-backdrop')?.remove(); selectedRating = 0; }
  function showPrompt(prompt) {
    closeModal();
    const backdrop = document.createElement('div');
    backdrop.className = 'mavik-feedback-backdrop';
    backdrop.innerHTML = `<section class="mavik-feedback"><h2>Votre avis sur MAVIK</h2><p>${String(prompt.message || '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</p><div class="mavik-stars" aria-label="Note de 1 à 5"><button data-rate="1">★</button><button data-rate="2">★</button><button data-rate="3">★</button><button data-rate="4">★</button><button data-rate="5">★</button></div><textarea placeholder="Une amélioration, une idée ou un point qui vous plaît ?"></textarea><div class="mavik-feedback-actions"><button class="primary" data-action="submit">Envoyer mon retour</button><button class="link" data-action="later">Plus tard</button><button class="link" data-action="never">Ne plus me demander</button></div></section>`;
    document.body.appendChild(backdrop);
    backdrop.querySelectorAll('[data-rate]').forEach(button => button.onclick = () => {
      selectedRating = Number(button.dataset.rate);
      backdrop.querySelectorAll('[data-rate]').forEach(star => star.classList.toggle('on', Number(star.dataset.rate) <= selectedRating));
    });
    backdrop.querySelector('[data-action="submit"]').onclick = async () => {
      if (!selectedRating) { backdrop.querySelector('p').textContent = 'Choisissez librement une note entre 1 et 5 étoiles avant de valider.'; return; }
      await api('/api/reputation/respond', { method: 'POST', body: JSON.stringify({ action: 'submit', rating: selectedRating, feedback: backdrop.querySelector('textarea').value }) });
      closeModal();
    };
    backdrop.querySelector('[data-action="later"]').onclick = async () => { await api('/api/reputation/respond', { method: 'POST', body: JSON.stringify({ action: 'later' }) }); closeModal(); };
    backdrop.querySelector('[data-action="never"]').onclick = async () => { await api('/api/reputation/respond', { method: 'POST', body: JSON.stringify({ action: 'never' }) }); closeModal(); };
  }

  async function maybePrompt(force = false) {
    try {
      const data = await api(`/api/reputation/prompt${force ? '?force=1' : ''}`);
      if (data.due) showPrompt(data);
    } catch {}
  }

  function addProfileSettings() {
    const grid = document.querySelector('.grid');
    if (!grid || document.querySelector('.mavik-review-settings')) return;
    const panel = document.createElement('section');
    panel.className = 'panel mavik-review-settings';
    panel.innerHTML = `<div class="panel-head"><div><h2>Demandes de retour sur MAVIK</h2><div class="muted">Réglez la fréquence et le ton. Aucune étoile n’est présélectionnée et vous pouvez arrêter les demandes à tout moment.</div></div></div><div class="setting-grid"><div><label>Surnom utilisé par Jarvis</label><input id="mavikFeedbackNickname" placeholder="David"></div><div><label>Ton des demandes</label><select id="mavikFeedbackTone"><option value="professional">Professionnel</option><option value="warm">Chaleureux</option><option value="humorous">Humoristique</option></select></div><div><label>Fréquence</label><select id="mavikFeedbackFrequency"><option value="moderate">Modérée</option><option value="normal">Normale</option><option value="sustained">Soutenue</option></select></div></div><label class="row"><span><strong>Autoriser les demandes de retour</strong><div class="muted">Maximum trois demandes, puis pause prolongée.</div></span><input id="mavikFeedbackEnabled" type="checkbox"></label><div class="actions"><button class="save" id="mavikFeedbackSave">Enregistrer</button><button id="mavikFeedbackPreview">Prévisualiser maintenant</button></div><div class="message" id="mavikFeedbackMessage"></div>`;
    grid.appendChild(panel);
    api('/api/reputation/preferences').then(data => {
      const s = data.settings || {};
      document.getElementById('mavikFeedbackNickname').value = s.nickname || '';
      document.getElementById('mavikFeedbackTone').value = s.tone || 'warm';
      document.getElementById('mavikFeedbackFrequency').value = s.frequency || 'normal';
      document.getElementById('mavikFeedbackEnabled').checked = s.enabled !== false && !s.neverAskAgain;
    }).catch(() => {});
    document.getElementById('mavikFeedbackSave').onclick = async () => {
      const message = document.getElementById('mavikFeedbackMessage');
      try {
        await api('/api/reputation/preferences', { method: 'PATCH', body: JSON.stringify({ nickname: document.getElementById('mavikFeedbackNickname').value, tone: document.getElementById('mavikFeedbackTone').value, frequency: document.getElementById('mavikFeedbackFrequency').value, enabled: document.getElementById('mavikFeedbackEnabled').checked, neverAskAgain: false }) });
        message.textContent = 'Réglages enregistrés.';
        message.className = 'message ok';
      } catch (error) { message.textContent = error.message; message.className = 'message bad'; }
    };
    document.getElementById('mavikFeedbackPreview').onclick = () => maybePrompt(true);
  }

  snow();
  addProfileSettings();
  setTimeout(() => maybePrompt(false), 2500);
})();
