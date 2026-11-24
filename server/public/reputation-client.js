(() => {
  'use strict';

  const css = document.createElement('style');
  css.textContent = `
  .mavik-snow{position:fixed;inset:0;pointer-events:none;z-index:-1;overflow:hidden}.mavik-snow i{position:absolute;top:-8vh;color:rgba(235,250,255,.72);font-style:normal;filter:drop-shadow(0 0 5px rgba(220,245,255,.55));animation:mavikSnow linear infinite}.mavik-snow i:nth-child(3n){opacity:.45}.mavik-snow i:nth-child(4n){opacity:.85}@keyframes mavikSnow{0%{transform:translate3d(0,-10vh,0) rotate(0deg)}100%{transform:translate3d(var(--drift),115vh,0) rotate(420deg)}}
  .mavik-feedback-backdrop{position:fixed;inset:0;z-index:9998;background:rgba(1,8,12,.72);backdrop-filter:blur(12px);display:grid;place-items:center;padding:16px}.mavik-feedback{width:min(520px,100%);border:1px solid rgba(218,241,249,.18);border-radius:24px;padding:22px;background:linear-gradient(145deg,rgba(15,38,48,.98),rgba(5,17,23,.98));box-shadow:0 30px 90px rgba(0,0,0,.56);color:#edf7fb}.mavik-feedback h2{margin:0 0 8px;font-size:22px}.mavik-feedback p{color:#b4c8d0;line-height:1.55}.mavik-stars{display:flex;gap:8px;margin:16px 0}.mavik-stars button{width:48px;height:48px;border-radius:14px;border:1px solid rgba(218,241,249,.18);background:rgba(3,14,20,.65);color:#81939b;font-size:27px;cursor:pointer}.mavik-stars button.on{color:#ffcf72;border-color:rgba(255,207,114,.48);background:rgba(116,82,29,.25)}.mavik-feedback textarea{width:100%;min-height:96px;resize:vertical;border:1px solid rgba(218,241,249,.16);border-radius:13px;background:rgba(2,11,16,.62);color:white;padding:12px;font:inherit}.mavik-feedback-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.mavik-feedback-actions button{border:1px solid rgba(218,241,249,.18);border-radius:12px;padding:10px 13px;background:linear-gradient(180deg,#244e61,#102a35);color:white;font-weight:800;cursor:pointer}.mavik-feedback-actions .primary{background:linear-gradient(180deg,#84b55a,#466f2d)}.mavik-feedback-actions .link{background:transparent}
  .mavik-review-settings,.mavik-speech-settings{grid-column:1/-1}.mavik-review-settings .setting-grid,.mavik-speech-settings .setting-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.mavik-review-settings label,.mavik-speech-settings label{display:block;font-size:12px;font-weight:800;margin-bottom:5px}.mavik-review-settings input,.mavik-review-settings select,.mavik-speech-settings input,.mavik-speech-settings select{width:100%;border:1px solid rgba(218,241,249,.14);border-radius:12px;background:rgba(2,11,16,.58);color:#fff;padding:11px 12px}.mavik-review-settings .row,.mavik-speech-settings .row{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 0;border-top:1px solid rgba(222,241,247,.09)}.mavik-review-settings .row input,.mavik-speech-settings .row input{width:20px;height:20px}.mavik-review-settings .actions,.mavik-speech-settings .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.mavik-review-settings button,.mavik-speech-settings button{border:1px solid rgba(218,241,249,.18);border-radius:12px;padding:10px 13px;background:linear-gradient(180deg,#244e61,#102a35);color:white;font-weight:800;cursor:pointer}.mavik-review-settings .save,.mavik-speech-settings .save{background:linear-gradient(180deg,#84b55a,#466f2d)}
  .mavik-speech-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0;padding:10px;border:1px solid rgba(218,241,249,.13);border-radius:14px;background:rgba(2,12,17,.38)}.mavik-speech-toolbar button{border:1px solid rgba(218,241,249,.18);border-radius:11px;padding:9px 11px;background:linear-gradient(180deg,#244e61,#102a35);color:white;font-weight:800;cursor:pointer}.mavik-speech-toolbar button.on{background:linear-gradient(180deg,#84b55a,#466f2d)}.mavik-speech-status{font-size:11px;color:#9ab0ba;margin-left:auto}@media(max-width:700px){.mavik-review-settings .setting-grid,.mavik-speech-settings .setting-grid{grid-template-columns:1fr}.mavik-feedback{padding:18px}.mavik-stars button{width:43px;height:43px}.mavik-speech-status{width:100%;margin-left:0}}
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

  let settings = {
    spokenRepliesEnabled: true,
    speechRate: 1,
    speechPitch: 1,
    speechVoiceName: ''
  };
  let selectedRating = 0;
  let lastSpoken = '';
  let speechTimer = null;

  function speechSupported() { return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window; }
  function availableVoices() { return speechSupported() ? speechSynthesis.getVoices() : []; }
  function preferredVoice() {
    const voices = availableVoices();
    if (settings.speechVoiceName) {
      const exact = voices.find(voice => voice.name === settings.speechVoiceName);
      if (exact) return exact;
    }
    const french = voices.filter(voice => /^fr([-_]|$)/i.test(voice.lang || ''));
    return french.find(voice => /audrey|amélie|amelie|denise|thomas|google.*français|microsoft.*fr/i.test(voice.name)) || french[0] || voices[0] || null;
  }
  function cleanSpeech(value) {
    return String(value || '')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/\/[a-z0-9/_?=&.%:-]+/gi, '')
      .replace(/\b(?:DEV|GC)-\d{4}-\d{4}\b/gi, 'le dossier')
      .replace(/[•*_#`]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1100);
  }
  function stopSpeech() {
    if (speechSupported()) speechSynthesis.cancel();
    const status = document.querySelector('.mavik-speech-status');
    if (status) status.textContent = 'Voix arrêtée';
  }
  function speak(value, force = false) {
    const cleaned = cleanSpeech(value);
    if (!speechSupported() || !cleaned || (!settings.spokenRepliesEnabled && !force)) return;
    if (!force && cleaned === lastSpoken) return;
    if (!force && /analyse les informations|charge le planning|connexion aux services/i.test(cleaned)) return;
    lastSpoken = cleaned;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleaned);
    utterance.lang = 'fr-FR';
    utterance.rate = Math.min(1.35, Math.max(.75, Number(settings.speechRate || 1)));
    utterance.pitch = Math.min(1.3, Math.max(.7, Number(settings.speechPitch || 1)));
    const voice = preferredVoice();
    if (voice) utterance.voice = voice;
    const status = document.querySelector('.mavik-speech-status');
    utterance.onstart = () => { if (status) status.textContent = 'Jarvis parle…'; };
    utterance.onend = () => { if (status) status.textContent = settings.spokenRepliesEnabled ? 'Réponses vocales activées' : 'Réponses vocales désactivées'; };
    utterance.onerror = () => { if (status) status.textContent = 'Voix indisponible sur ce navigateur'; };
    speechSynthesis.speak(utterance);
  }
  function scheduleSpeech(value) {
    clearTimeout(speechTimer);
    speechTimer = setTimeout(() => speak(value), 450);
  }
  function updateSpeechToolbar() {
    const toggle = document.getElementById('mavikSpeechToggle');
    const status = document.querySelector('.mavik-speech-status');
    if (toggle) {
      toggle.classList.toggle('on', settings.spokenRepliesEnabled);
      toggle.textContent = settings.spokenRepliesEnabled ? '🔊 Réponses vocales activées' : '🔇 Réponses vocales désactivées';
    }
    if (status) status.textContent = speechSupported() ? (settings.spokenRepliesEnabled ? 'Jarvis répondra après chaque résultat' : 'Lecture automatique coupée') : 'Synthèse vocale non disponible';
  }
  async function saveSpeechSettings(patch = {}) {
    settings = { ...settings, ...patch };
    await api('/api/reputation/preferences', { method: 'PATCH', body: JSON.stringify(settings) });
    updateSpeechToolbar();
  }
  function installSpeechToolbar() {
    const answer = document.getElementById('jarvisAnswer');
    if (!answer || document.querySelector('.mavik-speech-toolbar')) return;
    const toolbar = document.createElement('div');
    toolbar.className = 'mavik-speech-toolbar';
    toolbar.innerHTML = '<button id="mavikSpeechToggle" type="button"></button><button id="mavikSpeechStop" type="button">■ Arrêter</button><button id="mavikSpeechTest" type="button">▶ Tester la voix</button><span class="mavik-speech-status"></span>';
    answer.parentElement.insertBefore(toolbar, answer);
    document.getElementById('mavikSpeechToggle').onclick = () => saveSpeechSettings({ spokenRepliesEnabled: !settings.spokenRepliesEnabled }).catch(() => {});
    document.getElementById('mavikSpeechStop').onclick = stopSpeech;
    document.getElementById('mavikSpeechTest').onclick = () => speak('Bonjour. Je suis Jarvis. Je peux maintenant vous répondre à voix haute après avoir traité votre demande.', true);
    updateSpeechToolbar();
    const observer = new MutationObserver(() => scheduleSpeech(answer.textContent));
    observer.observe(answer, { childList: true, subtree: true, characterData: true });
  }

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
    if (!grid) return;
    if (!document.querySelector('.mavik-review-settings')) {
      const panel = document.createElement('section');
      panel.className = 'panel mavik-review-settings';
      panel.innerHTML = `<div class="panel-head"><div><h2>Demandes de retour sur MAVIK</h2><div class="muted">Réglez la fréquence et le ton. Aucune étoile n’est présélectionnée et vous pouvez arrêter les demandes à tout moment.</div></div></div><div class="setting-grid"><div><label>Surnom utilisé par Jarvis</label><input id="mavikFeedbackNickname" placeholder="David"></div><div><label>Ton des demandes</label><select id="mavikFeedbackTone"><option value="professional">Professionnel</option><option value="warm">Chaleureux</option><option value="humorous">Humoristique</option></select></div><div><label>Fréquence</label><select id="mavikFeedbackFrequency"><option value="moderate">Modérée</option><option value="normal">Normale</option><option value="sustained">Soutenue</option></select></div></div><label class="row"><span><strong>Autoriser les demandes de retour</strong><div class="muted">Maximum trois demandes, puis pause prolongée.</div></span><input id="mavikFeedbackEnabled" type="checkbox"></label><div class="actions"><button class="save" id="mavikFeedbackSave">Enregistrer</button><button id="mavikFeedbackPreview">Prévisualiser maintenant</button></div><div class="message" id="mavikFeedbackMessage"></div>`;
      grid.appendChild(panel);
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
    if (!document.querySelector('.mavik-speech-settings')) {
      const panel = document.createElement('section');
      panel.className = 'panel mavik-speech-settings';
      panel.innerHTML = `<div class="panel-head"><div><h2>Voix de Jarvis</h2><div class="muted">Jarvis peut lire ses réponses à voix haute après la dictée ou une commande écrite.</div></div></div><div class="setting-grid"><div><label>Vitesse de parole</label><select id="mavikSpeechRate"><option value="0.85">Calme</option><option value="1">Normale</option><option value="1.15">Rapide</option></select></div><div><label>Tonalité</label><select id="mavikSpeechPitch"><option value="0.9">Grave</option><option value="1">Normale</option><option value="1.1">Plus claire</option></select></div></div><label class="row"><span><strong>Réponses vocales automatiques</strong><div class="muted">Lecture après chaque réponse finale de Jarvis.</div></span><input id="mavikSpokenRepliesEnabled" type="checkbox"></label><div class="actions"><button class="save" id="mavikSpeechSave">Enregistrer</button><button id="mavikSpeechPreview">Tester la voix</button><button id="mavikSpeechStopProfile">Arrêter</button></div><div class="message" id="mavikSpeechMessage"></div>`;
      grid.appendChild(panel);
      document.getElementById('mavikSpeechSave').onclick = async () => {
        const message = document.getElementById('mavikSpeechMessage');
        try {
          await saveSpeechSettings({ spokenRepliesEnabled: document.getElementById('mavikSpokenRepliesEnabled').checked, speechRate: Number(document.getElementById('mavikSpeechRate').value), speechPitch: Number(document.getElementById('mavikSpeechPitch').value) });
          message.textContent = 'Réglages vocaux enregistrés.';
          message.className = 'message ok';
        } catch (error) { message.textContent = error.message; message.className = 'message bad'; }
      };
      document.getElementById('mavikSpeechPreview').onclick = () => speak('Bonjour. Voici un aperçu de ma voix. Je pourrai vous répondre après chaque commande.', true);
      document.getElementById('mavikSpeechStopProfile').onclick = stopSpeech;
    }
  }

  async function loadSettings() {
    try {
      const data = await api('/api/reputation/preferences');
      settings = { ...settings, ...(data.settings || {}) };
      const review = data.settings || {};
      const nickname = document.getElementById('mavikFeedbackNickname');
      if (nickname) nickname.value = review.nickname || '';
      const tone = document.getElementById('mavikFeedbackTone');
      if (tone) tone.value = review.tone || 'warm';
      const frequency = document.getElementById('mavikFeedbackFrequency');
      if (frequency) frequency.value = review.frequency || 'normal';
      const feedbackEnabled = document.getElementById('mavikFeedbackEnabled');
      if (feedbackEnabled) feedbackEnabled.checked = review.enabled !== false && !review.neverAskAgain;
      const spoken = document.getElementById('mavikSpokenRepliesEnabled');
      if (spoken) spoken.checked = settings.spokenRepliesEnabled !== false;
      const rate = document.getElementById('mavikSpeechRate');
      if (rate) rate.value = String(settings.speechRate || 1);
      const pitch = document.getElementById('mavikSpeechPitch');
      if (pitch) pitch.value = String(settings.speechPitch || 1);
      updateSpeechToolbar();
    } catch {}
  }

  snow();
  addProfileSettings();
  installSpeechToolbar();
  loadSettings();
  if (speechSupported()) speechSynthesis.onvoiceschanged = updateSpeechToolbar;
  setTimeout(() => maybePrompt(false), 2500);
})();
