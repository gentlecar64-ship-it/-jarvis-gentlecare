(() => {
  'use strict';

  if (window.__MAVIK_COMMAND_DOCK__) return;
  window.__MAVIK_COMMAND_DOCK__ = true;

  const css = document.createElement('style');
  css.textContent = `
  :root{--mavik-dock-height:78px}
  body.mavik-command-dock-ready{padding-bottom:calc(var(--mavik-dock-height) + env(safe-area-inset-bottom))!important}
  body.mavik-command-dock-ready .mobile{bottom:calc(var(--mavik-dock-height) + env(safe-area-inset-bottom))!important;grid-template-columns:repeat(4,1fr)!important}
  .mavik-command-dock{position:fixed;z-index:9000;left:50%;bottom:10px;transform:translateX(-50%);width:min(980px,calc(100% - 20px));display:grid;grid-template-columns:1fr 1fr minmax(230px,1.45fr) 1fr;gap:8px;padding:8px;border:1px solid rgba(218,241,249,.18);border-radius:22px;background:linear-gradient(180deg,rgba(8,25,33,.97),rgba(3,13,18,.98));backdrop-filter:blur(24px);box-shadow:0 25px 75px rgba(0,0,0,.5)}
  .mavik-command-dock button{min-height:58px;border:1px solid rgba(218,241,249,.16);border-radius:15px;background:linear-gradient(180deg,#244e61,#102a35);color:#f4fbfe;font:inherit;font-weight:900;cursor:pointer;padding:8px 10px;display:flex;align-items:center;justify-content:center;gap:8px;line-height:1.05;text-align:center}
  .mavik-command-dock button:hover{transform:translateY(-1px);border-color:rgba(225,245,252,.38)}
  .mavik-command-dock .jarvis-main{background:linear-gradient(180deg,#91bd61,#496f32);border-color:rgba(205,238,167,.55);font-size:15px;letter-spacing:.2px;box-shadow:0 0 24px rgba(145,188,91,.2)}
  .mavik-command-dock .emergency{background:linear-gradient(180deg,#8b3b39,#4e1e1d)}
  .mavik-command-dock .dock-icon{font-size:21px}.mavik-command-dock .dock-label{display:block}.mavik-command-dock .dock-sub{display:block;font-size:9px;font-weight:700;color:rgba(238,249,252,.7);margin-top:4px}
  .mavik-unread{display:none;min-width:21px;height:21px;border-radius:999px;background:#ff827a;color:#fff;font-size:11px;align-items:center;justify-content:center;padding:0 6px}.mavik-unread.show{display:inline-flex}
  .mavik-dock-backdrop{position:fixed;inset:0;z-index:9200;background:rgba(1,8,12,.76);backdrop-filter:blur(12px);display:grid;place-items:center;padding:14px}
  .mavik-dock-panel{width:min(720px,100%);max-height:min(790px,92vh);overflow:auto;border:1px solid rgba(218,241,249,.18);border-radius:24px;background:linear-gradient(145deg,rgba(15,38,48,.99),rgba(5,17,23,.99));box-shadow:0 35px 100px rgba(0,0,0,.6);padding:20px;color:#edf7fb}
  .mavik-dock-panel h2{margin:0 0 7px;font-size:22px}.mavik-dock-panel p{color:#b4c8d0;line-height:1.5}.mavik-dock-panel .head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.mavik-dock-panel .close{min-width:40px;height:40px;border-radius:12px;border:1px solid rgba(218,241,249,.18);background:#102a35;color:white;font-size:20px;cursor:pointer}
  .mavik-dock-list{display:grid;gap:9px;margin-top:15px}.mavik-dock-card{padding:13px;border:1px solid rgba(218,241,249,.13);border-radius:15px;background:rgba(2,12,17,.45)}.mavik-dock-card strong{display:block}.mavik-dock-card small{color:#9ab0ba}.mavik-dock-card .actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}
  .mavik-dock-panel button,.mavik-dock-panel a.button{border:1px solid rgba(218,241,249,.18);border-radius:12px;padding:10px 12px;background:linear-gradient(180deg,#244e61,#102a35);color:white;font:inherit;font-weight:800;text-decoration:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:7px}.mavik-dock-panel .primary{background:linear-gradient(180deg,#84b55a,#466f2d)}.mavik-dock-panel .danger{background:linear-gradient(180deg,#9a4643,#541f1e)}
  .mavik-compose{display:grid;gap:10px;margin-top:15px}.mavik-compose label{font-size:12px;font-weight:800}.mavik-compose input,.mavik-compose select,.mavik-compose textarea{width:100%;border:1px solid rgba(218,241,249,.15);border-radius:12px;background:rgba(2,11,16,.62);color:#fff;padding:11px 12px;font:inherit}.mavik-compose textarea{min-height:120px;resize:vertical}.mavik-compose .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .mavik-voice-panel{width:min(680px,100%);text-align:center}.mavik-voice-orb{width:112px;height:112px;margin:14px auto;border-radius:50%;background:radial-gradient(circle,#f4fdff 0 6%,#a8dff2 15%,#3e7891 42%,#06141b 72%);box-shadow:0 0 34px rgba(145,210,238,.66);position:relative}.mavik-voice-orb:after{content:"";position:absolute;inset:-14px;border-radius:50%;border:2px solid rgba(154,221,246,.25);animation:mavikVoicePulse 1.7s ease-out infinite}.mavik-voice-panel.speaking .mavik-voice-orb{box-shadow:0 0 44px rgba(145,188,91,.78)}.mavik-voice-panel.thinking .mavik-voice-orb{animation:mavikThink 1.1s linear infinite}@keyframes mavikVoicePulse{0%{transform:scale(.86);opacity:.75}100%{transform:scale(1.25);opacity:0}}@keyframes mavikThink{to{transform:rotate(360deg)}}
  .mavik-voice-status{font-size:18px;font-weight:900;margin-top:8px}.mavik-voice-hint{font-size:12px;color:#91aab5;margin-top:7px}.mavik-voice-transcript,.mavik-voice-answer{text-align:left;margin-top:13px;padding:12px 14px;border-radius:14px;border:1px solid rgba(218,241,249,.13);background:rgba(2,11,16,.48);line-height:1.5;min-height:48px}.mavik-voice-transcript{color:#b8ccd4}.mavik-voice-answer{color:#f1f9fc}.mavik-voice-actions{display:flex;gap:9px;justify-content:center;flex-wrap:wrap;margin-top:15px}
  @media(max-width:720px){:root{--mavik-dock-height:74px}.mavik-command-dock{bottom:4px;width:calc(100% - 8px);grid-template-columns:repeat(4,1fr);gap:4px;padding:5px;border-radius:17px}.mavik-command-dock button{min-height:61px;padding:6px 4px;border-radius:12px;display:grid;gap:1px;font-size:10px}.mavik-command-dock .jarvis-main{font-size:11px}.mavik-command-dock .dock-icon{font-size:20px}.mavik-command-dock .dock-sub{display:none}.mavik-dock-panel{padding:16px;border-radius:19px}.mavik-compose .row{grid-template-columns:1fr}.mavik-voice-orb{width:96px;height:96px}}
  `;
  document.head.appendChild(css);

  const api = async (url, options = {}) => {
    const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Erreur ${response.status}`);
    return data;
  };
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const normalize = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

  let currentUser = null;
  let directory = [];
  let speechSettings = { speechRate: 1, speechPitch: 1, speechVoiceName: '' };
  const conversation = { active: false, speaking: false, awaiting: false, muted: false, recognition: null, restartTimer: null, panel: null, status: null, transcript: null, answer: null };

  function closePanel() { document.querySelector('.mavik-dock-backdrop')?.remove(); }
  function panel(title, intro = '', className = '') {
    closePanel();
    const backdrop = document.createElement('div');
    backdrop.className = 'mavik-dock-backdrop';
    backdrop.innerHTML = `<section class="mavik-dock-panel ${className}"><div class="head"><div><h2>${esc(title)}</h2>${intro ? `<p>${esc(intro)}</p>` : ''}</div><button class="close" type="button" aria-label="Fermer">×</button></div><div class="mavik-panel-content"></div></section>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector('.close').onclick = () => { if (conversation.active) stopConversation(false); else closePanel(); };
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop && !conversation.active) closePanel(); });
    return { backdrop, root: backdrop.querySelector('.mavik-dock-panel'), content: backdrop.querySelector('.mavik-panel-content') };
  }

  function installDock() {
    if (document.querySelector('.mavik-command-dock')) return;
    document.body.classList.add('mavik-command-dock-ready');
    document.querySelectorAll('a[href^="/jarvis?voice=1"]').forEach((link) => { link.style.display = 'none'; });
    const mobile = document.querySelector('.mobile');
    if (mobile) mobile.style.gridTemplateColumns = 'repeat(4,1fr)';
    const dock = document.createElement('nav');
    dock.className = 'mavik-command-dock';
    dock.setAttribute('aria-label', 'Commandes rapides MAVIK');
    dock.innerHTML = `
      <button class="emergency" id="mavikEmergency" type="button"><span class="dock-icon">🆘</span><span><span class="dock-label">Appel d’urgence</span><span class="dock-sub">Choisir le service</span></span></button>
      <button id="mavikContact" type="button"><span class="dock-icon">👥</span><span><span class="dock-label">Contacter quelqu’un</span><span class="dock-sub">Équipe MAVIK</span></span></button>
      <button class="jarvis-main" id="mavikTalk" type="button"><span class="dock-icon">🎙</span><span><span class="dock-label">PARLER À JARVIS</span><span class="dock-sub">Conversation continue</span></span></button>
      <button id="mavikMessages" type="button"><span class="dock-icon">✉</span><span><span class="dock-label">Messagerie interne</span><span class="dock-sub">Messages équipe</span></span><span class="mavik-unread" id="mavikUnread">0</span></button>`;
    document.body.appendChild(dock);
    document.getElementById('mavikEmergency').onclick = openEmergency;
    document.getElementById('mavikContact').onclick = openDirectory;
    document.getElementById('mavikTalk').onclick = startConversation;
    document.getElementById('mavikMessages').onclick = openMessages;
  }

  function openEmergency() {
    const view = panel('Appel d’urgence', 'MAVIK ne déclenche jamais un appel sans votre action. Choisissez le service adapté.');
    view.content.innerHTML = `<div class="mavik-dock-list">
      <div class="mavik-dock-card"><strong>112 — Numéro d’urgence européen</strong><small>Urgence grave ou service à déterminer.</small><div class="actions"><a class="button danger" href="tel:112">Appeler le 112</a></div></div>
      <div class="mavik-dock-card"><strong>15 — SAMU</strong><small>Urgence médicale.</small><div class="actions"><a class="button danger" href="tel:15">Appeler le 15</a></div></div>
      <div class="mavik-dock-card"><strong>18 — Sapeurs-pompiers</strong><small>Incendie, accident ou secours.</small><div class="actions"><a class="button danger" href="tel:18">Appeler le 18</a></div></div>
    </div>`;
  }

  async function loadDirectory() {
    const data = await api('/api/internal/directory');
    directory = data.records || [];
    return directory;
  }

  async function openDirectory() {
    const view = panel('Contacter quelqu’un', 'Choisissez un membre de l’équipe pour lui écrire ou lui envoyer un e-mail.');
    view.content.innerHTML = '<p>Chargement de l’équipe…</p>';
    try {
      const records = await loadDirectory();
      view.content.innerHTML = `<div class="mavik-dock-list">${records.map((user) => `<div class="mavik-dock-card"><strong>${esc(user.name)}${user.isSelf ? ' — vous' : ''}</strong><small>${esc(user.role)}${user.email ? ` · ${esc(user.email)}` : ''}</small><div class="actions">${user.email ? `<a class="button" href="mailto:${encodeURIComponent(user.email)}">E-mail</a>` : ''}<button type="button" data-message-user="${esc(user.id)}">Message interne</button></div></div>`).join('') || '<p>Aucun autre utilisateur MAVIK n’est enregistré.</p>'}</div>`;
      view.content.querySelectorAll('[data-message-user]').forEach((button) => button.onclick = () => openCompose(button.dataset.messageUser));
    } catch (error) { view.content.innerHTML = `<p>${esc(error.message)}</p>`; }
  }

  async function openCompose(preselected = '') {
    if (!directory.length) await loadDirectory().catch(() => {});
    const view = panel('Nouveau message interne', 'Le message reste dans MAVIK et n’est pas envoyé à l’extérieur.');
    view.content.innerHTML = `<form class="mavik-compose" id="mavikCompose"><div class="row"><div><label>Destinataire</label><select name="toUserId"><option value="*">Toute l’équipe</option>${directory.map((user) => `<option value="${esc(user.id)}" ${user.id === preselected ? 'selected' : ''}>${esc(user.name)}${user.isSelf ? ' — vous' : ''}</option>`).join('')}</select></div><div><label>Priorité</label><select name="priority"><option value="normal">Normale</option><option value="urgent">Urgente</option></select></div></div><div><label>Objet</label><input name="subject" maxlength="120" placeholder="Objet du message"></div><div><label>Message</label><textarea name="body" required placeholder="Écrivez votre message"></textarea></div><button class="primary" type="submit">Envoyer dans MAVIK</button><p id="mavikComposeStatus"></p></form>`;
    view.content.querySelector('form').onsubmit = async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const status = document.getElementById('mavikComposeStatus');
      status.textContent = 'Envoi…';
      try {
        await api('/api/internal/messages', { method: 'POST', body: JSON.stringify({ toUserId: form.get('toUserId'), priority: form.get('priority'), subject: form.get('subject'), body: form.get('body') }) });
        status.textContent = 'Message enregistré et transmis dans MAVIK.';
        setTimeout(openMessages, 600);
      } catch (error) { status.textContent = error.message; }
    };
  }

  async function refreshUnread() {
    try {
      const data = await api('/api/internal/messages?limit=1');
      const badge = document.getElementById('mavikUnread');
      if (!badge) return;
      badge.textContent = String(data.unread || 0);
      badge.classList.toggle('show', Number(data.unread || 0) > 0);
    } catch {}
  }

  async function openMessages() {
    const view = panel('Messagerie interne', 'Messages échangés entre les utilisateurs MAVIK.');
    view.content.innerHTML = '<p>Chargement des messages…</p>';
    try {
      const data = await api('/api/internal/messages?limit=100');
      view.content.innerHTML = `<div class="actions" style="margin:12px 0"><button class="primary" id="mavikNewMessage" type="button">Nouveau message</button></div><div class="mavik-dock-list">${(data.records || []).map((message) => {
        const incoming = message.fromUserId !== currentUser?.id;
        const unread = incoming && !(message.readBy || []).includes(currentUser?.id);
        return `<article class="mavik-dock-card" data-message-id="${esc(message.id)}"><strong>${unread ? '● ' : ''}${esc(message.subject || 'Sans objet')}</strong><small>${incoming ? `De ${esc(message.fromName)}` : `À ${esc(message.toName)}`} · ${new Date(message.createdAt).toLocaleString('fr-FR')}</small><p>${esc(message.body)}</p>${unread ? '<div class="actions"><button type="button" data-read>Marquer comme lu</button></div>' : ''}</article>`;
      }).join('') || '<p>Aucun message interne.</p>'}</div>`;
      document.getElementById('mavikNewMessage').onclick = () => openCompose('');
      view.content.querySelectorAll('[data-read]').forEach((button) => button.onclick = async () => {
        const card = button.closest('[data-message-id]');
        await api(`/api/internal/messages/${encodeURIComponent(card.dataset.messageId)}/read`, { method: 'PATCH', body: '{}' });
        await openMessages();
        refreshUnread();
      });
      refreshUnread();
    } catch (error) { view.content.innerHTML = `<p>${esc(error.message)}</p>`; }
  }

  function speechSupported() { return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window; }
  function recognitionConstructor() { return window.SpeechRecognition || window.webkitSpeechRecognition || null; }
  function preferredVoice() {
    if (!speechSupported()) return null;
    const voices = speechSynthesis.getVoices();
    if (speechSettings.speechVoiceName) {
      const exact = voices.find((voice) => voice.name === speechSettings.speechVoiceName);
      if (exact) return exact;
    }
    const french = voices.filter((voice) => /^fr([-_]|$)/i.test(voice.lang || ''));
    return french.find((voice) => /audrey|amélie|amelie|denise|thomas|google.*français|microsoft.*fr/i.test(voice.name)) || french[0] || voices[0] || null;
  }
  function cleanSpeech(value) {
    return String(value || '').replace(/https?:\/\/\S+/gi, '').replace(/\/[a-z0-9/_?=&.%:-]+/gi, '').replace(/\b(?:DEV|GC)-\d{4}-\d{4}\b/gi, 'le dossier').replace(/[•*_#`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1300);
  }
  function isEndPhrase(value) {
    const text = normalize(value);
    return /\bjarvis c est fini\b/.test(text) || /\bjarvis termine la conversation\b/.test(text) || /\bjarvis on arrete\b/.test(text);
  }
  function updateVoice(status, mode = 'listening') {
    if (!conversation.panel) return;
    conversation.panel.classList.toggle('speaking', mode === 'speaking');
    conversation.panel.classList.toggle('thinking', mode === 'thinking');
    if (conversation.status) conversation.status.textContent = status;
  }
  function clearRestart() { clearTimeout(conversation.restartTimer); conversation.restartTimer = null; }
  function abortRecognition() {
    clearRestart();
    const recognition = conversation.recognition;
    conversation.recognition = null;
    if (!recognition) return;
    try { recognition.onend = null; recognition.abort(); } catch {}
  }
  function scheduleListen(delay = 320) {
    clearRestart();
    if (!conversation.active || conversation.speaking || conversation.awaiting) return;
    conversation.restartTimer = setTimeout(listen, delay);
  }
  function listen() {
    if (!conversation.active || conversation.speaking || conversation.awaiting) return;
    const Recognition = recognitionConstructor();
    if (!Recognition) {
      updateVoice('La reconnaissance vocale n’est pas disponible dans ce navigateur.', 'error');
      return;
    }
    abortRecognition();
    const recognition = new Recognition();
    conversation.recognition = recognition;
    recognition.lang = 'fr-FR';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => updateVoice('Je vous écoute…', 'listening');
    recognition.onresult = (event) => {
      let interim = '';
      let finalText = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript || '';
        if (event.results[index].isFinal) finalText += `${transcript} `;
        else interim += `${transcript} `;
      }
      if (conversation.transcript) conversation.transcript.textContent = (finalText || interim).trim() || '…';
      if (finalText.trim()) processVoiceCommand(finalText.trim());
    };
    recognition.onerror = (event) => {
      if (!conversation.active) return;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        updateVoice('Autorisez le microphone pour parler à Jarvis.', 'error');
        conversation.active = false;
        return;
      }
      if (!['aborted', 'no-speech'].includes(event.error)) updateVoice(`Écoute interrompue : ${event.error}. Je relance.`, 'listening');
    };
    recognition.onend = () => {
      if (conversation.recognition === recognition) conversation.recognition = null;
      scheduleListen(eventSafeDelay());
    };
    try { recognition.start(); }
    catch { scheduleListen(500); }
  }
  function eventSafeDelay() { return /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 650 : 300; }
  function speakResponse(value, onDone) {
    const text = cleanSpeech(value);
    abortRecognition();
    if (!text || conversation.muted || !speechSupported()) {
      conversation.speaking = false;
      setTimeout(onDone, 250);
      return;
    }
    conversation.speaking = true;
    updateVoice('Jarvis vous répond…', 'speaking');
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    utterance.rate = Math.min(1.35, Math.max(.75, Number(speechSettings.speechRate || 1)));
    utterance.pitch = Math.min(1.3, Math.max(.7, Number(speechSettings.speechPitch || 1)));
    const voice = preferredVoice();
    if (voice) utterance.voice = voice;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      conversation.speaking = false;
      onDone();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    speechSynthesis.speak(utterance);
    setTimeout(finish, Math.max(6000, text.length * 95));
  }
  async function processVoiceCommand(text) {
    if (!conversation.active || conversation.awaiting) return;
    abortRecognition();
    if (isEndPhrase(text)) {
      conversation.active = false;
      conversation.awaiting = false;
      if (conversation.answer) conversation.answer.textContent = 'Conversation terminée à votre demande.';
      speakResponse('D’accord. La conversation est terminée.', () => updateVoice('Conversation terminée', 'stopped'));
      return;
    }
    conversation.awaiting = true;
    updateVoice('Jarvis réfléchit…', 'thinking');
    try {
      const result = await api('/api/jarvis/command', { method: 'POST', body: JSON.stringify({ text, command: text }) });
      const answer = result.answer || result.message || 'La demande est traitée.';
      if (conversation.answer) conversation.answer.textContent = answer;
      const quick = conversation.panel?.querySelector('.mavik-voice-quick');
      if (quick) {
        quick.innerHTML = '';
        for (const action of result.actions || []) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = action.label || action.command;
          button.onclick = () => processVoiceCommand(action.command || action.label);
          quick.appendChild(button);
        }
      }
      conversation.awaiting = false;
      speakResponse(answer, () => { updateVoice('Je vous écoute…', 'listening'); scheduleListen(350); });
    } catch (error) {
      conversation.awaiting = false;
      const answer = `Je n’ai pas pu traiter la demande : ${error.message}`;
      if (conversation.answer) conversation.answer.textContent = answer;
      speakResponse(answer, () => scheduleListen(650));
    }
  }
  function stopConversation(close = true) {
    conversation.active = false;
    conversation.awaiting = false;
    conversation.speaking = false;
    abortRecognition();
    if (speechSupported()) speechSynthesis.cancel();
    if (close) closePanel();
    else updateVoice('Conversation arrêtée', 'stopped');
  }
  async function startConversation() {
    const Recognition = recognitionConstructor();
    if (!Recognition) {
      const view = panel('Parler à Jarvis', 'La reconnaissance vocale n’est pas disponible ici. Utilisez Chrome ou Safari avec l’autorisation du microphone.');
      view.content.innerHTML = '<p>Vous pouvez toujours ouvrir la page Jarvis et écrire votre demande.</p><a class="button primary" href="/jarvis">Ouvrir Jarvis</a>';
      return;
    }
    stopConversation(true);
    const view = panel('Conversation avec Jarvis', '', 'mavik-voice-panel');
    conversation.panel = view.root;
    view.content.innerHTML = `<div class="mavik-voice-orb"></div><div class="mavik-voice-status">Démarrage de l’écoute…</div><div class="mavik-voice-hint">Jarvis écoute, répond, puis revient automatiquement à l’écoute. Dites « Jarvis, c’est fini » pour terminer.</div><div class="mavik-voice-transcript">Votre phrase apparaîtra ici.</div><div class="mavik-voice-answer">Jarvis est prêt.</div><div class="mavik-voice-quick mavik-voice-actions"></div><div class="mavik-voice-actions"><button type="button" id="mavikMuteVoice">🔊 Son activé</button><button class="danger" type="button" id="mavikStopVoice">Terminer la conversation</button></div>`;
    conversation.status = view.content.querySelector('.mavik-voice-status');
    conversation.transcript = view.content.querySelector('.mavik-voice-transcript');
    conversation.answer = view.content.querySelector('.mavik-voice-answer');
    conversation.active = true;
    conversation.awaiting = false;
    conversation.speaking = false;
    conversation.muted = false;
    document.getElementById('mavikMuteVoice').onclick = (event) => {
      conversation.muted = !conversation.muted;
      event.currentTarget.textContent = conversation.muted ? '🔇 Son coupé' : '🔊 Son activé';
      if (conversation.muted && speechSupported()) speechSynthesis.cancel();
    };
    document.getElementById('mavikStopVoice').onclick = () => stopConversation(true);
    listen();
  }

  async function init() {
    installDock();
    try {
      const [me, prefs] = await Promise.all([api('/api/auth/me'), api('/api/reputation/preferences')]);
      currentUser = me.user || null;
      speechSettings = { ...speechSettings, ...(prefs.settings || {}) };
    } catch {}
    refreshUnread();
    setInterval(refreshUnread, 60000);
    window.startVoice = startConversation;
    window.MAVIKCommandDock = { startConversation, openMessages, openDirectory, openEmergency };
  }

  init();
})();
