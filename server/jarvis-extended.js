'use strict';

const core = require('./jarvis');
const quoteWorkflow = require('./quote-workflow-reference');
const clientIntake = require('./client-intake');
const intelligence = require('./jarvis-intelligence');
const interventionReport = require('./intervention-report');

function normalize(value) { return String(value || '').trim().toLowerCase(); }

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
  return intelligence.enrich(store, input, result);
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

function execute(store, input = {}) {
  const text = String(input.text || input.command || '').trim();
  const user = input.user || {};
  const smartText = /qu['’]est-ce qu['’]il manque/i.test(text) ? 'Quels champs manquent dans le dossier courant ?' : text;
  const enrichedInput = { ...input, text: smartText, command: smartText, user };

  const reportResult = handleReport(store, enrichedInput, text, user);
  if (reportResult) return finish(store, enrichedInput, reportResult);

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

  if (isQuoteCreation(text)) return finish(store, enrichedInput, quoteWorkflow.startIntake(store, enrichedInput));

  const intent = transitionIntent(text);
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

module.exports = { ...core, execute, quoteWorkflow, clientIntake, intelligence, interventionReport };
