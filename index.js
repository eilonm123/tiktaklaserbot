import 'dotenv/config';
import express from 'express';
import QRCode from 'qrcode';
import { client, sendMessage, formatPhone, getOwnLid } from './src/whatsapp.js';
import { processMessage, processAdminMessage } from './src/agent.js';
import {
  getHistory,
  appendMessage,
  clearHistory,
  getAppointment,
  getAppointmentByName,
  updateAppointmentStatus,
  setCalendarEventId,
  getPendingAppointments,
  deleteAppointment,
  deleteAllPendingAppointments,
  getCancellationRequests,
  isContact,
  addContact,
  removeContact,
  getKnowledge,
  addKnowledge,
  removeKnowledge,
  isBlocked,
  blockPhone,
  unblockPhone,
  isMuted,
  mutePhone,
  unmutePhone,
  isReturningCustomer,
  markPostTreatmentSent,
  getAppointmentsDueForPostTreatment,
  getAppointmentsDueForReminder,
  markReminderSent,
  getAppointmentsDueForFollowUp,
  markFollowUpSent,
  getCustomersForRebookNudge,
  markRebookNudgeSent,
  getAllCustomerPhones,
  getStatistics,
  getTodayAppointments,
} from './src/store.js';
import {
  appointmentConfirmed, PRE_TREATMENT, POST_TREATMENT, MEDICAL_FORM,
  followUpMessage, rebookNudge, GOOGLE_REVIEW,
} from './src/messages.js';
import { createCalendarEvent, deleteCalendarEvent } from './src/calendar.js';

const REQUIRED_ENV = ['OPENROUTER_API_KEY', 'OWNER_NUMBER'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`❌ חסרים משתני סביבה: ${missing.join(', ')}`);
  process.exit(1);
}

const OWNER      = `${process.env.OWNER_NUMBER}@s.whatsapp.net`;
const BOT_START  = Math.floor(Date.now() / 1000);
let BOT_ACTIVE   = true;
const ADMIN = process.env.ADMIN_NUMBER ? `${process.env.ADMIN_NUMBER}@s.whatsapp.net` : null;
const ADMIN_LID_JID  = process.env.ADMIN_LID  ? `${process.env.ADMIN_LID}@lid`  : null;
const OWNER_LID_JID  = process.env.OWNER_LID  ? `${process.env.OWNER_LID}@lid`  : null;

function isOwnerOrAdmin(from) {
  if (from === OWNER || (ADMIN && from === ADMIN)) return true;
  if (ADMIN_LID_JID && from === ADMIN_LID_JID) return true;
  if (OWNER_LID_JID && from === OWNER_LID_JID) return true;
  const lid = getOwnLid();
  if (lid && from === `${lid}@lid`) return true;
  return false;
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
const RATE_LIMIT = 10;
const RATE_WINDOW = 60_000;
const rateMap = new Map();

function isRateLimited(phone) {
  const now = Date.now();
  const entry = rateMap.get(phone);
  if (!entry || now - entry.windowStart > RATE_WINDOW) {
    rateMap.set(phone, { count: 1, windowStart: now });
    return false;
  }
  if (entry.count >= RATE_LIMIT) return true;
  entry.count++;
  return false;
}

// ── HTTP server (QR endpoint) ─────────────────────────────────────────────────
const app = express();
let latestQR = null;
const recentMessages = [];

app.get('/qr', async (req, res) => {
  if (!latestQR) return res.send('<h2>QR עוד לא מוכן — רענן עוד שנייה</h2>');
  const img = await QRCode.toDataURL(latestQR);
  res.send(`<html><body style="background:#000;display:flex;align-items:center;justify-content:center;height:100vh"><img src="${img}" style="width:300px"/></body></html>`);
});

app.get('/health', async (req, res) => {
  const state = await client.getState().catch(() => 'UNKNOWN');
  res.json({ ok: true, whatsapp: state });
});

app.get('/messages', (req, res) => res.json(recentMessages));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 שרת HTTP רץ על פורט ${PORT}`));

// ── WhatsApp events ───────────────────────────────────────────────────────────
client.on('qr', (qr) => {
  latestQR = qr;
  console.log('\n🔗 סרוק QR מ: /qr\n');
});

let _startupNotified = false;
client.on('ready', () => {
  console.log('✅ הבוט מחובר לוואטסאפ ומוכן לפעולה!');
  if (!_startupNotified) {
    _startupNotified = true;
    sendMessage(OWNER, `🚀 הבוט עלה!\n\nפקודות:\nאישור <שם> – אישור תור\nדחייה <שם> – דחיית תור\nבטל תור <שם> – ביטול מאושר + מחיקה מיומן\nאשר ביטול / דחה ביטול <שם>\nביטולים – בקשות ביטול ממתינות\nמחק <שם> – מחיקת בקשה\nמחק ממתינות – מחיקת כל הממתינות\nתשובה <טלפון> <טקסט> – ענה ללקוח\nסיים <טלפון> – הנחיות אחרי טיפול\nנקה <טלפון> – ניקוי שיחה\nהשתק <טלפון> – הבוט לא יענה (זמני)\nהמשך <טלפון> – הפעל בוט מחדש\nהסר מבוט <טלפון> – הבוט ידלג\nהוסף לבוט <טלפון> – החזר לבוט\nחסום/שחרר <טלפון>\nרשימה – ממתינים לאישור\nביטולים – בקשות ביטול\nתורים היום\nסטטיסטיקה\nשלח לכולם <הודעה>\nלמד: <עובדה> – לימד את הבוט\nשכח: <עובדה> – מחק עובדה\nידע – מה הבוט יודע\nכיבוי / הדלקה – כיבוי והדלקת הבוט\nעזרה – רשימת פקודות`).catch(() => {});
  } else {
    sendMessage(OWNER, '🔄 הבוט התחבר מחדש לוואטסאפ ✅').catch(() => {});
  }
  checkPostTreatments();
  checkReminders();
  checkFollowUps();
  checkRebookNudges();
  checkDailySummary();
  setInterval(() => {
    checkPostTreatments();
    checkReminders();
    checkFollowUps();
    checkRebookNudges();
    checkDailySummary();
  }, 5 * 60 * 1000);
});

client.on('disconnected', (reason) => {
  console.warn('⚠️ הבוט התנתק:', reason, '— מנסה להתחבר מחדש...');
});

const handled = new Set();
function dedup(msg, fn) {
  const key = msg.id?._serialized || `${msg.from}${msg.timestamp}`;
  if (handled.has(key)) return;
  handled.add(key);
  setTimeout(() => handled.delete(key), 60_000);
  fn(msg);
}

client.on('message', (msg) => {
  console.log(`📨 msg from=${msg.from} type=${msg.type}`);
  dedup(msg, handleMsg);
});

async function handleMsg(msg) {
  recentMessages.unshift({ from: msg.from, body: msg.body, ts: msg.timestamp, time: new Date().toISOString() });
  if (recentMessages.length > 20) recentMessages.pop();
  console.log(`📨 הודעה נכנסת: from=${msg.from} type=${msg.type} ts=${msg.timestamp} BOT_START=${BOT_START}`);
  if (msg.timestamp && msg.timestamp < BOT_START) { console.log('⏭️ הודעה ישנה — מדולגת'); return; }
  if (msg.from.endsWith('@g.us')) { console.log('⏭️ קבוצה — מדולגת'); return; }
  if (msg.from === 'status@broadcast') return;
  if (msg.from.endsWith('@newsletter')) return;

  const from = msg.from;
  const body = (msg.body || '').trim();
  console.log(`📝 גוף ההודעה: "${body}"`);

  const phoneNum = from.replace(/@.*/, '');
  if (from.endsWith('@lid') && !isOwnerOrAdmin(from)) {
    console.log(`🆔 LID לא מוכר: ${from} — אם זו מיה, הוסף OWNER_LID=${from.split('@')[0]} ל-.env`);
  }
  if (!isOwnerOrAdmin(from) && isBlocked(phoneNum)) { console.log('🚫 מספר חסום'); return; }
  if (!isOwnerOrAdmin(from) && isMuted(phoneNum)) { console.log('🔇 מספר מושתק'); return; }
  if (!isOwnerOrAdmin(from) && isContact(phoneNum)) { console.log('👤 איש קשר פרטי – מדולג'); return; }

  try {
    if (isOwnerOrAdmin(from)) {
      await handleOwnerCommand(body, from);
      return;
    }

    // הודעה קולית – בקש לכתוב
    if (msg.type === 'ptt' || msg.type === 'audio') {
      await handleVoiceMessage(from);
      return;
    }

    // תמונה/וידאו – אם אין כיתוב, בקש טקסט; אם יש כיתוב, מעבד אותו
    if (msg.hasMedia && !body) {
      await sendMessage(from, 'תודה על התמונה! 📸\nאנא תאר/י בטקסט במה אני יכול לעזור 😊');
      return;
    }

    if (body) {
      if (!BOT_ACTIVE) { console.log('🔴 הבוט כבוי — מדלג'); return; }
      if (isRateLimited(from)) {
        await sendMessage(from, 'שלחת הרבה הודעות בזמן קצר 🙏 אנא המתן דקה ונסה שוב.');
        return;
      }
      console.log(`🤖 מעביר ל-handleCustomerMessage`);
      await handleCustomerMessage(from, body);
    }
  } catch (err) {
    console.error('שגיאה בטיפול בהודעה:', err);
  }
}

// ── Owner commands ────────────────────────────────────────────────────────────
async function handleOwnerCommand(body, replyTo = OWNER) {
  if (!body) return;
  console.log(`👑 פקודת בעלים: "${body.slice(0, 60)}"`);

  const approveMatch = body.match(/^אישור\s+(.+)$/i);
  const rejectMatch  = body.match(/^דחייה\s+(.+)$/i);
  const answerMatch  = body.match(/^תשובה\s+(\S+)\s+([\s\S]+)$/i);
  const broadcastMatch = body.match(/^שלח לכולם\s+([\s\S]+)$/i);
  const finishMatch  = body.match(/^סיים\s+(\S+)$/i);
  const clearMatch   = body.match(/^נקה\s+(\S+)$/i);
  const blockMatch   = body.match(/^חסום\s+(\S+)$/i);
  const unblockMatch = body.match(/^שחרר\s+(\S+)$/i);
  const muteMatch    = body.match(/^השתק\s+(\S+)$/i);
  const unmuteMatch  = body.match(/^המשך\s+(\S+)$/i);
  const cancelApptMatch    = body.match(/^בטל תור\s+(.+)$/i);
  const learnMatch         = body.match(/^למד:\s*(.+)$/i);
  const forgetMatch        = body.match(/^שכח:\s*(.+)$/i);
  const knowledgeListMatch = /^ידע$/.test(body);
  const approveCancelMatch = body.match(/^אשר ביטול\s+(.+)$/i);
  const rejectCancelMatch  = body.match(/^דחה ביטול\s+(.+)$/i);
  const deleteApptMatch    = body.match(/^מחק\s+(.+)$/i);
  const deleteAllMatch     = /^מחק ממתינות$/.test(body);
  const addContactMatch    = body.match(/^הוסף לבוט\s+(\S+)$/i);
  const removeContactMatch = body.match(/^הסר מבוט\s+(\S+)$/i);
  const listMatch          = /^רשימה$/.test(body);
  const cancelListMatch    = /^ביטולים$/.test(body);
  const statsMatch   = /^סטטיסטיקה$/.test(body);
  const todayMatch   = /^תורים היום$/.test(body);

  if (/^כיבוי$/.test(body)) {
    BOT_ACTIVE = false;
    await sendMessage(replyTo, '🔴 הבוט כובה — לא יענה ללקוחות עד שתדליק אותו');
    return;
  }

  if (/^הדלקה$/.test(body)) {
    BOT_ACTIVE = true;
    await sendMessage(replyTo, '🟢 הבוט הודלק — עונה ללקוחות שוב');
    return;
  }

  if (answerMatch) {
    const customerPhone = answerMatch[1].trim();
    const answer        = answerMatch[2].trim();
    await sendMessage(customerPhone, answer);
    await sendMessage(replyTo, `✅ התשובה נשלחה ללקוח`);
    return;
  }

  if (approveMatch) {
    const query = approveMatch[1].trim();
    const appt = getAppointment(query.toUpperCase()) || getAppointmentByName(query, 'pending');
    if (!appt) { await sendMessage(replyTo, `❌ לא נמצאה בקשה ממתינה עבור "${query}"`); return; }
    const isReturning = isReturningCustomer(appt.phone);
    updateAppointmentStatus(appt.id, 'approved');
    const confirmMsg = appointmentConfirmed(appt.name, appt.date, appt.time);
    const preMsg = isReturning
      ? `${confirmMsg}\n\n${PRE_TREATMENT}`
      : `${confirmMsg}\n\n${PRE_TREATMENT}\n\n${MEDICAL_FORM}`;
    await sendMessage(appt.phone, preMsg);
    try {
      const calEvent = await createCalendarEvent(appt);
      if (calEvent?.id) setCalendarEventId(appt.id, calEvent.id);
      await sendMessage(replyTo, `✅ תור אושר ונשלח ללקוח (${appt.name}) 📅 נוסף ליומן`);
    } catch (err) {
      console.error('שגיאה ביצירת אירוע ביומן:', err.message);
      await sendMessage(replyTo, `✅ תור אושר ונשלח ללקוח (${appt.name}) ⚠️ לא ניתן להוסיף ליומן`);
    }
    return;
  }

  if (rejectMatch) {
    const query = rejectMatch[1].trim();
    const appt = getAppointment(query.toUpperCase()) || getAppointmentByName(query, 'pending');
    if (!appt) { await sendMessage(replyTo, `❌ לא נמצאה בקשה ממתינה עבור "${query}"`); return; }
    updateAppointmentStatus(appt.id, 'rejected');
    await sendMessage(
      appt.phone,
      `היי ${appt.name} 😔\nלצערנו לא נוכל לקבוע את התור המבוקש.\nנשמח לתאם מועד אחר! אנא צרו איתנו קשר 💙`
    );
    await sendMessage(replyTo, `✅ הלקוח קיבל הודעת דחייה (${appt.name})`);
    return;
  }

  if (finishMatch) {
    const phone = finishMatch[1];
    await sendMessage(phone, POST_TREATMENT);
    await sendMessage(phone, GOOGLE_REVIEW);
    clearHistory(phone);
    await sendMessage(replyTo, `✅ הנחיות לאחר טיפול נשלחו ל-${formatPhone(phone)}`);
    return;
  }

  if (clearMatch) {
    const phone = clearMatch[1];
    clearHistory(phone);
    await sendMessage(replyTo, `✅ היסטוריית השיחה של ${formatPhone(phone)} נוקתה`);
    return;
  }

  if (blockMatch) {
    const phone = blockMatch[1];
    blockPhone(phone);
    await sendMessage(replyTo, `🚫 ${formatPhone(phone)} נחסם – הבוט לא יגיב לו יותר`);
    return;
  }

  if (unblockMatch) {
    const phone = unblockMatch[1];
    unblockPhone(phone);
    await sendMessage(replyTo, `✅ ${formatPhone(phone)} שוחרר – הבוט יחזור להגיב`);
    return;
  }

  if (muteMatch) {
    const phone = muteMatch[1];
    mutePhone(phone);
    await sendMessage(replyTo, `🔇 ${formatPhone(phone)} הושתק – הבוט לא יענה אבל לא חסום`);
    return;
  }

  if (unmuteMatch) {
    const phone = unmuteMatch[1];
    unmutePhone(phone);
    await sendMessage(replyTo, `🔊 ${formatPhone(phone)} הופעל מחדש – הבוט יענה שוב`);
    return;
  }

  if (statsMatch) {
    const s = getStatistics();
    const areas = s.topAreas.length ? s.topAreas.join(', ') : 'אין מידע עדיין';
    await sendMessage(replyTo, `📊 סטטיסטיקה:\n\nהשבוע: ${s.week} תורים\nהחודש: ${s.month} תורים\nסה״כ: ${s.total} תורים\nממתינים לאישור: ${s.pending}\n\n🏆 טיפולים פופולריים: ${areas}`);
    return;
  }

  if (todayMatch) {
    const appts = getTodayAppointments();
    if (appts.length === 0) { await sendMessage(replyTo, '📅 אין תורים היום'); return; }
    const lines = appts.map((a) => `🕐 ${a.time} – ${a.name} | ${Array.isArray(a.areas) ? a.areas.join(', ') : a.areas}`);
    await sendMessage(replyTo, `📅 תורים היום (${appts.length}):\n\n${lines.join('\n')}`);
    return;
  }

  if (broadcastMatch) {
    const message  = broadcastMatch[1].trim();
    const phones   = getAllCustomerPhones();
    if (phones.length === 0) { await sendMessage(replyTo, '❌ אין לקוחות לשליחה'); return; }
    await sendMessage(replyTo, `📤 שולח ל-${phones.length} לקוחות...`);
    let sent = 0;
    for (const phone of phones) {
      try {
        await sendMessage(phone, message);
        sent++;
        await new Promise((r) => setTimeout(r, 2500));
      } catch (err) {
        console.error(`שגיאה בשליחה ל-${phone}:`, err.message);
      }
    }
    await sendMessage(replyTo, `✅ ההודעה נשלחה ל-${sent}/${phones.length} לקוחות`);
    return;
  }

  if (cancelApptMatch) {
    const query = cancelApptMatch[1].trim();
    const appt = getAppointment(query.toUpperCase()) || getAppointmentByName(query);
    if (!appt) { await sendMessage(replyTo, `❌ לא נמצא תור עבור "${query}"`); return; }
    updateAppointmentStatus(appt.id, 'cancelled');
    if (appt.calendarEventId) {
      try { await deleteCalendarEvent(appt.calendarEventId); } catch (e) { console.error('שגיאה במחיקת יומן:', e.message); }
    }
    await sendMessage(appt.phone, `היי ${appt.name} 😊\nהתור שלך ל-${appt.date} בשעה ${appt.time} בוטל ✅\nנשמח לראותך בפעם אחרת! 💙`);
    await sendMessage(replyTo, `✅ תור ${appt.name} בוטל${appt.calendarEventId ? ' והוסר מהיומן' : ''}`);
    return;
  }

  if (learnMatch) {
    const fact = learnMatch[1].trim();
    addKnowledge(fact);
    await sendMessage(replyTo, `🧠 למדתי: "${fact}"`);
    return;
  }

  if (forgetMatch) {
    const fact = forgetMatch[1].trim();
    removeKnowledge(fact);
    await sendMessage(replyTo, `🗑️ שכחתי: "${fact}"`);
    return;
  }

  if (knowledgeListMatch) {
    const facts = getKnowledge();
    if (!facts.length) { await sendMessage(replyTo, '🧠 אין עובדות שמורות עדיין'); return; }
    await sendMessage(replyTo, `🧠 מה שהבוט יודע:\n\n${facts.map((f, i) => `${i + 1}. ${f}`).join('\n')}`);
    return;
  }

  if (approveCancelMatch) {
    const query = approveCancelMatch[1].trim();
    const appt = getAppointment(query.toUpperCase()) || getAppointmentByName(query, 'cancellation_requested');
    if (!appt) { await sendMessage(replyTo, `❌ לא נמצאה בקשת ביטול עבור "${query}"`); return; }
    updateAppointmentStatus(appt.id, 'cancelled');
    await sendMessage(appt.phone, `היי ${appt.name} 😊\nהתור שלך ל-${appt.date} בשעה ${appt.time} בוטל בהצלחה ✅\nנשמח לראותך בפעם אחרת! 💙`);
    await sendMessage(replyTo, `✅ ביטול התור של ${appt.name} אושר ונשלח ללקוח`);
    return;
  }

  if (rejectCancelMatch) {
    const query = rejectCancelMatch[1].trim();
    const appt = getAppointment(query.toUpperCase()) || getAppointmentByName(query, 'cancellation_requested');
    if (!appt) { await sendMessage(replyTo, `❌ לא נמצאה בקשת ביטול עבור "${query}"`); return; }
    updateAppointmentStatus(appt.id, 'approved');
    await sendMessage(appt.phone, `היי ${appt.name} 😊\nבקשת הביטול שלך לא אושרה.\nהתור ל-${appt.date} בשעה ${appt.time} עדיין קיים ✅\nלשינוי מועד אנא צור קשר 💙`);
    await sendMessage(replyTo, `✅ בקשת הביטול של ${appt.name} נדחתה, התור נשמר`);
    return;
  }

  if (deleteAllMatch) {
    const pending = getPendingAppointments();
    if (pending.length === 0) { await sendMessage(replyTo, '📋 אין בקשות ממתינות למחיקה'); return; }
    deleteAllPendingAppointments();
    await sendMessage(replyTo, `🗑️ נמחקו ${pending.length} בקשות ממתינות`);
    return;
  }

  if (deleteApptMatch) {
    const query = deleteApptMatch[1].trim();
    if (query === 'ממתינות') {
      const pending = getPendingAppointments();
      if (pending.length === 0) { await sendMessage(replyTo, '📋 אין בקשות ממתינות למחיקה'); return; }
      deleteAllPendingAppointments();
      await sendMessage(replyTo, `🗑️ נמחקו ${pending.length} בקשות ממתינות`);
      return;
    }
    const appt = getAppointment(query.toUpperCase()) || getAppointmentByName(query);
    if (!appt) { await sendMessage(replyTo, `❌ לא נמצאה בקשה עבור "${query}"`); return; }
    deleteAppointment(appt.id);
    await sendMessage(replyTo, `🗑️ הבקשה של ${appt.name} (${appt.date} ${appt.time}) נמחקה`);
    return;
  }

  if (addContactMatch) {
    const phone = addContactMatch[1];
    removeContact(phone.replace(/@.*/, ''));
    await sendMessage(replyTo, `✅ ${formatPhone(phone)} הוחזר לבוט – הבוט יענה שוב`);
    return;
  }

  if (removeContactMatch) {
    const phone = removeContactMatch[1];
    addContact(phone.replace(/@.*/, ''));
    await sendMessage(replyTo, `👤 ${formatPhone(phone)} הוסר מהבוט – הבוט ידלג עליו`);
    return;
  }

  if (cancelListMatch) {
    const cancels = getCancellationRequests();
    if (cancels.length === 0) { await sendMessage(replyTo, '📋 אין בקשות ביטול ממתינות'); return; }
    const lines = cancels.map(a => `🔹 ${a.name}\n   📅 ${a.date} בשעה ${a.time}\n   אשר: אשר ביטול ${a.name} | דחה: דחה ביטול ${a.name}`);
    await sendMessage(replyTo, `⚠️ בקשות ביטול (${cancels.length}):\n\n${lines.join('\n\n')}`);
    return;
  }

  if (listMatch) {
    const pending = getPendingAppointments();
    if (pending.length === 0) {
      await sendMessage(replyTo, '📋 אין בקשות תור ממתינות כרגע');
      return;
    }
    const lines = pending.map((a) => {
      const areas = Array.isArray(a.areas) ? a.areas.join(', ') : a.areas;
      return `🔹 ${a.name}\n   📅 ${a.date} בשעה ${a.time}\n   🎯 ${areas}\n   אישור: אישור ${a.name}`;
    });
    await sendMessage(replyTo, `📋 בקשות ממתינות (${pending.length}):\n\n${lines.join('\n\n')}`);
    return;
  }

  if (/^(עזרה|פקודות|מה הפקודות|help|\?)$/i.test(body)) {
    await sendMessage(replyTo,
      `📋 פקודות זמינות:\n\n` +
      `✅ *אישור <שם>* – אישור תור\n` +
      `❌ *דחייה <שם>* – דחיית תור\n` +
      `🚫 *בטל תור <שם>* – ביטול תור מאושר + מחיקה מיומן\n` +
      `⚠️ *אשר ביטול / דחה ביטול <שם>*\n` +
      `📋 *ביטולים* – בקשות ביטול ממתינות\n` +
      `🗑️ *מחק <שם>* – מחיקת בקשה ממתינה\n` +
      `🗑️ *מחק ממתינות* – מחיקת כל הממתינות\n` +
      `💬 *תשובה <טלפון> <טקסט>* – ענה ללקוח\n` +
      `🏁 *סיים <טלפון>* – הנחיות אחרי טיפול\n` +
      `🧹 *נקה <טלפון>* – ניקוי שיחה\n` +
      `🔇 *השתק <טלפון>* – הבוט לא יענה (זמני)\n` +
      `🔊 *המשך <טלפון>* – הפעל בוט מחדש\n` +
      `🚫 *הסר מבוט <טלפון>* – הבוט ידלג (מצ'אט הלקוח)\n` +
      `✅ *הוסף לבוט <טלפון>* – החזר לטיפול הבוט\n` +
      `🔒 *חסום / שחרר <טלפון>*\n` +
      `📋 *רשימה* – ממתינים לאישור\n` +
      `📅 *תורים היום*\n` +
      `📊 *סטטיסטיקה*\n` +
      `📢 *שלח לכולם <הודעה>*\n` +
      `🧠 *למד: <עובדה>* – לימד את הבוט\n` +
      `🗑️ *שכח: <עובדה>* – מחק עובדה\n` +
      `📚 *ידע* – הצג מה הבוט יודע\n` +
      `🔴 *כיבוי* – הפסק לענות ללקוחות\n` +
      `🟢 *הדלקה* – חזור לענות ללקוחות`
    );
    return;
  }

  // לא פקודה מוכרת — הבוט חושב ועונה כעוזר חכם למנהל
  const aiReply = await processAdminMessage(replyTo, body).catch(() => null);
  if (aiReply) await sendMessage(replyTo, aiReply);
}

// ── Daily summary ─────────────────────────────────────────────────────────────
let lastSummaryDate = '';
async function checkDailySummary() {
  const now  = new Date();
  if (now.getHours() < 8 || now.getHours() >= 9) return;
  const pad  = (n) => String(n).padStart(2, '0');
  const today = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
  if (lastSummaryDate === today) return;
  lastSummaryDate = today;
  const appts = getTodayAppointments();
  const msg   = appts.length === 0
    ? '📅 בוקר טוב! אין תורים היום 😊'
    : `📅 בוקר טוב! תורים להיום (${appts.length}):\n\n${appts.map((a) => `🕐 ${a.time} – ${a.name} | ${Array.isArray(a.areas) ? a.areas.join(', ') : a.areas}`).join('\n')}`;
  for (const r of [OWNER, ADMIN].filter(Boolean)) {
    try { await sendMessage(r, msg); } catch {}
  }
}

// ── Reminders ────────────────────────────────────────────────────────────────
async function checkReminders() {
  const due = getAppointmentsDueForReminder();
  for (const appt of due) {
    try {
      await sendMessage(
        appt.phone,
        `היי ${appt.name}! 😊\nתזכורת – מחר ב-${appt.time} יש לך תור בטיקטק לייזר ✨\n📍 פתח תקווה 8, הרצליה\nמחכים לך! 💖`
      );
      markReminderSent(appt.id);
    } catch (err) {
      console.error('שגיאה בשליחת תזכורת:', err.message);
    }
  }
}

// ── Follow-up 3 days after treatment ─────────────────────────────────────────
async function checkFollowUps() {
  for (const appt of getAppointmentsDueForFollowUp()) {
    try {
      await sendMessage(appt.phone, followUpMessage(appt.name));
      markFollowUpSent(appt.id);
    } catch (err) { console.error('שגיאה בשליחת מעקב:', err.message); }
  }
}

// ── Re-booking nudge 5-7 weeks ────────────────────────────────────────────────
async function checkRebookNudges() {
  for (const appt of getCustomersForRebookNudge()) {
    try {
      await sendMessage(appt.phone, rebookNudge(appt.name));
      markRebookNudgeSent(appt.id);
    } catch (err) { console.error('שגיאה בשליחת nudge:', err.message); }
  }
}

// ── Auto post-treatment ───────────────────────────────────────────────────────
async function checkPostTreatments() {
  const due = getAppointmentsDueForPostTreatment();
  for (const appt of due) {
    try {
      await sendMessage(appt.phone, POST_TREATMENT);
      await sendMessage(appt.phone, GOOGLE_REVIEW);
      clearHistory(appt.phone);
      markPostTreatmentSent(appt.id);
      await sendMessage(OWNER, `✅ הנחיות לאחר טיפול נשלחו אוטומטית ל-${formatPhone(appt.phone)} (${appt.name})`);
    } catch (err) {
      console.error('שגיאה בשליחת הנחיות אחרי טיפול:', err.message);
    }
  }
}

// ── Voice messages ────────────────────────────────────────────────────────────
async function handleVoiceMessage(from) {
  await sendMessage(from, 'שלום 😊 אני לא יכול להאזין להודעות קוליות.\nאנא כתבו את פנייתכם בטקסט ואשמח לעזור!');
}

// ── Image messages ────────────────────────────────────────────────────────────
async function handleImageMessage(from, media) {
  await sendMessage(from, 'תודה על התמונה! 📸\nאני מעביר אותה לבדיקה ידנית ונחזור אליך בהקדם 😊');
  await sendMessage(OWNER, `📸 תמונה מלקוח ${formatPhone(from)}:`, media);
}

// ── Customer messages ─────────────────────────────────────────────────────────
async function handleCustomerMessage(phone, body) {
  const history = getHistory(phone);

  let reply;
  try {
    reply = await processMessage(phone, body, history);
  } catch (err) {
    console.error('שגיאה ב-processMessage:', err);
    await sendMessage(phone, 'מצטערים, אירעה תקלה זמנית 🙏 אנא נסה שוב בעוד כמה דקות');
    return;
  }

  if (!reply || !reply.trim()) {
    await sendMessage(phone, 'מצטערים, אירעה תקלה זמנית 🙏 אנא נסה שוב בעוד כמה דקות');
    return;
  }

  appendMessage(phone, 'user', body);
  appendMessage(phone, 'assistant', reply);
  console.log(`💬 תשובה ל-${phone}: "${reply.slice(0, 60)}..."`);
  await sendMessage(phone, reply);
}

// ── Start ─────────────────────────────────────────────────────────────────────
console.log('🚀 מפעיל את הבוט...');
client.initialize();
