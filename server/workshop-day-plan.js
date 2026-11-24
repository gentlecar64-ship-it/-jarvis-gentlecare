'use strict';

const DAY_START = '08:30';
const MORNING_END = '12:00';
const AFTERNOON_START = '13:30';
const DAY_END = '17:00';
const DIRECTION_ROLES = new Set(['admin', 'associate']);

function text(value) { return String(value || '').trim(); }
function safeList(store, collection) { try { return store.list(collection) || []; } catch { return []; } }
function direction(user = {}) { return DIRECTION_ROLES.has(user.role); }
function dateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}
function minutes(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}
function timeFromMinutes(total) { return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; }
function activeStatus(value) { return !/annul|archiv|refus|terminé/i.test(text(value)); }
function personMatches(record = {}, user = {}, requestedName = '') {
  const target = text(requestedName || user.name || user.username).toLowerCase();
  const ids = [record.technicianId, record.assignedUserId, record.userId, record.employeeId].filter(Boolean);
  if (ids.includes(user.id)) return true;
  const names = [record.technician, record.assignee, record.assignedUserName, record.employeeName, record.activeByName, record.responsible].filter(Boolean).map((item) => text(item).toLowerCase());
  return target ? names.some((name) => name === target || name.includes(target) || target.includes(name)) : false;
}
function spanTouches(record = {}, date) {
  const start = dateKey(record.startDate || record.scheduledDate || record.estimatedStartDate || record.dueDate || record.date || date);
  const end = dateKey(record.endDate || record.estimatedEndDate || start);
  return date >= start && date <= end;
}
function workMinutes() { return (minutes(MORNING_END) - minutes(DAY_START)) + (minutes(DAY_END) - minutes(AFTERNOON_START)); }
function addWorkingMinutes(cursor, duration) {
  let current = cursor;
  let remaining = Math.max(5, duration);
  if (current < minutes(DAY_START)) current = minutes(DAY_START);
  if (current >= minutes(MORNING_END) && current < minutes(AFTERNOON_START)) current = minutes(AFTERNOON_START);
  if (current < minutes(MORNING_END)) {
    const available = minutes(MORNING_END) - current;
    if (remaining <= available) return { start: cursor, end: current + remaining };
    remaining -= available;
    current = minutes(AFTERNOON_START);
  }
  return { start: cursor, end: Math.min(minutes(DAY_END), current + remaining) };
}
function reserve(segmentList, input) {
  segmentList.push({
    id: input.id || `${input.type}-${segmentList.length + 1}`,
    startTime: input.startTime,
    endTime: input.endTime,
    type: input.type || 'Atelier',
    title: input.title || 'Travail atelier',
    detail: input.detail || '',
    status: input.status || 'Prévu',
    sourceId: input.sourceId || '',
    sourceType: input.sourceType || '',
    priority: input.priority || 'Normale',
    currentInstruction: input.currentInstruction || '',
    resource: input.resource || '',
    assignee: input.assignee || ''
  });
}
function explicitSegments(store, date, user, employeeName) {
  const segments = [];
  const leaves = safeList(store, 'leaveRequests').filter((item) => item.status === 'Approuvé' && spanTouches(item, date) && personMatches(item, user, employeeName));
  if (leaves.length) {
    reserve(segments, { id:`leave-${leaves[0].id}`, startTime:DAY_START, endTime:DAY_END, type:'Congé', title:`Congé — ${leaves[0].employeeName || employeeName}`, status:'Indisponible', priority:'Bloquante', sourceId:leaves[0].id, sourceType:'leaveRequest', currentInstruction:'Vous êtes déclaré absent. Aucune tâche atelier ne doit vous être affectée.' });
    return segments;
  }
  for (const block of safeList(store, 'planningBlocks')) {
    if (!activeStatus(block.status) || !spanTouches(block, date) || !personMatches(block, user, employeeName)) continue;
    reserve(segments, {
      id:`block-${block.id}`, startTime:block.startTime || DAY_START, endTime:block.endTime || DAY_END,
      type:block.type || 'Indisponibilité', title:block.title || 'Bloc planning', detail:block.notes || '', status:block.status || 'Active',
      sourceId:block.id, sourceType:'planningBlock', priority:/livraison/i.test(`${block.type} ${block.title}`) ? 'Haute' : 'Normale',
      currentInstruction:/livraison/i.test(`${block.type} ${block.title}`) ? 'Vous devez être en livraison avec le camion. Vérifiez le dossier, les clés, la protection du véhicule et le bon de prise en charge.' : 'Respectez ce bloc de planning avant de reprendre le travail atelier.',
      resource:block.resource || block.vehicleResource || '', assignee:block.assignedUserName || block.assignee || employeeName
    });
  }
  return segments;
}
function candidateWork(store, date, user, employeeName) {
  const clients = safeList(store, 'clients');
  const vehicles = safeList(store, 'vehicles');
  const clientName = (id) => clients.find((item) => item.id === id)?.name || '';
  const vehicleLabel = (id) => { const vehicle = vehicles.find((item) => item.id === id) || {}; return [vehicle.brand, vehicle.model, vehicle.registration].filter(Boolean).join(' · '); };
  const work = [];
  for (const intervention of safeList(store, 'interventions')) {
    if (!activeStatus(intervention.status) || !spanTouches(intervention, date)) continue;
    if (!direction(user) && !personMatches(intervention, user, employeeName) && intervention.technician) continue;
    if (direction(user) && employeeName && !personMatches(intervention, user, employeeName)) continue;
    const pendingSteps = (Array.isArray(intervention.procedureSteps) ? intervention.procedureSteps : []).filter((step) => step.status !== 'Terminée');
    if (pendingSteps.length) {
      pendingSteps.forEach((step, index) => work.push({
        id:`intervention-${intervention.id}-${step.id || index}`, sourceId:intervention.id, sourceType:'intervention', type:'Étape atelier',
        title:`${intervention.number || 'Intervention'} — ${step.label || `Étape ${index + 1}`}`,
        detail:[clientName(intervention.clientId), vehicleLabel(intervention.vehicleId), step.note].filter(Boolean).join(' · '),
        status:step.status || intervention.workStatus || intervention.status || 'À faire', priority:index === 0 ? 'Haute' : 'Normale',
        currentInstruction:index === 0 ? `Réalisez maintenant : ${step.label}. Ajoutez les preuves et notes demandées avant de valider l’étape.` : `Étape suivante prévue : ${step.label}.`
      }));
    } else work.push({
      id:`intervention-${intervention.id}`, sourceId:intervention.id, sourceType:'intervention', type:'Intervention',
      title:intervention.service || intervention.number || 'Intervention atelier', detail:[clientName(intervention.clientId), vehicleLabel(intervention.vehicleId)].filter(Boolean).join(' · '),
      status:intervention.workStatus || intervention.status || 'À faire', priority:'Haute', currentInstruction:'Poursuivez l’intervention selon la procédure affichée dans le dossier atelier.'
    });
  }
  for (const task of safeList(store, 'tasks')) {
    const due = dateKey(task.dueDate || date);
    if (!activeStatus(task.status) || due !== date) continue;
    if (!direction(user) && !personMatches(task, user, employeeName) && task.assignee) continue;
    if (direction(user) && employeeName && !personMatches(task, user, employeeName)) continue;
    work.push({ id:`task-${task.id}`, sourceId:task.id, sourceType:'task', type:'Tâche', title:task.title || 'Tâche', detail:task.instructions || '', status:task.workStatus || task.status || 'À faire', priority:task.priority || 'Normale', currentInstruction:task.instructions || 'Réalisez la tâche puis indiquez son résultat.' });
  }
  return work.sort((a,b) => (a.status === 'En cours' ? -1 : 0) - (b.status === 'En cours' ? -1 : 0) || (a.priority === 'Haute' ? -1 : 0) - (b.priority === 'Haute' ? -1 : 0));
}
function overlaps(aStart, aEnd, bStart, bEnd) { return aStart < bEnd && bStart < aEnd; }
function nextFree(cursor, duration, explicit) {
  let start = cursor;
  for (let guard = 0; guard < 30; guard += 1) {
    if (start >= minutes(MORNING_END) && start < minutes(AFTERNOON_START)) start = minutes(AFTERNOON_START);
    const span = addWorkingMinutes(start, duration);
    const conflict = explicit.find((segment) => overlaps(span.start, span.end, minutes(segment.startTime), minutes(segment.endTime)));
    if (!conflict) return span;
    start = minutes(conflict.endTime);
  }
  return { start, end:Math.min(minutes(DAY_END), start + duration) };
}
function allocate(work, explicit) {
  if (!work.length) return [];
  const explicitMinutes = explicit.reduce((sum,item)=>sum+Math.max(0,minutes(item.endTime)-minutes(item.startTime)),0);
  const available = Math.max(30, workMinutes() - explicitMinutes);
  const perItem = Math.max(20, Math.floor(available / work.length / 5) * 5);
  let cursor = minutes(DAY_START);
  const out = [];
  for (const item of work) {
    const span = nextFree(cursor, perItem, explicit);
    if (span.start >= minutes(DAY_END)) break;
    reserve(out, { ...item, startTime:timeFromMinutes(span.start), endTime:timeFromMinutes(span.end) });
    cursor = span.end;
  }
  return out;
}
function currentState(segments, date, nowValue = new Date()) {
  const today = dateKey(nowValue);
  if (date < today) return { phase:'past', label:'Journée passée', instruction:'Consultez les validations et comptes rendus de cette journée.' };
  if (date > today) return { phase:'future', label:'Journée à venir', instruction:'Préparez les dossiers, consommables, EPI et accès nécessaires.' };
  const currentMinutes = nowValue.getHours() * 60 + nowValue.getMinutes();
  if (currentMinutes < minutes(DAY_START)) return { phase:'before', label:'Avant la prise de poste', instruction:'Consultez les priorités, préparez l’EPI et vérifiez le stock de glace avant 08:30.' };
  if (currentMinutes >= minutes(MORNING_END) && currentMinutes < minutes(AFTERNOON_START)) return { phase:'break', label:'Pause de midi', instruction:'Le prochain travail reprend à 13:30. Signalez toute anomalie avant la reprise.' };
  if (currentMinutes >= minutes(DAY_END)) return { phase:'after', label:'Fin de journée', instruction:'Finalisez les temps, photos, consommations et comptes rendus, puis utilisez « Fin de journée ».' };
  const current = segments.find((segment) => currentMinutes >= minutes(segment.startTime) && currentMinutes < minutes(segment.endTime));
  if (current) return { phase:'active', label:`En ce moment : ${current.title}`, instruction:current.currentInstruction || current.detail || 'Poursuivez le travail prévu et mettez le dossier à jour.', segmentId:current.id };
  const next = segments.find((segment) => minutes(segment.startTime) > currentMinutes);
  if (next) return { phase:'gap', label:`Prochaine étape à ${next.startTime}`, instruction:`Préparez « ${next.title} ». Utilisez ce créneau pour le rangement, le contrôle des consommables ou une tâche courte validée.`, nextSegmentId:next.id };
  return { phase:'free', label:'Aucun travail planifié sur ce créneau', instruction:'Prévenez Jarvis ou la direction avant de démarrer une nouvelle intervention non prévue.' };
}
function build(store, input = {}, user = {}) {
  const date = dateKey(input.date || new Date());
  const requestedName = text(input.employeeName);
  if (requestedName && !direction(user) && requestedName.toLowerCase() !== text(user.name || user.username).toLowerCase()) throw Object.assign(new Error('WORKSHOP_DAY_OTHER_EMPLOYEE_FORBIDDEN'), { status:403 });
  const employeeName = requestedName || text(user.name || user.username || 'Collaborateur');
  const explicit = explicitSegments(store, date, user, employeeName);
  const work = explicit.some((item)=>item.type === 'Congé') ? [] : candidateWork(store, date, user, employeeName);
  const allocated = allocate(work, explicit);
  const segments = [...explicit, ...allocated].sort((a,b)=>minutes(a.startTime)-minutes(b.startTime));
  const state = currentState(segments, date, input.now ? new Date(input.now) : new Date());
  return {
    date, employeeName, dayStart:DAY_START, morningEnd:MORNING_END, afternoonStart:AFTERNOON_START, dayEnd:DAY_END,
    priorityCalendar:'Atelier GentleCarE — priorité maximale pour Jarvis',
    segments, current:state,
    summary:{ total:segments.length, active:state.phase === 'active' ? 1 : 0, interventions:segments.filter((item)=>item.sourceType === 'intervention').length, tasks:segments.filter((item)=>item.sourceType === 'task').length, deliveries:segments.filter((item)=>/livraison/i.test(`${item.type} ${item.title}`)).length },
    policy:{ dynamic:true, refreshSeconds:60, directionGeneralPlanningOnly:true, workshopCalendarPriority:'highest' }
  };
}

module.exports = { DAY_START, MORNING_END, AFTERNOON_START, DAY_END, build, currentState };
