'use strict';

const core = require('./jarvis');
const quoteWorkflow = require('./quote-workflow');
const clientIntake = require('./client-intake');
const intelligence = require('./jarvis-intelligence');

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

function execute(store, input = {}) {
  const text = String(input.text || input.command || '').trim();
  const user = input.user || {};
  const smartText = /qu['’]est-ce qu['’]il manque/i.test(text) ? 'Quels champs manquent dans le dossier courant ?' : text;
  const enrichedInput = { ...input, text: smartText, command: smartText, user };

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
  if (intent) return finish(store, enrichedInput, quoteWorkflow.transition(store, text, intent.action, { ...(intent.payload || {}), assignee: user.name || '' }, user));

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

module.exports = { ...core, execute, quoteWorkflow, clientIntake, intelligence };
