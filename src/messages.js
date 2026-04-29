export const PRE_TREATMENT = `📝 הנחיות לקראת הטיפול בלייזר:

1️⃣ יש לגלח את האזור המטופל כשני ימים לפני הטיפול ✂️
2️⃣ להקפיד על לחות – מומלץ למרוח קרם גוף על האזור המטופל פעמיים ביום בשבוע שלפני הטיפול 🧴
3️⃣ פילינג עדין – מומלץ לבצע פילינג באזור הטיפול 3 ימים לפני 🧼
4️⃣ לבוש נוח – להגיע בטיפול בלבוש רחב ונעים 👕
5️⃣ עור נקי – אין למרוח תכשירים, בושם, קרמים, פודרה או איפור לפני הטיפול 🚿
6️⃣ לא להסיר שיער מהשורש (שעווה, פינצטה, אפילציה וכו') 6 שבועות לפני ❌`;

export const MEDICAL_FORM = `📋 מכיוון שזו הפעם הראשונה שלך אצלנו, נשמח שתמלאי את השאלון הרפואי לפני הטיפול:
https://docs.google.com/forms/d/161A7GKr3JWfxTAUV_iUNRcdQgNJmIiYKCnyKcJ5ynQM/viewform`

export const POST_TREATMENT = `🌟 הנחיות לאחר טיפול בלייזר:

☀️ להימנע מחשיפה לשמש לפחות 3 ימים אחרי הטיפול. חובה להשתמש במסנן קרינה גבוה!
🏃‍♂️ לא לבצע פעילות נמרצת שגורמת להזעה למשך 24 שעות
🧴 אין להשתמש בתכשירים פעילים למשך 48 שעות
🚫 לא לגרד או לשפשף את האזור המטופל – להימנע מגירויים בעור ל-48 שעות
🚿 אין לעשות מקלחת חמה / אמבט / סאונה למשך 24 שעות
🏊‍♀️ אין להיכנס לבריכה עם כלור למשך 24 שעות
👖 אין ללבוש בגדים צמודים למשך 24 שעות
💧 אין לשטוף את האזור המטופל במים במשך 8 שעות

שומרים על ההנחיות = מקבלים תוצאות מושלמות! 💖
לשאלות – אני כאן תמיד בשבילך 📲`;

export const GOOGLE_REVIEW_LINK = process.env.GOOGLE_REVIEW_LINK || 'https://g.page/r/CcJONizSy8XJEAE/review';

export const GOOGLE_REVIEW = `אם הטיפול היה לשביעות רצונך נשמח לביקורת חיובית ב-Google 🌟\nזה עוזר לנו המון ולוקח רק דקה:\n${GOOGLE_REVIEW_LINK}`;

export function followUpMessage(name) {
  return `היי ${name}! 😊\nשלושה ימים אחרי הטיפול — איך מרגישים?\nיש שאלות או משהו לבדוק? אנחנו כאן תמיד 💙`;
}

export function rebookNudge(name) {
  return `היי ${name}! 💖\nהגיע הזמן לטיפול הבא 🌟\nלייזר עובד הכי טוב בסדרה רציפה — רוצה לקבוע את המפגש הבא?`;
}

export function appointmentConfirmed(name, date, time) {
  return `היי ${name} 😊
נקבע לך תור להסרת שיער בלייזר בטיקטק לייזר ✨
📍 פתח תקווה 8, הרצליה
📅 תאריך: ${date}
🕖 שעה: ${time}
מחכים לך! 💖`;
}

const PLAN_LABELS = {
  standard: 'סטנדרט (תשלום לפי טיפול)',
  premium: 'פרימיום (5+1 מתנה, 5% הנחה)',
  super_premium: 'סופר פרימיום (10+2 מתנה, 15% הנחה)',
};

const GENDER_LABELS = { female: 'אישה', male: 'גבר' };

export function ownerApprovalRequest(id, name, phone, areas, date, time, plan, gender, notes) {
  const areasList = Array.isArray(areas) ? areas.join(', ') : areas;
  const planLabel = PLAN_LABELS[plan] || plan;
  const genderLabel = GENDER_LABELS[gender] || gender;
  let msg = `🔔 בקשת תור חדשה!

👤 שם: ${name}
📱 טלפון: ${phone}
⚧ מין: ${genderLabel}
🎯 אזורים: ${areasList}
📅 תאריך: ${date}
🕐 שעה: ${time}
📋 תוכנית: ${planLabel}`;

  if (notes) msg += `\n📝 הערות: ${notes}`;

  msg += `\n\nלאישור שלח: אישור ${name}
לדחייה שלח: דחייה ${name}`;

  return msg;
}
