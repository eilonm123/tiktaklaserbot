import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { saveAppointment, getNextAppointmentByPhone, cancelCustomerAppointment, requestCancellation, getPendingAppointments, getTodayAppointments, getStatistics, getKnowledge } from './store.js';
import { sendMessage, formatPhone } from './whatsapp.js';
import { ownerApprovalRequest } from './messages.js';
import { checkAvailability } from './calendar.js';

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

const MAX_HISTORY_MESSAGES = 20;

const SYSTEM_PROMPT_BASE = `חוק ברזל: כתוב אך ורק בעברית. אסור לחלוטין להשתמש באנגלית, ברוסית, ערבית או כל שפה אחרת – אפילו לא מילה בודדת. אם עולה מילה בשפה אחרת – החלף אותה במיידית במילה עברית מקבילה.

אתה נציג שירות של טיקטק לייזר – קליניקה משפחתית וייחודית להסרת שיער בלייזר בהרצליה. האווירה אצלנו חמה ואישית, כל לקוח מקבל יחס אמיתי.

━━━━━━━━━━━━━━━━━━
שפה וסגנון
━━━━━━━━━━━━━━━━━━
• עברית בלבד – אפילו לא מילה אחת בשפה אחרת
• אמוג׳י במינון – אחד לשתיים להודעה, רק כשמרגיש טבעי. לא אחרי כל משפט
• כתוב כמו בן אדם אמיתי שמדבר בצ׳אט – קצר, חם, ישיר
• אל תכתוב רשימות ממוספרות באמצע שיחה רגילה
• אל תחזור על שאלה שכבר שאלת – אם לא קיבלת תשובה, תמשיך את השיחה קדימה

━━━━━━━━━━━━━━━━━━
זיהוי מין ופנייה
━━━━━━━━━━━━━━━━━━
• ברירת מחדל: פני בלשון נקבה (רוב הלקוחות נשים)
• עבור ללשון זכר אם יש סימן ברור: "אני רוצה", שם גברי, "מעוניין", "צריך"
• לעולם אל תכתוב "את/ה" או "רוצה/ת" – זה נשמע כמו בוט. בחר צד

━━━━━━━━━━━━━━━━━━
הבנת זמנים
━━━━━━━━━━━━━━━━━━
• התאריך של היום: {{TODAY}} ({{DAY}})
• "היום" = {{TODAY}}
• "מחר" = {{TOMORROW}}
• "שבוע הבא" = {{NEXT_WEEK}}
• אם לקוח אומר "ביום שלישי" – חשב את יום שלישי הקרוב מהיום
• המר תמיד לפורמט DD/MM/YYYY לפני שמעביר לכלי

━━━━━━━━━━━━━━━━━━
פרטי הקליניקה
━━━━━━━━━━━━━━━━━━
שם: טיקטק לייזר
כתובת: פתח תקווה 8, הרצליה
שעות פתיחה:
  ראשון–חמישי: 18:00–22:00
  שישי: 08:00–14:00
  שלישי: 08:00–22:00 (בתיאום מראש)
משך טיפול: שעה אחת

━━━━━━━━━━━━━━━━━━
הטכנולוגיה שלנו
━━━━━━━━━━━━━━━━━━
• מכונה: Elysion Pro – אחת המכונות המתקדמות בעולם להסרת שיער בלייזר
• מתאימה לכל סוגי העור והשיער
• טיפול מהיר, יעיל ובטוח
• מאושרת על ידי משרד הבריאות

━━━━━━━━━━━━━━━━━━
מבצעים מיוחדים
━━━━━━━━━━━━━━━━━━
• בית שחי ב-50₪ לטיפול בודד – ללא התחייבות (במקום 100₪/170₪) – לנשים ולגברים כאחד
• 4 אזורים גדולים ב-450₪ לטיפול בודד – ללא התחייבות – לנשים ולגברים כאחד

━━━━━━━━━━━━━━━━━━
תוכניות טיפול
━━━━━━━━━━━━━━━━━━
סטנדרט – תשלום לפי טיפול, ללא התחייבות
פרימיום – 5 טיפולים + 1 מתנה, הנחה 5%
סופר פרימיום – 10 טיפולים + 2 מתנה, הנחה 15%

━━━━━━━━━━━━━━━━━━
מחירון נשים
━━━━━━━━━━━━━━━━━━
יד מלאה: 170₪ / סדרה 1,500₪ | חצי יד תחתונה: 120₪ / 1,000₪ | כפות ידיים: 100₪ / 800₪
רגליים מלאות: 240₪ / 2,200₪ | חצי רגל: 240₪ / 2,200₪ | כפות רגליים: 100₪ / 800₪
מפשעות: 100₪ / 800₪ | בטן: 170₪ / 1,500₪ | בית שחי: 100₪ / 800₪
ישבן: 170₪ / 1,500₪ | קו ביקיני: 130₪ / 1,100₪ | ביקיני מלא: 200₪ / 1,800₪
ברזילאי: 240₪ / 2,200₪ | פנים מלאות: 170₪ / 1,500₪ | שפם/סנטר/צוואר: 100₪ / 800₪
גוף מלא: 650₪ / 6,500₪

━━━━━━━━━━━━━━━━━━
מחירון גברים
━━━━━━━━━━━━━━━━━━
יד מלאה: 240₪ / 2,200₪ | רגליים מלאות: 490₪ / 4,400₪ | מפשעות: 240₪ / 2,200₪
בטן/חזה/כתפיים/גב: 240₪ / 2,200₪ | בית שחי: 170₪ / 1,500₪
גוף מלא: 750₪ / 7,500₪

━━━━━━━━━━━━━━━━━━
זרימת שיחה טבעית
━━━━━━━━━━━━━━━━━━
• שאלה אחת בכל פעם – לא שאלון שלם במכה אחת
• הקשיבי ללקוח לפני שאת מציעה כלום. תני לו להוביל קצת
• ייעוץ חינמי – הצעי אותו כמו שחברה הייתה ממליצה, לא כמו פרסומת
• מחיר – הבן מהשיחה על אילו אזורים דיברנו, ותן מחיר ספציפי לאותם אזורים:
  "לפי מה שדיברנו, [אזור X] עולה [מחיר] לטיפול בודד ללא התחייבות"
  אם לא דיברנו על אזור ספציפי – שאל על איזה אזור לפני שתתן מחיר
• אחרי המחיר – תמיד הוסף בטבעיות: "ותמיד אפשר להתחיל עם ייעוץ חינם אצלנו, בלי כלום"
• אל תתעקש על ייעוץ אם הלקוח רוצה מחיר – ענה קודם, הזמן אחר כך
• אם לקוח לא ענה על משהו – אל תשאל שוב. שלב את זה בהמשך בצורה טבעית

━━━━━━━━━━━━━━━━━━
הנחיות לכלי קביעת תור
━━━━━━━━━━━━━━━━━━
• אסוף לפני הפעלת הכלי: שם מלא, אזור/בריף (אופציונלי), תאריך, שעה
• המר תאריכים יחסיים ("היום", "מחר") לפורמט DD/MM/YYYY
• זהה מין מהשיחה – אל תשאל ישירות
• לעולם אל תעביר ערכים כמו "לא ידוע" – שאל עוד קודם
• לאחר איסוף כל הפרטים – הצג ללקוח סיכום ושאל "לאשר? ✅" לפני הפעלת הכלי. דוגמה: "סיכום התור:\n📅 [תאריך] בשעה [שעה]\n🎯 [אזורים]\nלאשר? ✅"
• הפעל את הכלי רק אחרי שהלקוח אישר (כן / מאושר / אשר / אוקי וכדומה)
• אחרי הפעלת הכלי – אמור ללקוח שהבקשה נשלחה לאישור המנהל

━━━━━━━━━━━━━━━━━━
נושאי שיחה מותרים
━━━━━━━━━━━━━━━━━━
• כל הודעה שיכולה להיות פנייה של לקוח – ענה עליה בחיוב. כולל:
  "שלום", "היי", "מעוניין", "מעוניינת", "מעוניין בפרטים", "מעוניין בלייזר", "אפשר פרטים", "כמה עולה", "יש מקום" – כולן פניות עסקיות לכל דבר
• אם ההודעה ברורה שאין לה קשר לקליניקה (מזג אוויר, ספורט, פוליטיקה, שיחה אישית) – ענה:
  "אני כאן רק לשירות קליניקת טיקטק לייזר 😊 לכל שאלה על הסרת שיער בלייזר אשמח לעזור!"
• במקרה של ספק – ענה כאילו זה לקוח פוטנציאלי. עדיף לענות פעם אחת יותר מדי מאשר לפספס לקוח`;

function buildKnowledgeSection() {
  const facts = getKnowledge();
  if (!facts.length) return '';
  return `\n━━━━━━━━━━━━━━━━━━\nמידע נוסף על הקליניקה\n━━━━━━━━━━━━━━━━━━\n${facts.map(f => `• ${f}`).join('\n')}`;
}

function buildSystemPrompt() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const nextWeek = new Date(now); nextWeek.setDate(now.getDate() + 7);

  return (SYSTEM_PROMPT_BASE + buildKnowledgeSection())
    .replace(/\{\{TODAY\}\}/g, fmt(now))
    .replace(/\{\{DAY\}\}/g, days[now.getDay()])
    .replace(/\{\{TOMORROW\}\}/g, fmt(tomorrow))
    .replace(/\{\{NEXT_WEEK\}\}/g, fmt(nextWeek));
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_appointment_request',
      description: 'שולח בקשת תור לאישור המנהל. השתמש רק לאחר שיש שם, תאריך ושעה.',
      parameters: {
        type: 'object',
        properties: {
          customer_name: { type: 'string', description: 'שם מלא של הלקוח' },
          areas: {
            type: 'array',
            items: { type: 'string' },
            description: 'אזורי טיפול או בריף קצר (אם סופק)',
          },
          date: { type: 'string', description: 'תאריך בפורמט DD/MM/YYYY' },
          time: { type: 'string', description: 'שעה בפורמט HH:MM' },
          gender: {
            type: 'string',
            description: 'מין שזוהה מהשיחה: female (אישה) או male (גבר)',
          },
          notes: { type: 'string', description: 'הערות נוספות' },
        },
        required: ['customer_name', 'date', 'time'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_my_appointment',
      description: 'מחזיר את פרטי התור הקרוב של הלקוח. השתמש כשהלקוח שואל "מתי התור שלי", "יש לי תור", "מה הפרטים שלי".',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_appointment',
      description: 'מבטל את התור הקרוב של הלקוח. השתמש כשהלקוח מבקש לבטל תור.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_owner',
      description: 'שלח שאלה לבעלת הקליניקה כשאינך יודע את התשובה. השתמש רק לשאלות ספציפיות שאינן מופיעות במידע שלך (כגון: זמינות יום מסוים, מידע רפואי ספציפי, החלטות עסקיות).',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'השאלה שהלקוח שאל' },
        },
        required: ['question'],
      },
    },
  },
];

export async function processMessage(phone, userMessage, history) {
  const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES);
  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    ...trimmedHistory,
    { role: 'user', content: userMessage },
  ];

  const MODELS = ['openai/gpt-4o-mini', 'openai/gpt-oss-120b:free'];
  let response;
  for (const model of MODELS) {
    try {
      response = await openai.chat.completions.create({
        model,
        messages,
        tools: TOOLS,
        tool_choice: 'auto',
        max_tokens: 1024,
      }, { timeout: 30_000 });
      break;
    } catch (err) {
      console.error(`OpenRouter error (${model}):`, err.message);
      if (model === MODELS[MODELS.length - 1]) {
        return 'מצטערים, אירעה תקלה טכנית זמנית 🙏 אנא נסה שוב בעוד כמה דקות';
      }
    }
  }

  const choice = response.choices?.[0];
  if (!choice || !choice.message) {
    console.error('תשובה ריקה מ-OpenRouter');
    return 'מצטערים, אירעה תקלה זמנית 🙏 אנא נסה שוב בעוד כמה דקות';
  }

  if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length) {
    const toolCall = choice.message.tool_calls[0];
    let input;
    try {
      input = JSON.parse(toolCall.function.arguments);
    } catch {
      return 'מצטערים, הייתה בעיה בעיבוד הפרטים 🙏 אנא נסה שוב';
    }

    // כלי: ביטול תור — שולח לאישור מנהל
    if (toolCall.function.name === 'cancel_appointment') {
      const appt = requestCancellation(phone);
      if (!appt) return 'לא מצאתי תור פעיל לביטול 😊 צור קשר ישירות אם צריך עזרה';
      const notify = `⚠️ בקשת ביטול תור\n👤 ${appt.name}\n📅 ${appt.date} בשעה ${appt.time}\n📞 ${formatPhone(phone)}\n\nלאישור הביטול: *אשר ביטול ${appt.name}*\nלדחיית הביטול: *דחה ביטול ${appt.name}*`;
      const recipients = [`${process.env.OWNER_NUMBER}@s.whatsapp.net`];
      if (process.env.ADMIN_NUMBER) recipients.push(`${process.env.ADMIN_NUMBER}@s.whatsapp.net`);
      for (const r of recipients) {
        try { await sendMessage(r, notify); } catch (err) { console.error('שגיאה בהודעת ביטול:', err.message); }
      }
      return `בקשת הביטול שלך נשלחה לאישור המנהל ✅\nניצור איתך קשר בהקדם 😊`;
    }

    // כלי: תור קרוב של הלקוח
    if (toolCall.function.name === 'get_my_appointment') {
      const appt = getNextAppointmentByPhone(phone);
      if (!appt) return 'לא מצאתי תור פעיל על שמך 😊 רוצה לקבוע אחד?';
      const areas = Array.isArray(appt.areas) ? appt.areas.join(', ') : appt.areas;
      return `התור שלך הוא ב-${appt.date} בשעה ${appt.time} 📅\n📍 פתח תקווה 8, הרצליה\n🎯 ${areas}`;
    }

    // כלי: שאל את הבעלים
    if (toolCall.function.name === 'ask_owner') {
      try {
        await sendMessage(
          `${process.env.OWNER_NUMBER}@s.whatsapp.net`,
          `❓ שאלה מלקוח ${formatPhone(phone)}:\n${input.question}\n\nלמענה: תשובה ${phone} <תשובתך>`
        );
      } catch (err) {
        console.error('שגיאה בשליחה למנהל:', err.message);
      }
      return 'שאלה מצוינת! אני בודקת עם הצוות ומחזירה אליך בהקדם 😊';
    }

    // Normalize gender
    const genderRaw = (input.gender || '').toLowerCase();
    const gender =
      genderRaw.includes('female') || genderRaw.includes('אישה') || genderRaw.includes('נקבה')
        ? 'female'
        : genderRaw.includes('male') || genderRaw.includes('גבר') || genderRaw.includes('זכר')
        ? 'male'
        : 'female';

    // בדוק זמינות ביומן לפני שמירה
    try {
      const avail = await checkAvailability(input.date, input.time);
      if (!avail.available) {
        const sugText = avail.suggestions.length > 0
          ? `\nשעות פנויות בסביבה: *${avail.suggestions.join('* / *')}*`
          : '';
        return `מצטערת, השעה ${input.time} ביום ${input.date} תפוסה ביומן 😔${sugText}\nאיזו שעה אחרת מתאימה לך?`;
      }
    } catch (err) {
      console.error('שגיאה בבדיקת יומן:', err.message);
      // ממשיכים גם אם הבדיקה נכשלה
    }

    const id = uuidv4().slice(0, 8).toUpperCase();
    const appt = {
      id,
      phone,
      name: input.customer_name,
      areas: input.areas || ['ייעוץ'],
      date: input.date,
      time: input.time,
      plan: 'standard',
      gender,
      notes: input.notes || '',
      status: 'pending',
      createdAt: Date.now(),
    };

    saveAppointment(appt);
    console.log(`📅 תור נשמר: ${id} | ${input.customer_name} | ${input.date} ${input.time}`);

    const ownerMsg = ownerApprovalRequest(
      id, input.customer_name, formatPhone(phone), appt.areas,
      input.date, input.time, 'standard', gender, input.notes || ''
    );

    const recipients = [`${process.env.OWNER_NUMBER}@s.whatsapp.net`];
    if (process.env.ADMIN_NUMBER) recipients.push(`${process.env.ADMIN_NUMBER}@s.whatsapp.net`);
    for (const recipient of recipients) {
      try {
        await sendMessage(recipient, ownerMsg);
        console.log(`📤 בקשת אישור נשלחה ל-${recipient}`);
      } catch (err) {
        console.error(`שגיאה בשליחה ל-${recipient}:`, err.message);
      }
    }

    return `מעולה ${input.customer_name}! 🎉\nהתור שלך ל-${input.date} בשעה ${input.time} נשלח לאישור המנהל ✅\nניצור איתך קשר בהקדם לאישור סופי 😊`;
  }

  return choice.message.content || '';
}

const adminHistories = new Map();

export async function processAdminMessage(adminId, message) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const today = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;

  const pending  = getPendingAppointments();
  const todayApp = getTodayAppointments();
  const stats    = getStatistics();

  const knowledge = getKnowledge();
  const systemPrompt = `אתה עוזר חכם למנהלת קליניקת טיקטק לייזר בהרצליה.
תענה קצר, ישיר ועברית בלבד.

מידע עדכני על העסק:
- תאריך היום: ${today}
- תורים היום (${todayApp.length}): ${todayApp.length ? todayApp.map(a => `${a.time} ${a.name}`).join(', ') : 'אין'}
- ממתינים לאישור (${pending.length}): ${pending.length ? pending.map(a => `${a.name} ב-${a.date} ${a.time}`).join(', ') : 'אין'}
- סטטיסטיקה: ${stats.total} תורים סה"כ, ${stats.week} השבוע, ${stats.month} החודש
${knowledge.length ? `\nעובדות על הקליניקה:\n${knowledge.map(f => `- ${f}`).join('\n')}` : ''}
פקודות זמינות: אישור/דחייה/מחק <שם>, רשימה, תורים היום, סטטיסטיקה, תשובה <טלפון> <טקסט>, סיים/נקה/השתק/המשך/חסום/שחרר/הסר מבוט/הוסף לבוט <טלפון>, מחק ממתינות, שלח לכולם <הודעה>, למד:/שכח: <עובדה>, ידע.

אם המנהל שואל על פקודה — הסבר. אם שואל על לקוח או תור — ענה לפי המידע שיש לך. אם שואל שאלה כללית על העסק — ענה בצורה עניינית.`;

  if (!adminHistories.has(adminId)) adminHistories.set(adminId, []);
  const history = adminHistories.get(adminId);
  history.push({ role: 'user', content: message });
  if (history.length > 10) history.splice(0, history.length - 10);

  const MODELS = ['openai/gpt-4o-mini', 'openai/gpt-oss-120b:free'];
  for (const model of MODELS) {
    try {
      const res = await openai.chat.completions.create({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...history],
        max_tokens: 512,
      }, { timeout: 20_000 });
      const reply = res.choices?.[0]?.message?.content || '';
      if (reply) {
        history.push({ role: 'assistant', content: reply });
        return reply;
      }
    } catch (err) {
      console.error(`Admin AI error (${model}):`, err.message);
      if (model === MODELS[MODELS.length - 1]) return null;
    }
  }
  return null;
}
