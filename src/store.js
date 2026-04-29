import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// בענן — נשמור בתוך ה-Volume של WhatsApp כדי לא לאבד נתונים
const STORE_PATH = process.env.STORE_PATH ||
  join(__dirname, '..', '.wwebjs_auth', 'botdata', 'store.json');

mkdirSync(dirname(STORE_PATH), { recursive: true });

const MAX_STORED_MESSAGES = 60;

function load() {
  if (!existsSync(STORE_PATH)) return { conversations: {}, appointments: {} };
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8'));
  } catch {
    console.error('store.json פגום – מתחיל מחדש');
    return { conversations: {}, appointments: {} };
  }
}

function save(state) {
  writeFileSync(STORE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

// ── helpers ───────────────────────────────────────────────────────────────────
function apptToMs(a) {
  try {
    const [d, m, y] = a.date.split('/');
    const [h, min]  = a.time.split(':');
    return new Date(+y, +m - 1, +d, +h, +min).getTime();
  } catch { return 0; }
}

// ── conversations ─────────────────────────────────────────────────────────────
export function getHistory(phone) {
  return load().conversations[phone] || [];
}

export function appendMessage(phone, role, content) {
  const state = load();
  if (!state.conversations[phone]) state.conversations[phone] = [];
  state.conversations[phone].push({ role, content });
  if (state.conversations[phone].length > MAX_STORED_MESSAGES)
    state.conversations[phone] = state.conversations[phone].slice(-MAX_STORED_MESSAGES);
  save(state);
}

export function clearHistory(phone) {
  const state = load();
  delete state.conversations[phone];
  save(state);
}

// ── appointments ──────────────────────────────────────────────────────────────
export function saveAppointment(appt) {
  const state = load();
  state.appointments[appt.id] = appt;
  save(state);
}

export function getAppointment(id) {
  return load().appointments[id] || null;
}

export function updateAppointmentStatus(id, status) {
  const state = load();
  if (state.appointments[id]) { state.appointments[id].status = status; save(state); }
}

export function getAppointmentByName(name) {
  const nameLower = name.trim().toLowerCase();
  return Object.values(load().appointments)
    .filter((a) => a.status === 'pending' && a.name.toLowerCase().includes(nameLower))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] || null;
}

export function getPendingAppointments() {
  return Object.values(load().appointments).filter((a) => a.status === 'pending');
}

export function getTodayAppointments() {
  const pad = (n) => String(n).padStart(2, '0');
  const now  = new Date();
  const today = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
  return Object.values(load().appointments)
    .filter((a) => a.status === 'approved' && a.date === today)
    .sort((a, b) => a.time.localeCompare(b.time));
}

export function cancelCustomerAppointment(phone) {
  const state = load();
  const appt  = Object.values(state.appointments)
    .filter((a) => a.phone === phone && (a.status === 'pending' || a.status === 'approved'))
    .sort((a, b) => apptToMs(b) - apptToMs(a))[0];
  if (!appt) return null;
  state.appointments[appt.id].status = 'cancelled';
  save(state);
  return appt;
}

// ── customer queries ──────────────────────────────────────────────────────────
export function isReturningCustomer(phone) {
  return Object.values(load().appointments).some((a) => a.phone === phone && a.status === 'approved');
}

export function getNextAppointmentByPhone(phone) {
  const now = Date.now();
  return Object.values(load().appointments)
    .filter((a) => a.phone === phone && a.status === 'approved' && apptToMs(a) > now)
    .sort((a, b) => apptToMs(a) - apptToMs(b))[0] || null;
}

export function getAllCustomerPhones() {
  return [...new Set(
    Object.values(load().appointments)
      .filter((a) => a.status === 'approved')
      .map((a) => a.phone)
  )];
}

// ── statistics ────────────────────────────────────────────────────────────────
export function getStatistics() {
  const appts     = Object.values(load().appointments);
  const approved  = appts.filter((a) => a.status === 'approved');
  const now       = Date.now();
  const startMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const startWeek  = now - 7 * 24 * 60 * 60 * 1000;

  const areaCounts = {};
  approved.forEach((a) => (a.areas || []).forEach((ar) => { areaCounts[ar] = (areaCounts[ar] || 0) + 1; }));
  const topAreas = Object.entries(areaCounts).sort((x, y) => y[1] - x[1]).slice(0, 3)
    .map(([area, count]) => `${area} (${count})`);

  return {
    total:   approved.length,
    month:   approved.filter((a) => (a.createdAt || 0) >= startMonth).length,
    week:    approved.filter((a) => (a.createdAt || 0) >= startWeek).length,
    pending: appts.filter((a) => a.status === 'pending').length,
    topAreas,
  };
}

// ── scheduled messages flags ──────────────────────────────────────────────────
function markFlag(id, flag) {
  const state = load();
  if (state.appointments[id]) { state.appointments[id][flag] = true; save(state); }
}

export const markPostTreatmentSent = (id) => markFlag(id, 'postTreatmentSent');
export const markReminderSent      = (id) => markFlag(id, 'reminderSent');
export const markFollowUpSent      = (id) => markFlag(id, 'followUpSent');
export const markRebookNudgeSent   = (id) => markFlag(id, 'rebookNudgeSent');

export function getAppointmentsDueForPostTreatment() {
  const now = Date.now();
  return Object.values(load().appointments).filter((a) => {
    if (a.status !== 'approved' || a.postTreatmentSent) return false;
    try { return now >= apptToMs(a) + 60 * 60 * 1000; } catch { return false; }
  });
}

export function getAppointmentsDueForReminder() {
  const now = Date.now();
  const H23 = 23 * 60 * 60 * 1000, H25 = 25 * 60 * 60 * 1000;
  return Object.values(load().appointments).filter((a) => {
    if (a.status !== 'approved' || a.reminderSent) return false;
    const diff = apptToMs(a) - now;
    return diff >= H23 && diff <= H25;
  });
}

export function getAppointmentsDueForFollowUp() {
  const now = Date.now();
  const D3 = 3 * 24 * 60 * 60 * 1000, D4 = 4 * 24 * 60 * 60 * 1000;
  return Object.values(load().appointments).filter((a) => {
    if (a.status !== 'approved' || !a.postTreatmentSent || a.followUpSent) return false;
    const diff = now - apptToMs(a);
    return diff >= D3 && diff <= D4;
  });
}

export function getCustomersForRebookNudge() {
  const now = Date.now();
  const W5 = 35 * 24 * 60 * 60 * 1000, W7 = 49 * 24 * 60 * 60 * 1000;
  const byPhone = {};
  Object.values(load().appointments).forEach((a) => {
    if (a.status !== 'approved' || !a.postTreatmentSent) return;
    if (!byPhone[a.phone] || apptToMs(a) > apptToMs(byPhone[a.phone])) byPhone[a.phone] = a;
  });
  return Object.values(byPhone).filter((a) => {
    if (a.rebookNudgeSent) return false;
    const diff = now - apptToMs(a);
    return diff >= W5 && diff <= W7;
  });
}

// ── blocked ───────────────────────────────────────────────────────────────────
export function isBlocked(phone)   { return (load().blocked || []).includes(phone); }
export function blockPhone(phone)  { const s = load(); if (!s.blocked) s.blocked = []; if (!s.blocked.includes(phone)) s.blocked.push(phone); save(s); }
export function unblockPhone(phone){ const s = load(); s.blocked = (s.blocked || []).filter((p) => p !== phone); save(s); }
