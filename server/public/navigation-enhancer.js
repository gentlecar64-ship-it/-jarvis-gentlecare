(() => {
  'use strict';
  if (window.__MAVIK_NAVIGATION_ENHANCER__) return;
  window.__MAVIK_NAVIGATION_ENHANCER__ = true;

  const WORKSHOP_URL = '/generated/workshop/index.html';
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
    if (!container || container.querySelector(`a[href="${href}"]`)) return;
    const link = document.createElement('a');
    link.href = href; link.innerHTML = html;
    if (position === 'prepend') container.prepend(link); else container.appendChild(link);
    return link;
  }
  function enhance() {
    document.querySelectorAll('a').forEach((link) => {
      const label = (link.textContent || '').trim().toLowerCase();
      if (label.includes('planning') && !link.href.includes('/planning')) link.href = '/planning';
    });
    const sideNav = document.querySelector('.side .nav');
    if (sideNav && !sideNav.querySelector('a[href="/quotes"]')) {
      const quote = document.createElement('a'); quote.href = '/quotes'; quote.innerHTML = '<b>€</b>Devis';
      sideNav.querySelector('a')?.insertAdjacentElement('afterend', quote);
    }
    const workshopSide = addLink(sideNav, WORKSHOP_URL, '<b>🛠</b>Atelier');
    if (workshopSide) workshopSide.classList.add('workshop-menu');

    const mobile = document.querySelector('.mobile');
    if (mobile) {
      const planning = [...mobile.querySelectorAll('a')].find((link) => /planning/i.test(link.textContent || ''));
      if (planning) planning.href = '/planning';
      addLink(mobile, '/quotes', '<b>€</b>Devis', 'prepend');
      addLink(mobile, WORKSHOP_URL, '<b>🛠</b>Atelier', 'prepend');
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
    setTimeout(ensureWorkshopFiles, 700);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhance, { once: true });
  else enhance();
})();
