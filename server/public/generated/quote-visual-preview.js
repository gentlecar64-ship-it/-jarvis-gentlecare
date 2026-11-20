(() => {
  'use strict';
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
  const text = (id, fallback = '') => document.getElementById(id)?.value?.trim() || fallback;
  const checked = (id) => document.getElementById(id)?.checked === true;
  const number = (id) => Number(String(document.getElementById(id)?.value || '').replace(',', '.')) || 0;
  const money = (value) => Number(value || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  const wrap = (value, max = 35) => {
    const words = String(value || '').split(/\s+/).filter(Boolean); const lines = []; let line = '';
    for (const word of words) { if (`${line} ${word}`.trim().length > max && line) { lines.push(line); line = word; } else line = `${line} ${word}`.trim(); }
    if (line) lines.push(line); return lines.slice(0, 3);
  };
  function categoryLabel(value) { return ({voiture:'Voiture',moto:'Moto / deux-roues',utilitaire:'Utilitaire',camion:'Camion / poids lourd',avion:'Avion',helicoptere:'Hélicoptère',industriel:'Industriel',autre:'Autre'})[value] || 'Nature à définir'; }
  function render() {
    const root = document.getElementById('visualQuotePreview'); if (!root) return;
    const price = number('finalPrice') || number('targetPrice');
    const service = text('service', document.getElementById('packageKey')?.selectedOptions?.[0]?.textContent?.split(' — ')[0] || 'Prestation à définir');
    const serviceLines = wrap(service, 37);
    const client = text('clientName', 'Client à compléter');
    const vehicle = [text('brand'),text('model'),text('trim')].filter(Boolean).join(' ') || 'Véhicule / équipement à compléter';
    const details = [text('year'),text('color'),text('registration')].filter(Boolean).join(' · ') || 'Identification à compléter';
    const category = categoryLabel(text('vehicleType'));
    const photo = text('photoUrl');
    const terms = checked('termsAccepted');
    const technical = checked('technicalMediaAuthorized');
    const commercial = checked('commercialMediaAuthorized');
    const identifiable = checked('identifiableMediaAuthorized');
    const special = document.getElementById('specialOfferPanel')?.classList.contains('show');
    const offerName = text('specialOfferName');
    const media = photo ? `<defs><clipPath id="photoClip"><rect x="45" y="205" width="610" height="225" rx="18"/></clipPath></defs><image href="${esc(photo)}" x="45" y="205" width="610" height="225" preserveAspectRatio="xMidYMid slice" clip-path="url(#photoClip)"/><rect x="45" y="205" width="610" height="225" rx="18" fill="none" stroke="#9bd9ef" stroke-opacity=".4"/>` : `<rect x="45" y="205" width="610" height="225" rx="18" fill="#102832" stroke="#9bd9ef" stroke-opacity=".35"/><path d="M205 355h290l-30-78H265z" fill="#2d6377"/><circle cx="285" cy="362" r="30" fill="#07141c" stroke="#9bd9ef" stroke-width="6"/><circle cx="425" cy="362" r="30" fill="#07141c" stroke="#9bd9ef" stroke-width="6"/><text x="350" y="246" text-anchor="middle" fill="#91aab5" font-size="14">PHOTO RÉELLE À AJOUTER</text>`;
    const serviceSvg = serviceLines.map((line,index)=>`<text x="62" y="${590 + index*29}" font-size="23" fill="#fff" font-weight="800">${esc(line)}</text>`).join('');
    root.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 990" role="img" aria-label="Modèle imagé du devis GentleCarE">
      <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#07141c"/><stop offset=".55" stop-color="#17333e"/><stop offset="1" stop-color="#11231b"/></linearGradient><linearGradient id="price" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#527d39"/><stop offset="1" stop-color="#8bb961"/></linearGradient></defs>
      <rect width="700" height="990" rx="28" fill="url(#bg)"/><rect x="22" y="22" width="656" height="946" rx="24" fill="#07171f" fill-opacity=".78" stroke="#dff4fb" stroke-opacity=".16"/>
      <image href="/assets/official-logo.png" x="42" y="35" width="250" height="125" preserveAspectRatio="xMidYMid meet"/>
      <text x="655" y="66" text-anchor="end" fill="#9db2bb" font-size="12">MODÈLE DE DEVIS</text><text x="655" y="94" text-anchor="end" fill="#fff" font-size="22" font-weight="900">APERÇU EN DIRECT</text>
      <rect x="480" y="112" width="175" height="32" rx="16" fill="${terms?'#4c7335':'#8b632d'}"/><text x="567" y="133" text-anchor="middle" fill="#fff" font-size="10" font-weight="800">${terms?'CGV ACCEPTÉES':'CGV À ACCEPTER'}</text>
      ${media}
      <rect x="45" y="452" width="292" height="100" rx="16" fill="#10252e"/><text x="62" y="479" fill="#9bd9ef" font-size="10" font-weight="800">CLIENT</text><text x="62" y="512" fill="#fff" font-size="20" font-weight="900">${esc(client)}</text><text x="62" y="537" fill="#b7cad2" font-size="11">${esc(text('email',text('mobile','Coordonnées à compléter')))}</text>
      <rect x="363" y="452" width="292" height="100" rx="16" fill="#10252e"/><text x="380" y="479" fill="#a9d47b" font-size="10" font-weight="800">${esc(category.toUpperCase())}</text><text x="380" y="512" fill="#fff" font-size="18" font-weight="900">${esc(vehicle)}</text><text x="380" y="537" fill="#b7cad2" font-size="11">${esc(details)}</text>
      <rect x="45" y="570" width="610" height="140" rx="18" fill="#0d2029"/><text x="62" y="594" fill="#9bd9ef" font-size="10" font-weight="800">PRESTATION PROPOSÉE</text>${serviceSvg}
      ${special ? `<rect x="62" y="675" width="250" height="22" rx="11" fill="#684690"/><text x="187" y="690" text-anchor="middle" fill="#fff" font-size="9" font-weight="800">OFFRE SPÉCIALE — ${esc(offerName || 'DIRECTION')}</text>` : ''}
      <rect x="420" y="594" width="210" height="91" rx="16" fill="url(#price)"/><text x="525" y="622" text-anchor="middle" fill="#eef8e8" font-size="10">TOTAL TTC</text><text x="525" y="656" text-anchor="middle" fill="#fff" font-size="26" font-weight="900">${price?esc(money(price)):'À VALIDER'}</text><text x="525" y="676" text-anchor="middle" fill="#eef8e8" font-size="10">Acompte 50 % : ${price?esc(money(price/2)):'—'}</text>
      <rect x="45" y="730" width="610" height="105" rx="16" fill="#10252e"/><text x="62" y="758" fill="#9bd9ef" font-size="10" font-weight="800">AUTORISATIONS CONSERVÉES DANS LE DOSSIER</text><text x="62" y="786" fill="#d9e8ed" font-size="11">Photos techniques : ${technical?'OUI':'NON'} · Usage commercial : ${commercial?'OUI':'NON'} · Éléments identifiables : ${identifiable?'OUI':'NON'}</text><text x="62" y="812" fill="#d9e8ed" font-size="11">Expert : ${checked('expertTransmissionAuthorized')?'TRANSMISSION AUTORISÉE':'TRANSMISSION NON AUTORISÉE'} · E-mail : ${checked('emailAllowed')?'OUI':'NON'} · SMS : ${checked('smsAllowed')?'OUI':'NON'}</text>
      <rect x="45" y="855" width="610" height="70" rx="15" fill="${terms?'#132c22':'#412f1f'}" stroke="${terms?'#91bc5b':'#ffcf72'}" stroke-opacity=".45"/><text x="62" y="882" fill="${terms?'#a9d47b':'#ffcf72'}" font-size="10" font-weight="900">CONDITIONS CONTRACTUELLES</text><text x="62" y="905" fill="#fff" font-size="11">${terms?'CGV acceptées — preuve horodatée dans le dossier.':'CGV à lire et à accepter avant engagement définitif.'}</text>
      <text x="45" y="949" fill="#91a7b0" font-size="9">GentleCarE · ZA Lantegia, 64990 Villefranque · CGV, mentions légales et confidentialité accessibles sous le devis.</text>
    </svg>`;
  }
  window.addEventListener('mavik-quote-change', render);
  document.addEventListener('input', (event) => { if (event.target.closest('#quoteWorkspace')) render(); });
  document.addEventListener('change', (event) => { if (event.target.closest('#quoteWorkspace')) render(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once:true }); else render();
})();
