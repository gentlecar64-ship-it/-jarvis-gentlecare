(() => {
  'use strict';

  const form = document.getElementById('jarvisForm');
  const input = document.getElementById('jarvisInput');
  const answer = document.getElementById('jarvisAnswer');
  const voiceState = document.getElementById('voiceState');
  if (!form || !input || !answer) return;

  let photoDataUrl = '';
  let photoName = '';
  let assistantName = 'MAVIK';
  let voiceEnabled = true;

  const box = document.createElement('div');
  box.style.cssText = 'display:grid;grid-template-columns:1fr auto;gap:9px;margin-top:9px;align-items:center';
  box.innerHTML = `
    <label style="display:flex;align-items:center;gap:9px;padding:10px 12px;border:1px solid rgba(218,241,249,.14);border-radius:13px;background:rgba(2,11,16,.55);cursor:pointer;color:#dcebf0;font-size:12px">
      <span>📷 Ajouter la photo du véhicule</span>
      <input id="quoteVehiclePhoto" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" style="display:none">
    </label>
    <button id="clearQuotePhoto" type="button" style="display:none">Retirer</button>`;
  form.insertAdjacentElement('afterend', box);

  const status = document.createElement('div');
  status.style.cssText = 'margin-top:8px;color:#9ab0ba;font-size:12px;line-height:1.45';
  status.textContent = 'Pour un devis vocal : donnez le nom, l’e-mail ou le portable, le véhicule, la prestation et joignez une photo lorsque vous l’avez.';
  box.insertAdjacentElement('afterend', status);

  const links = document.createElement('div');
  links.style.cssText = 'display:grid;gap:8px;margin-top:10px';
  status.insertAdjacentElement('afterend', links);

  const fileInput = document.getElementById('quoteVehiclePhoto');
  const clearButton = document.getElementById('clearQuotePhoto');

  function setAnswer(text) {
    answer.textContent = text || 'MAVIK a terminé.';
  }

  function showLinks(items) {
    links.innerHTML = '';
    for (const item of items || []) {
      if (!item?.url) continue;
      const link = document.createElement('a');
      link.href = item.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.className = 'button primary';
      link.textContent = item.label || 'Ouvrir le document';
      links.appendChild(link);
    }
  }

  function clearPhoto() {
    photoDataUrl = '';
    photoName = '';
    fileInput.value = '';
    clearButton.style.display = 'none';
    status.textContent = 'Photo retirée. Le devis peut rester provisoire jusqu’à l’inspection.';
  }

  clearButton.onclick = clearPhoto;

  fileInput.onchange = () => {
    const file = fileInput.files?.[0];
    if (!file) return clearPhoto();
    if (file.size > 7_000_000) {
      clearPhoto();
      setAnswer('La photo dépasse 7 Mo. Choisissez une image plus légère.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      photoDataUrl = String(reader.result || '');
      photoName = file.name;
      clearButton.style.display = 'block';
      status.textContent = `Photo prête : ${file.name}. Elle sera rattachée à la fiche véhicule lors de la création du devis.`;
    };
    reader.onerror = () => setAnswer('La photo n’a pas pu être lue. Réessayez avec une autre image.');
    reader.readAsDataURL(file);
  };

  async function send(text) {
    setAnswer(`${assistantName} analyse les informations et vérifie les doublons…`);
    showLinks([]);
    try {
      const response = await window.api('/api/jarvis/command', {
        method: 'POST',
        body: JSON.stringify({ text, command: text, photoDataUrl, photoName })
      });
      setAnswer(response.answer || response.message || JSON.stringify(response));
      showLinks(response.links || (response.data?.visualUrl ? [{ label: 'Ouvrir le devis visuel', url: response.data.visualUrl }] : []));
      if (response.type === 'quote-workflow-created' || response.type === 'quote-regenerated') clearPhoto();
      if (response.data?.missingFields?.length) status.textContent = `Devis provisoire. À compléter : ${response.data.missingFields.join(', ')}.`;
      else if (/quote/.test(String(response.type || ''))) status.textContent = 'Le document est préparé. Validation de David ou Bénédicte obligatoire avant tout envoi.';
      return response;
    } catch (error) {
      setAnswer(`${assistantName} : ${error.message || error}`);
      return null;
    }
  }

  function startEnhancedVoice() {
    if (!voiceEnabled) {
      setAnswer('La commande vocale est désactivée dans votre profil MAVIK.');
      answer.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setAnswer('La dictée vocale n’est pas disponible dans ce navigateur. Sur iPhone, ouvrez MAVIK dans Safari.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.interimResults = false;
    recognition.continuous = false;
    if (voiceState) voiceState.classList.add('show');
    recognition.onresult = (event) => {
      const text = event.results?.[0]?.[0]?.transcript || '';
      input.value = text;
      if (text) send(text);
    };
    recognition.onerror = (event) => {
      setAnswer(event.error === 'not-allowed' ? 'Autorisez le microphone pour parler à Jarvis.' : 'Je n’ai pas compris. Réessayez depuis le menu Parler.');
    };
    recognition.onend = () => { if (voiceState) voiceState.classList.remove('show'); };
    recognition.start();
    answer.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  window.ask = send;
  window.startVoice = startEnhancedVoice;
  form.onsubmit = (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    send(text);
    input.value = '';
  };

  window.api('/api/profile').then((profile) => {
    assistantName = profile.user?.preferences?.assistantName || 'MAVIK';
    voiceEnabled = profile.user?.preferences?.voiceEnabled !== false;
  }).catch(() => {});
})();
