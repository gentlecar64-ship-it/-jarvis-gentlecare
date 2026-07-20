(() => {
  'use strict';
  if (window.__MAVIK_NAVIGATION_ENHANCER__) return;
  window.__MAVIK_NAVIGATION_ENHANCER__ = true;

  const WORKSHOP_URL = '/generated/workshop/index.html';
  const LEGAL_URL = '/generated/legal/index.html';
  const KEEPALIVE_INTERVAL_MS = 3 * 60 * 1000;
  const api = async (url, options = {}) => {
    const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Erreur ${response.status}`);
    return data;
  };
  const stageFor = (label, index, total) => {
    const value = String(label || '').toLowerCase();
    if (/identifier|réception|reception|réserves|client.*zones/.test(value)) return '1. Réception et état d’entrée';
    if (/sécuriser|stabiliser|déposer|protéger|consignation|autorisation|accès|balisage/.test(value)) return '2. Préparation et sécurité';
    if (/essai|traiter|cryo|pression|buse|glace|compatibilité/.test(value)) return '3. Traitement cryogénique';
    if (/dinitrol|anticorrosion|masquer|corps creux|produits|lots|séchage/.test(value)) return '4. Protection et traçabilité';
    if (/remonter|serrer/.test(value)) return '5. Remontage et contrôle mécanique';
    if (/contrôle final|rapport|avant\/après|traçabilité spécifique/.test(value) || index === total - 1) return '6. Contrôle final et rapport';
    return '3. Traitement et contrôle';
  };
  const buildSteps = (procedure) => (procedure?.checklist || []).map((label, index, all) => ({
    id: `ETAPE-${String(index + 1).padStart(2, '0')}`, order: index + 1, stage: stageFor(label, index, all.length), label,
    status: 'À faire', mandatory: true, evidenceRequired: /photo|document|tracer|rapport|consigner|autorisation/i.test(label), evidence: [], note: ''
  }));

  async function ensureWorkshopFiles() {
    if (window.__MAVIK_WORKSHOP_BOOTSTRAP__) return;
    window.__MAVIK_WORKSHOP_BOOTSTRAP__ = true;
    try {
      const [quotes, interventions, vehicles, procedures] = await Promise.all([
        api('/api/local/quotes'), api('/api/local/interventions'), api('/api/local/vehicles'), api('/api/workshop/procedures')
      ]);
      const interventionRecords = interventions.records || [];
      const vehicleRecords = vehicles.records || [];
      const procedureRecords = procedures.records || [];
      for (const quote of quotes.records || []) {
        if (!/accept|acompte reçu|intervention planifiée/i.test(`${quote.status || ''} ${quote.workflowStatus || ''}`)) continue;
        const vehicle = vehicleRecords.find((item) => item.id === quote.vehicleId) || {};
        const category = quote.requestCategory || quote.vehicleType || vehicle.requestCategory || vehicle.vehicleType || 'autre';
        const procedure = quote.workshopProcedure || procedureRecords.find((item) => item.requestCategory === category || item.vehicleType === category) || procedureRecords.find((item) => item.requestCategory === 'autre');
        if (!procedure) continue;
        const depositReceived = Boolean(quote.depositReceivedAt || quote.paymentStatus === 'Acompte reçu' || /acompte reçu|intervention planifiée/i.test(quote.workflowStatus || ''));
        let intervention = interventionRecords.find((item) => item.id === quote.interventionId || item.quoteId === quote.id);
        if (!intervention) {
          intervention = await api('/api/local/interventions', { method: 'POST', body: JSON.stringify({
            vehicleId: quote.vehicleId, clientId: quote.clientId, quoteId: quote.id, service: quote.service,
            status: depositReceived ? 'Planifiée' : 'Préparation atelier — acompte en attente', workStatus: 'À préparer',
            workflowStatus: depositReceived ? 'Intervention planifiée' : 'Devis accepté — préparation atelier',
            scheduledDate: quote.estimatedStartDate || '', estimatedStartDate: quote.estimatedStartDate || '', estimatedEndDate: quote.estimatedEndDate || '', estimatedDeliveryDate: quote.estimatedDeliveryDate || '',
            requestCategory: category, workshopProcedureKey: procedure.key, workshopProcedure: procedure, procedureVersion: procedure.version || '1.0',
            procedureSteps: buildSteps(procedure), procedurePreparedAt: new Date().toISOString(), procedurePreparedByName: 'MAVIK',
            workshopLocked: !depositReceived, startAllowed: depositReceived, depositReceived
          }) });
          interventionRecords.push(intervention);
          await api(`/api/local/quotes/${encodeURIComponent(quote.id)}`, { method: 'PATCH', body: JSON.stringify({ interventionId: intervention.id, workshopStatus: intervention.status, workshopProcedureKey: procedure.key }) });
        } else if (depositReceived && intervention.workshopLocked !== false) {
          await api(`/api/local/interventions/${encodeURIComponent(intervention.id)}`, { method: 'PATCH', body: JSON.stringify({ workshopLocked: false, startAllowed: true, depositReceived: true, status: 'Planifiée', workflowStatus: 'Intervention planifiée' }) });
        }
      }
    } catch (error) {
      console.debug('[MAVIK workshop bootstrap]', error.message);
    }
  }

  function addLink(container, href, html, position = 'append') {
    if (!container || container.querySelector(`a[href="${href}"]`)) return null;
    const link = document.createElement('a');
    link.href = href; link.innerHTML = html;
    if (position === 'prepend') container.prepend(link); else container.appendChild(link);
    return link;
  }

  function removeRepairFromOperationalHeaders() {
    if (location.pathname === '/profile') return;
    document.querySelectorAll('button,a').forEach((element) => {
      if (/réparer maintenant/i.test((element.textContent || '').trim())) element.remove();
    });
  }

  function installClock() {
    if (document.getElementById('mavikLiveClock')) return;
    const header = document.querySelector('.topbar,.top,header.top,header');
    if (!header) return;
    const clock = document.createElement('div');
    clock.id = 'mavikLiveClock';
    clock.setAttribute('aria-label', 'Heure actuelle');
    clock.style.cssText = 'min-width:120px;text-align:center;font-weight:900;font-size:18px;letter-spacing:.4px;color:#eef9fd;padding:7px 10px;border:1px solid rgba(218,241,249,.16);border-radius:12px;background:rgba(2,12,17,.55);box-shadow:0 0 18px rgba(145,210,238,.10) inset';
    const update = () => {
      const now = new Date();
      clock.innerHTML = `${now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}<div style="font-size:9px;color:#9ab0ba;font-weight:700;margin-top:2px">${now.toLocaleDateString('fr-FR',{weekday:'short',day:'2-digit',month:'short'})}</div>`;
    };
    update(); setInterval(update, 1000);
    const actions = header.querySelector('.actions,.nav');
    if (actions) actions.parentElement?.insertBefore(clock, actions); else header.appendChild(clock);
  }

  async function finishDay() {
    if (!confirm('Terminer la journée et fermer votre session MAVIK sur cet appareil ?')) return;
    try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch {}
    localStorage.removeItem('gcos_session');
    location.replace('/login?next=/alpha&finJournee=1');
  }

  function installLegalAndSessionFooter() {
    if (document.getElementById('mavikLegalDock')) return;
    const style = document.createElement('style');
    style.textContent = `
      .mavik-legal-dock{position:fixed;z-index:8800;right:12px;bottom:94px;max-width:330px;border:1px solid rgba(218,241,249,.14);border-radius:13px;padding:8px 10px;background:rgba(3,14,20,.92);backdrop-filter:blur(17px);box-shadow:0 18px 55px rgba(0,0,0,.35);font:700 10px/1.35 Inter,Segoe UI,system-ui,sans-serif;color:#a8bec7;text-align:right}.mavik-legal-dock a,.mavik-legal-dock button{color:#d8edf4;background:none;border:0;padding:2px 4px;font:inherit;cursor:pointer;text-decoration:underline}.mavik-legal-dock .online{color:#8fe19d}.mavik-legal-dock .offline{color:#ffcf72}.mavik-legal-dock .version{color:#91d2ee;border:0;padding:0;margin:0;font-size:9px}.mavik-legal-dock .row{display:flex;justify-content:flex-end;gap:5px;align-items:center;flex-wrap:wrap}
      @media(max-width:700px){.mavik-legal-dock{position:fixed;right:5px;bottom:82px;max-width:245px;padding:6px 8px;font-size:9px}.mavik-legal-dock .legal-links{display:none}}
    `;
    document.head.appendChild(style);
    const dock = document.createElement('aside');
    dock.id = 'mavikLegalDock';
    dock.className = 'mavik-legal-dock';
    dock.innerHTML = `<div class="row"><span id="mavikOnlineState" class="online">● MAVIK en ligne</span><span id="mavikVersion" class="version"></span></div><div class="row legal-links"><a href="${LEGAL_URL}">Mentions légales</a><a href="https://www.gentlecare.fr/conditionsgenerales" target="_blank" rel="noopener">CGV</a><a href="https://www.gentlecare.fr/politiquedeconfidentialit%C3%A9" target="_blank" rel="noopener">Confidentialité</a></div><div class="row"><button id="mavikFinishDay" type="button">Fin de journée</button></div>`;
    document.body.appendChild(dock);
    document.getElementById('mavikFinishDay').onclick = finishDay;
    api('/health').then((health) => { const version = document.getElementById('mavikVersion'); if (version) version.textContent = `v${health.version || ''}`; }).catch(() => {});
  }

  async function keepSessionAlive() {
    const state = document.getElementById('mavikOnlineState');
    try {
      await api('/api/auth/me');
      if (state) { state.textContent = '● MAVIK en ligne'; state.className = 'online'; }
    } catch (error) {
      if (state) { state.textContent = navigator.onLine ? '● Session à vérifier' : '● Hors connexion'; state.className = 'offline'; }
    }
  }

  function installKeepAlive() {
    keepSessionAlive();
    setInterval(keepSessionAlive, KEEPALIVE_INTERVAL_MS);
    window.addEventListener('online', keepSessionAlive);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) keepSessionAlive(); });
  }

  function enhance() {
    document.querySelectorAll('a').forEach((link) => {
      const label = (link.textContent || '').trim().toLowerCase();
      if (label.includes('planning') && !link.href.includes('/planning')) link.href = '/planning';
    });
    const sideNav = document.querySelector('.side .nav,.sidebar .nav');
    if (sideNav && !sideNav.querySelector('a[href="/quotes"]')) {
      const quote = document.createElement('a'); quote.href = '/quotes'; quote.innerHTML = '<b>€</b>Devis';
      sideNav.querySelector('a')?.insertAdjacentElement('afterend', quote);
    }
    const workshopSide = addLink(sideNav, WORKSHOP_URL, '<b>🛠</b>Atelier');
    if (workshopSide) workshopSide.classList.add('workshop-menu');
    addLink(sideNav, '/procedures', '<b>☷</b>Procédures');
    addLink(sideNav, '/airtable', '<b>↔</b>Airtable');

    const mobile = document.querySelector('.mobile');
    if (mobile) {
      const planning = [...mobile.querySelectorAll('a')].find((link) => /planning/i.test(link.textContent || ''));
      if (planning) planning.href = '/planning';
      addLink(mobile, '/quotes', '<b>€</b>Devis', 'prepend');
      addLink(mobile, WORKSHOP_URL, '<b>🛠</b>Atelier', 'prepend');
      addLink(mobile, '/procedures', '<b>☷</b>Procédures', 'prepend');
    }
    const heroButtons = document.querySelector('.hero-buttons');
    if (heroButtons && !heroButtons.querySelector('a[href="/quotes"]')) {
      const quote = document.createElement('a'); quote.href = '/quotes'; quote.className = 'button primary'; quote.textContent = 'Créer un devis'; heroButtons.prepend(quote);
      const planning = document.createElement('a'); planning.href = '/planning'; planning.className = 'button'; planning.textContent = 'Ouvrir le planning'; quote.insertAdjacentElement('afterend', planning);
    }
    if (heroButtons && !heroButtons.querySelector(`a[href="${WORKSHOP_URL}"]`)) {
      const workshop = document.createElement('a'); workshop.href = WORKSHOP_URL; workshop.className = 'button'; workshop.textContent = 'Ouvrir l’atelier'; heroButtons.appendChild(workshop);
    }
    const quick = document.querySelector('.quick');
    if (quick && !quick.querySelector('a[href="/quotes"]')) {
      const quote = document.createElement('a'); quote.href = '/quotes'; quote.className = 'button'; quote.textContent = '€ Devis manuel et vocal'; quick.prepend(quote);
      const planning = document.createElement('a'); planning.href = '/planning'; planning.className = 'button'; planning.textContent = '▣ Planning complet'; quote.insertAdjacentElement('afterend', planning);
    }
    if (quick && !quick.querySelector(`a[href="${WORKSHOP_URL}"]`)) {
      const workshop = document.createElement('a'); workshop.href = WORKSHOP_URL; workshop.className = 'button'; workshop.textContent = '🛠 Procédure atelier'; quick.prepend(workshop);
    }
    addLink(quick, '/procedures', '☷ Référentiel procédures', 'prepend');
    addLink(quick, '/airtable', '↔ Cockpit Airtable', 'prepend');
    removeRepairFromOperationalHeaders();
    installClock();
    installLegalAndSessionFooter();
    installKeepAlive();
    setTimeout(ensureWorkshopFiles, 700);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhance, { once: true });
  else enhance();
})();
