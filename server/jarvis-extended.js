'use strict';

const core = require('./jarvis');
const quoteWorkflow = require('./quote-workflow-reference');
const quoteStudio = require('./quote-studio-service');
const planning = require('./planning-service');
const clientIntake = require('./client-intake');
const intelligence = require('./jarvis-intelligence');
const interventionReport = require('./intervention-report');
const employeeFlow = require('./employee-flow');
const leavePlanning = require('./leave-planning');
const morale = require('./jarvis-morale');

function normalize(value) { return String(value || '').trim().toLowerCase(); }
function presentEntries(value = {}) { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== '' && item !== 0 && item !== undefined && item !== null)); }

function isQuoteCreation(text) {
  const value = normalize(text);
  return /devis/.test(value) && /(crée|cree|créer|creer|prépare|prepare|faire|fais|nouveau|lance|ouvrir|ouvre)/.test(value);
}

function transitionIntent(text) {
  const value = normalize(text);
  if (/devis.*accept|client.*accept|acceptation.*devis/.test(value)) return { action: 'accept' };
  if (/acompte.*reçu|acompte.*recu|reçu.*acompte|recu.*acompte/.test(value)) return { action: 'deposit-received' };
  if (/démarre.*intervention|demarre.*intervention|véhicule.*en cours|vehicule.*en cours/.test(value)) return { action: 'start' };
  if (/retard|délai.*allong|delai.*allong|prolonge.*délai|prolonge.*delai/.test(value)) {
    const days = Number((value.match(/(\d+)\s*jour/) || [])[1] || 1);
    const reasonMatch = String(text || '').match(/(?:car|parce que|raison|motif)\s+(.+)/i);
    return { action: 'delay', payload: { extraDays: days, reason: reasonMatch?.[1] || '' } };
  }
  if (/intervention.*termin|véhicule.*termin|vehicule.*termin|travaux.*termin/.test(value)) return { action: 'complete' };
  if (/règlement.*reçu|reglement.*recu|solde.*reçu|solde.*recu|paiement.*reçu|paiement.*recu/.test(value)) return { action: 'payment-received' };
  if (/(?:je|il|elle|nous)\s+(?:prends|prend|prenons).*dossier|prend.*showroom/.test(value)) return { action: 'showroom-claim' };
  if (/housse.*pos|showroom.*prêt|showroom.*pret|véhicule.*propre.*housse|vehicule.*propre.*housse/.test(value)) return { action: 'showroom-ready', payload: { coverInstalled: true } };
  if (/cl[oô]ture.*dossier|dossier.*cl[oô]tur/.test(value)) return { action: 'close' };
  if (/archive.*dossier|dossier.*archive/.test(value)) return { action: 'archive' };
  return null;
}

function finish(store, input, result) {
  const intelligent = intelligence.enrich(store, input, result);
  return morale.decorate(input.user || {}, intelligent, input);
}

function reportIntent(text) {
  const value = normalize(text);
  if (!/rapport/.test(value)) return '';
  if (/valide|validation|approuve|prêt à remettre|pret a remettre/.test(value)) return 'validate';
  if (/génère|genere|crée|cree|prépare|prepare|régénère|regenere|mets à jour|met a jour|actualise/.test(value)) return 'generate';
  return '';
}

function resolveIntervention(store, user, text) {
  const numberMatch = String(text || '').match(/GC-\d{4}-\d{4}/i);
  if (numberMatch) return store.list('interventions').find((item) => String(item.number || '').toUpperCase() === numberMatch[0].toUpperCase()) || null;
  const context = intelligence.linkedContext(store, user);
  if (context.intervention) return context.intervention;
  if (context.quote?.interventionId) return store.list('interventions').find((item) => item.id === context.quote.interventionId) || null;
  return null;
}

function handleReport(store, input, text, user) {
  const intent = reportIntent(text);
  if (!intent) return null;
  const intervention = resolveIntervention(store, user, text);
  if (!intervention) return { type: 'intervention-report-missing-context', answer: 'Je n’ai pas d’intervention sélectionnée. Ouvrez d’abord le dossier ou donnez-moi le numéro GC de l’intervention.', actions: [{ label: 'Résumer le dossier courant', command: 'Résume le dossier courant' }] };
  const patch = input.report || input.reportData || {};
  const generated = intent === 'validate'
    ? interventionReport.validate(store, intervention.id, { ...patch, managerValidation: patch.managerValidation || user.name }, user)
    : interventionReport.generate(store, intervention.id, patch, user);
  return {
    type: intent === 'validate' ? 'intervention-report-validated' : 'intervention-report-generated',
    answer: intent === 'validate'
      ? `Le rapport ${generated.report.reportNumber}, version ${generated.report.version}.0, est validé en interne et prêt à remettre. Une nouvelle version horodatée a été conservée.`
      : `Le rapport de référence ${generated.report.reportNumber}, version ${generated.report.version}.0, est généré en brouillon bloqué. Ses 12 sections sont présentes. ${generated.report.completeness.missing.length ? `Il manque encore : ${generated.report.completeness.missing.join(', ')}.` : 'Les champs structurants sont renseignés ; une validation humaine reste obligatoire.'}`,
    data: generated,
    links: [{ label: `Ouvrir le rapport ${generated.report.reportNumber}`, url: generated.htmlUrl }],
    actions: intent === 'validate' ? [] : [{ label: 'Valider le rapport', command: `Valide le rapport ${intervention.number}` }]
  };
}

function handlePlanning(store, text) {
  const value = normalize(text);
  if (!/planning|créneau|creneau|disponibilit/.test(value)) return null;
  if (/ouvre|affiche|montre|voir/.test(value) && /planning/.test(value)) {
    return { type: 'planning-open', answer: 'J’ouvre le planning complet. Vous y trouverez les inspections, interventions, livraisons, tâches, congés et indisponibilités.', links: [{ label: 'Ouvrir le planning', url: '/planning' }] };
  }
  if (/prochain|premier|disponible|propose/.test(value)) {
    const duration = Number((value.match(/(\d+)\s*jour/) || [])[1] || 2);
    const proposal = planning.propose(store, { durationDays: duration });
    return {
      type: 'planning-proposal',
      answer: proposal.blocked
        ? proposal.status
        : `Le prochain créneau proposé prévoit une inspection le ${proposal.inspection.date} à ${proposal.inspection.time}, puis une intervention du ${proposal.intervention.startDate} au ${proposal.intervention.endDate}, avec une livraison estimée le ${proposal.intervention.deliveryDate}. La proposition doit être validée dans le planning.`,
      data: proposal,
      links: [{ label: 'Vérifier dans le planning', url: '/planning' }]
    };
  }
  const overview = planning.overview(store, { days: 14 });
  return {
    type: 'planning-summary',
    answer: `Sur les 14 prochains jours, le planning contient ${overview.events.length} événement(s) et ${overview.unscheduledQuotes.length} devis à planifier. Les employés peuvent avancer un travail, mais aucune date ne peut être repoussée sans validation responsable.`,
    data: overview,
    links: [{ label: 'Ouvrir le planning', url: '/planning' }]
  };
}

function handleLeave(store, text, user) {
  const value = normalize(text);
  if (!/congé|conge|vacance|absence/.test(value)) return null;
  if (/ouvre|affiche|montre|voir/.test(value)) return { type: 'leave-open', answer: 'J’ouvre le planning des congés. Vous pouvez demander un avis, obtenir un accord de principe puis attendre la validation du responsable.', links: [{ label: 'Planning et congés', url: '/planning#leave' }] };
  const period = leavePlanning.parsePeriod(text);
  if (!period.startDate) return { type: 'leave-missing-dates', answer: 'Donnez-moi une date de début et une date de fin, par exemple : « Puis-je poser du 12/08/2026 au 16/08/2026 ? »', links: [{ label: 'Ouvrir la demande de congé', url: '/planning#leave' }] };
  const result = leavePlanning.advice(store, period, user);
  const warnings = result.warnings.length ? ` Points à vérifier : ${result.warnings.join(' ')}` : '';
  return {
    type: 'leave-principle-advice',
    answer: `${result.principleStatus}, avec un score opérationnel de ${result.score}/100. Cet avis n’est pas une validation définitive.${warnings}`,
    data: result,
    links: [{ label: 'Soumettre la demande au responsable', url: `/planning#leave?start=${encodeURIComponent(result.startDate)}&end=${encodeURIComponent(result.endDate)}` }]
  };
}

function findWorkTarget(store, text, user) {
  const queue = employeeFlow.queue(store, user);
  const gc = String(text || '').match(/GC-\d{4}-\d{4}/i)?.[0];
  if (gc) return queue.interventions.find((item) => String(item.number || '').toUpperCase() === gc.toUpperCase()) || null;
  const context = intelligence.linkedContext(store, user);
  if (context.intervention && queue.interventions.some((item) => item.id === context.intervention.id)) return { ...context.intervention, targetType: 'intervention' };
  const normalizedText = normalize(text);
  return [...queue.tasks, ...queue.interventions].find((item) => normalizedText.includes(normalize(item.displayLabel || item.title || item.number || ''))) || null;
}

function handleEmployeeFlow(store, text, user) {
  const value = normalize(text);
  if (!/en attente|pause|reprend|reprendre|continue|commence|démarre|demarre|termine|finis|mon travail|ma checklist/.test(value)) return null;
  if (/mon travail|ma checklist|quoi faire/.test(value)) {
    const queue = employeeFlow.queue(store, user);
    return { type: 'employee-work-queue', answer: `Vous avez ${queue.interventions.length} intervention(s) et ${queue.tasks.length} tâche(s) ouvertes. ${queue.activeInterventions.length || queue.activeTasks.length ? 'Un travail est actuellement en cours.' : 'Aucun travail n’est actuellement démarré.'}`, data: queue, links: [{ label: 'Ouvrir ma checklist dans le planning', url: '/planning#my-work' }] };
  }
  const target = findWorkTarget(store, text, user);
  if (!target) return { type: 'employee-work-target-missing', answer: 'Je n’ai pas identifié le véhicule ou la tâche. Ouvrez « Mon travail » dans le planning et choisissez directement l’élément.', links: [{ label: 'Ouvrir ma checklist', url: '/planning#my-work' }] };
  let action = '';
  if (/en attente|pause/.test(value)) action = 'pause';
  else if (/termine|finis/.test(value)) action = 'complete';
  else if (/reprend|reprendre|continue/.test(value)) action = 'resume';
  else if (/commence|démarre|demarre/.test(value)) action = 'start';
  if (!action) return null;
  const result = employeeFlow.act(store, { targetType: target.targetType, targetId: target.id, action, reason: 'Commande Jarvis' }, user);
  const early = result.item.startedAheadOfSchedule ? ' Le démarrage en avance est enregistré sans repousser les dates promises.' : '';
  return { type: `employee-work-${action}`, answer: `${target.displayLabel || target.title || target.number} : ${result.item.workStatus || result.item.status}.${result.paused.length ? ` ${result.paused.length} autre élément a été mis en attente automatiquement.` : ''}${early}`, data: result, links: [{ label: 'Voir mon planning', url: '/planning#my-work' }] };
}

function packageKeyFromSpeech(text) {
  const value = normalize(text);
  if (/fondateur/.test(value)) return 'integral-founder';
  if (/tarif club|membre.*club|\bclub\b/.test(value)) return 'integral-club';
  if (/pack intégral|pack integral|cryo.*dinitrol|dinitrol.*cryo/.test(value)) return 'integral-public';
  return '';
}

function activeDossierInput(store, user) {
  const context = intelligence.linkedContext(store, user);
  const client = context.client || {};
  const vehicle = context.vehicle || {};
  return presentEntries({
    clientId: client.id,
    clientName: client.name,
    email: client.email,
    mobile: client.mobile || client.phone,
    address: client.address,
    preferredChannel: client.preferredChannel,
    vehicleId: vehicle.id,
    brand: vehicle.brand,
    model: vehicle.model,
    trim: vehicle.trim || vehicle.series,
    registration: vehicle.registration,
    vin: vehicle.vin,
    color: vehicle.color,
    year: vehicle.year,
    mileage: vehicle.mileage,
    photoUrl: vehicle.photoUrl,
    vehicleNotes: vehicle.notes,
    clientEstimatedValue: vehicle.clientEstimatedValue
  });
}

function handleQuoteStudio(store, input, text, user) {
  if (!isQuoteCreation(text)) return null;
  const parsed = presentEntries(quoteStudio.parseSpeech({ text }));
  const activeDossier = activeDossierInput(store, user);
  const packageKey = packageKeyFromSpeech(text);
  const dossierInput = { ...activeDossier, ...presentEntries(input), ...parsed, ...(packageKey ? { packageKey } : {}), text };
  const hasDossierInformation = Boolean(dossierInput.clientId || dossierInput.clientName || dossierInput.email || dossierInput.mobile || dossierInput.brand || dossierInput.model || dossierInput.registration);
  if (!hasDossierInformation) {
    return {
      type: 'quote-studio-open',
      answer: 'J’ouvre l’atelier Devis. Le formulaire manuel et la dictée y remplissent les mêmes informations. Rien ne sera créé avant votre validation finale.',
      links: [{ label: 'Ouvrir l’atelier Devis', url: '/quotes' }]
    };
  }
  const result = quoteStudio.preview(store, dossierInput, user);
  return {
    type: 'quote-studio-voice-preview',
    answer: `J’ai analysé la demande sans créer de fiche ni de devis. ${result.data.missingFields.length ? `Il manque : ${result.data.missingFields.join(', ')}.` : 'Les informations principales sont présentes.'} Ouvrez l’atelier Devis pour vérifier le prix, les valeurs du véhicule, l’expertise éventuelle et le planning avant validation.`,
    data: result,
    links: [{ label: 'Continuer dans l’atelier Devis', url: '/quotes' }]
  };
}

function execute(store, input = {}) {
  const text = String(input.text || input.command || '').trim();
  const user = input.user || {};
  const smartText = /qu['’]est-ce qu['’]il manque/i.test(text) ? 'Quels champs manquent dans le dossier courant ?' : text;
  const enrichedInput = { ...input, text: smartText, command: smartText, user };

  const reportResult = handleReport(store, enrichedInput, text, user);
  if (reportResult) return finish(store, enrichedInput, reportResult);

  const leaveResult = handleLeave(store, text, user);
  if (leaveResult) return finish(store, enrichedInput, leaveResult);

  const employeeResult = handleEmployeeFlow(store, text, user);
  if (employeeResult) return finish(store, enrichedInput, employeeResult);

  const planningResult = handlePlanning(store, text);
  if (planningResult) return finish(store, enrichedInput, planningResult);

  const quoteStudioResult = handleQuoteStudio(store, enrichedInput, text, user);
  if (quoteStudioResult) return finish(store, enrichedInput, quoteStudioResult);

  const smart = intelligence.handle(store, enrichedInput);
  if (smart) return finish(store, enrichedInput, smart);

  if (clientIntake.isLookupCommand(text) && !isQuoteCreation(text)) {
    const result = clientIntake.lookup(store, text);
    return finish(store, enrichedInput, {
      type: 'client-dossier',
      answer: result.answer,
      data: result,
      links: result.found ? [{ label: `Dossier de ${result.client.name || 'ce client'}`, url: `/jarvis?client=${encodeURIComponent(result.client.id)}` }] : []
    });
  }

  const intent = transitionIntent(text);
  if (intent?.action === 'delay' && !['admin', 'associate'].includes(user.role)) {
    return finish(store, enrichedInput, { type: 'employee-delay-blocked', answer: 'Je peux vous aider à avancer ou à mettre le travail en attente, mais un retard ou un report de date doit être validé par David ou Bénédicte. Les dates client ne sont pas modifiées.', links: [{ label: 'Ouvrir le planning', url: '/planning' }] });
  }
  if (intent) return finish(store, enrichedInput, quoteWorkflow.transition(store, text, intent.action, { ...(intent.payload || {}), assignee: user.name || '', report: input.report || input.reportData || {} }, user));

  if (/finalise|finaliser|régénère|regenere|regénère|mets à jour.*devis|met a jour.*devis/i.test(text) && /devis/i.test(text)) {
    const result = quoteWorkflow.regenerate(store, text, {
      photoDataUrl: input.photoDataUrl || '',
      photoName: input.photoName || '',
      vehiclePhotoUrl: input.photoUrl || ''
    }, user);
    return finish(store, enrichedInput, {
      type: 'quote-regenerated',
      answer: result.missingFields.length
        ? `Le devis ${result.quote.number} est régénéré, mais reste à finaliser. Il manque : ${result.missingFields.join(', ')}. Visuel : ${result.visualUrl}`
        : `Le devis ${result.quote.number} est régénéré et prêt à valider : ${result.visualUrl}`,
      data: result,
      links: [{ label: `Ouvrir le devis ${result.quote.number}`, url: result.visualUrl }]
    });
  }

  return finish(store, enrichedInput, core.execute(store, enrichedInput));
}

module.exports = { ...core, execute, quoteWorkflow, quoteStudio, planning, clientIntake, intelligence, interventionReport, employeeFlow, leavePlanning, morale };
