import { google } from 'googleapis';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEY_FILE  = join(__dirname, '..', 'google-key.json');

const authOptions = process.env.GOOGLE_KEY_BASE64
  ? { credentials: JSON.parse(Buffer.from(process.env.GOOGLE_KEY_BASE64, 'base64').toString()), scopes: ['https://www.googleapis.com/auth/calendar'] }
  : { keyFile: KEY_FILE, scopes: ['https://www.googleapis.com/auth/calendar'] };

const auth = new google.auth.GoogleAuth(authOptions);

const calendar = google.calendar({ version: 'v3', auth });

export async function createCalendarEvent(appt) {
  const [day, month, year] = appt.date.split('/');
  const [hour, minute] = appt.time.split(':');

  const pad = (n) => String(n).padStart(2, '0');
  const localDT = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

  const startDT = `${year}-${month}-${pad(Number(day))}T${hour}:${minute}:00`;
  const endDate = new Date(Number(year), Number(month) - 1, Number(day), Number(hour) + 1, Number(minute));
  const endDT   = `${endDate.getFullYear()}-${pad(endDate.getMonth()+1)}-${pad(endDate.getDate())}T${pad(endDate.getHours())}:${pad(endDate.getMinutes())}:00`;

  const areas = Array.isArray(appt.areas) ? appt.areas.join(', ') : (appt.areas || 'ייעוץ');
  const notesLine = appt.notes ? `\nהערות: ${appt.notes}` : '';

  const event = {
    summary: `טיקטק לייזר – ${appt.name}`,
    description: `לקוח: ${appt.name}\nטלפון: ${appt.phone}\nאזורים: ${areas}${notesLine}`,
    start: { dateTime: startDT, timeZone: 'Asia/Jerusalem' },
    end:   { dateTime: endDT,   timeZone: 'Asia/Jerusalem' },
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 60 }],
    },
  };

  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
  const res = await calendar.events.insert({ calendarId, requestBody: event });
  return res.data;
}

export async function checkAvailability(date, time) {
  try {
    const [day, month, year] = date.split('/');
    const [hour, minute]     = time.split(':');

    const reqStart = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
    const reqEnd   = new Date(reqStart.getTime() + 60 * 60 * 1000);

    const dayStart = new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0);
    const dayEnd   = new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59);

    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
    const res = await calendar.events.list({
      calendarId,
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = (res.data.items || []).filter(ev => ev.start.dateTime);

    const overlaps = (s, e) => events.some(ev => {
      const evS = new Date(ev.start.dateTime);
      const evE = new Date(ev.end.dateTime);
      return s < evE && e > evS;
    });

    if (!overlaps(reqStart, reqEnd)) return { available: true };

    // מצא שעות חלופיות ביום אותו
    const pad = (n) => String(n).padStart(2, '0');
    const suggestions = [];
    for (const delta of [1, 2, -1, 3, -2, 4]) {
      const cS = new Date(reqStart.getTime() + delta * 60 * 60 * 1000);
      const cE = new Date(cS.getTime() + 60 * 60 * 1000);
      if (cS.getHours() < 8 || cS.getHours() + 1 > 22) continue;
      if (!overlaps(cS, cE)) {
        suggestions.push(`${pad(cS.getHours())}:${pad(cS.getMinutes())}`);
        if (suggestions.length >= 2) break;
      }
    }

    return { available: false, suggestions };
  } catch (err) {
    console.error('checkAvailability error:', err.message);
    return { available: true }; // fail open – לא לחסום הזמנה בגלל תקלת API
  }
}
