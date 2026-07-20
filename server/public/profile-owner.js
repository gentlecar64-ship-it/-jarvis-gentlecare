(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  let profile = null;
  let ownerState = null;

  async function api(url, options = {}) {
    const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Erreur ${response.status}`);
    return data;
  }
  function message(id, value, bad = false) {
    const node = $(id);
    if (!node) return;
    node.textContent = value;
    node.className = `message ${bad ? 'bad' : 'ok'}`;
  }
  function ensureTimeZoneField() {
    if ($('updateTimeZone')) return;
    const field = document.createElement('div');
    field.innerHTML = '<label for="updateTimeZone">Fuseau horaire</label><select id="updateTimeZone"><option value="Europe/Paris">France — Europe/Paris</option><option value="UTC">UTC</option></select><div class="muted" style="margin-top:6px">Un créneau 18:00 → 07:30 traverse minuit ; le jour coché désigne le soir où il commence.</div>';
    $('updateScheduleForm')?.querySelector('.field-grid')?.after(field);
  }
  function render() {
    const user = profile?.user || {};
    const owner = ownerState?.owner || {};
    document.body.classList.toggle('owner', user.systemOwner === true);
    $('ownerBadge').textContent = owner.name ? `Propriétaire : ${owner.name}` : 'Aucun propriétaire';
    $('ownerNotice').textContent = ownerState?.canTransfer
      ? 'Vous détenez la propriété MAVIK. Le transfert prend effet immédiatement et ne supprime aucun compte.'
      : `Seul ${owner.name || 'le propriétaire actuel'} peut transférer cette responsabilité.`;
    const select = $('systemOwnerSelect');
    select.replaceChildren(...(ownerState?.candidates || []).map((candidate) => {
      const option = document.createElement('option');
      option.value = candidate.id;
      option.textContent = `${candidate.name} — ${candidate.email}`;
      option.selected = candidate.id === owner.id;
      return option;
    }));
    select.disabled = !ownerState?.canTransfer;
    $('ownerSaveButton').hidden = !ownerState?.canTransfer;
    ensureTimeZoneField();
    const preferences = owner.preferences || user.preferences || {};
    $('updateTimeZone').value = preferences.updateTimeZone || 'Europe/Paris';
    const updateText = $('updatePanel')?.querySelector('.muted');
    if (updateText) updateText.textContent = 'Les contrôles continuent toutes les 15 minutes. Sauvegarde, installation et redémarrage ont lieu uniquement dans le créneau choisi par le propriétaire MAVIK.';
  }
  async function load() {
    try {
      profile = await api('/api/profile');
      if (profile.user?.role !== 'admin') return;
      ownerState = await api('/api/system/owner');
      render();
    } catch (error) { message('ownerMessage', error.message, true); }
  }

  $('ownerForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const selected = $('systemOwnerSelect').value;
    if (!selected || selected === ownerState?.owner?.id) return message('ownerMessage', 'Ce compte est déjà propriétaire de MAVIK.');
    if (!confirm('Transférer la propriété du système MAVIK à cet administrateur ?')) return;
    try {
      ownerState = await api('/api/system/owner', { method: 'PATCH', body: JSON.stringify({ userId: selected }) });
      profile = await api('/api/profile');
      render();
      message('ownerMessage', 'Propriété MAVIK transférée. Le nouveau propriétaire contrôle désormais les horaires de mise à jour.');
    } catch (error) { message('ownerMessage', error.message, true); }
  });

  $('updateScheduleForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (profile?.user?.systemOwner !== true) return message('updateScheduleMessage', 'Seul le propriétaire MAVIK peut modifier ce créneau.', true);
    try {
      const preferences = {
        updateWindowStart: $('updateWindowStart').value,
        updateWindowEnd: $('updateWindowEnd').value,
        updateTimeZone: $('updateTimeZone')?.value || 'Europe/Paris',
        updateDays: [...document.querySelectorAll('#updateDays input:checked')].map((input) => Number(input.value)),
        updateAutoInstall: $('updateAutoInstall').checked
      };
      profile = await api('/api/profile', { method: 'PATCH', body: JSON.stringify({ preferences }) });
      message('updateScheduleMessage', `Créneau enregistré : ${preferences.updateWindowStart}–${preferences.updateWindowEnd} (${preferences.updateTimeZone}).`);
    } catch (error) { message('updateScheduleMessage', error.message, true); }
  }, true);

  load();
})();
