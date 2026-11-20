'use strict';

const fs = require('node:fs');
const path = require('node:path');
const quoteWorkflow = require('./quote-workflow');

const TERMS_URL = 'https://www.gentlecare.fr/conditionsgenerales';
const PRIVACY_URL = 'https://www.gentlecare.fr/politiquedeconfidentialit%C3%A9';
const LEGAL_URL = 'https://www.gentlecare.fr/about-1';
const COMPANY_LEGAL_FOOTER = 'GentleCarE · ZA Lantegia, 64990 Villefranque · RCS Bayonne 105 817 647 · SIRET 105 817 647 00016 · Capital publié : 10 000 €';
const COMPANY_CONTACT = '07 67 75 72 07 · gentlecar64@gmail.com';
const PUBLIC_DIR = path.join(__dirname, 'public');

function safeList(store, collection) { try { return store.list(collection) || []; } catch { return []; } }
function normalizeLegalText(value) {
  return String(value || '')
    .replace(/SIRET\s*950\s*325\s*466\s*00012\s*·\s*Capital social\s*10\s*000\s*€\s*·\s*david@gentlecare\.fr\s*·\s*benedicte@gentlecare\.fr/gi, `${COMPANY_LEGAL_FOOTER} · ${COMPANY_CONTACT}`)
    .replace(/950\s*325\s*466\s*00012/g, '105 817 647 00016')
    .replace(/david@gentlecare\.fr\s*·\s*benedicte@gentlecare\.fr/gi, 'gentlecar64@gmail.com');
}
function patchVisualUrl(visualUrl) {
  if (!visualUrl || !String(visualUrl).startsWith('/generated/quotes/')) return false;
  const relative = decodeURIComponent(String(visualUrl).replace(/^\/+/, ''));
  const target = path.resolve(PUBLIC_DIR, relative);
  if (!target.startsWith(path.resolve(PUBLIC_DIR)) || !fs.existsSync(target)) return false;
  const before = fs.readFileSync(target, 'utf8');
  let after = normalizeLegalText(before);
  if (!after.includes('RCS Bayonne 105 817 647')) {
    const legal = `<text x="72" y="1928" font-size="13" fill="#78909a">${COMPANY_LEGAL_FOOTER} · ${COMPANY_CONTACT}</text>`;
    after = after.replace('</svg>', `${legal}</svg>`);
  }
  if (after === before) return false;
  fs.writeFileSync(target, after, 'utf8');
  return true;
}
function applyInvoiceLegalRecord(store, quote = {}, intervention = {}, user = {}) {
  const invoice = safeList(store, 'documents').find((document) => document.id === quote.invoiceId || (document.quoteId === quote.id && document.category === 'Facture'));
  if (!invoice) return null;
  const termsStatus = quote.termsAccepted ? `CGV acceptées le ${quote.termsAcceptedAt || 'date conservée dans le dossier'} par ${quote.termsAcceptedBy || 'client ou représentant renseigné'}` : 'CGV non marquées comme acceptées dans MAVIK — contrôle obligatoire avant émission définitive';
  const content = [
    `FACTURE À GÉNÉRER — ${intervention.number || quote.number || ''}`,
    `Montant TTC : ${Number(invoice.amountTtc || quote.totalTtc || 0).toLocaleString('fr-FR', { style:'currency', currency:'EUR' })}`,
    `Solde TTC : ${Number(invoice.balanceTtc || quote.balanceTtc || 0).toLocaleString('fr-FR', { style:'currency', currency:'EUR' })}`,
    '', COMPANY_LEGAL_FOOTER, COMPANY_CONTACT,
    `Conditions générales : ${TERMS_URL}`,
    `Mentions légales : ${LEGAL_URL}`,
    `Confidentialité : ${PRIVACY_URL}`,
    termsStatus,
    'Document préparé par MAVIK. Validation comptable et direction obligatoire avant envoi.'
  ].join('\n');
  return store.update('documents', invoice.id, {
    content,
    legalFooter:COMPANY_LEGAL_FOOTER,
    legalContact:COMPANY_CONTACT,
    termsUrl:TERMS_URL,
    privacyUrl:PRIVACY_URL,
    legalNoticeUrl:LEGAL_URL,
    termsAccepted:Boolean(quote.termsAccepted),
    termsAcceptedAt:quote.termsAcceptedAt || '',
    termsAcceptedBy:quote.termsAcceptedBy || '',
    technicalMediaAuthorized:Boolean(quote.technicalMediaAuthorized),
    commercialMediaAuthorized:Boolean(quote.commercialMediaAuthorized),
    identifiableMediaAuthorized:Boolean(quote.identifiableMediaAuthorized),
    legalRecordAppliedAt:new Date().toISOString(),
    legalRecordAppliedBy:user.name || user.id || 'MAVIK'
  });
}

if (!quoteWorkflow.__mavikLegalDocumentHooked) {
  const originalStartIntake = quoteWorkflow.startIntake.bind(quoteWorkflow);
  quoteWorkflow.startIntake = function startIntakeWithLegalVisual(store, input = {}) {
    const result = originalStartIntake(store, input);
    patchVisualUrl(result?.data?.quote?.visualUrl || result?.data?.visualUrl || result?.visualUrl);
    return result;
  };
  const originalRegenerate = quoteWorkflow.regenerate.bind(quoteWorkflow);
  quoteWorkflow.regenerate = function regenerateWithLegalVisual(store, quoteReference, patch = {}, user = {}) {
    const result = originalRegenerate(store, quoteReference, patch, user);
    patchVisualUrl(result?.visualUrl || result?.quote?.visualUrl);
    return result;
  };
  const originalTransition = quoteWorkflow.transition.bind(quoteWorkflow);
  quoteWorkflow.transition = function transitionWithLegalDocuments(store, quoteReference, action, payload = {}, user = {}) {
    const result = originalTransition(store, quoteReference, action, payload, user);
    if (action === 'complete' && result?.data?.quote) result.data.invoice = applyInvoiceLegalRecord(store, result.data.quote, result.data.intervention || {}, user);
    return result;
  };
  quoteWorkflow.__mavikLegalDocumentHooked = true;
}

module.exports = { TERMS_URL, PRIVACY_URL, LEGAL_URL, COMPANY_LEGAL_FOOTER, COMPANY_CONTACT, normalizeLegalText, patchVisualUrl, applyInvoiceLegalRecord };
