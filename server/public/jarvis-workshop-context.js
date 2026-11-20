(() => {
  'use strict';
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  async function api(url) { const response = await fetch(url); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || `Erreur ${response.status}`); return data; }
  async function load() {
    try {
      const [overview, me] = await Promise.all([api('/api/workshop/overview'), api('/api/auth/me')]);
      const records = overview.records || [];
      const panel = document.createElement('section');
      panel.className = 'panel';
      panel.innerHTML = `<h2>Contexte atelier et rapports</h2><div class="muted">Jarvis utilise ces états pour proposer la prochaine action sans contourner les validations.</div><div>${records.slice(0, 4).map((record) => {
        const readiness = record.reportReadiness || {};
        const next = (record.procedureSteps || []).find((step) => step.status !== 'Terminée');
        const status = readiness.url ? readiness.status : next ? `Prochaine : ${next.id}` : readiness.directionApproved ? 'Rapport à préparer' : 'Contrôle direction requis';
        return `<div class="item"><div class="ico">${readiness.url ? '▤' : '⚙'}</div><div><strong>${esc(record.number || record.vehicle?.model || 'Intervention')}</strong><div class="meta">${Number(record.progress?.percent || 0)} % · ${esc(status)}</div></div><span class="pill">${esc(record.requestCategory || 'atelier')}</span></div>`;
      }).join('') || '<div class="muted" style="margin-top:12px">Aucun dossier atelier actif.</div>'}</div><div style="margin-top:10px"><a class="button" href="/workshop">Ouvrir l’Atelier</a></div>`;
      document.querySelector('.layout > .stack:last-child')?.prepend(panel);
      if (me.user?.role === 'admin') {
        const update = await api('/api/system/update');
        const note = document.createElement('div');
        note.className = 'muted'; note.style.marginTop = '10px';
        note.textContent = `Mises à jour : ${update.schedule?.label || 'créneau à définir'} · ${update.schedule?.ownerName || 'propriétaire à définir'} · ${update.schedule?.allowed ? 'créneau ouvert' : 'créneau fermé'}.`;
        panel.appendChild(note);
      }
    } catch (error) { console.warn('[MAVIK CONTEXTE ATELIER]', error.message); }
  }
  load();
})();
