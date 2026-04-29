import 'dotenv/config';
import { createCalendarEvent, checkAvailability } from '../src/calendar.js';

const testAppt = {
  id: 'TEST01',
  phone: '972501234567@c.us',
  name: 'לקוח בדיקה',
  areas: ['בית שחי', 'מפשעות'],
  date: '30/04/2026',
  time: '19:00',
  plan: 'standard',
  gender: 'female',
  notes: 'בדיקת מערכת',
};

console.log('בודק זמינות...');
const avail = await checkAvailability(testAppt.date, testAppt.time);
console.log('זמינות:', avail);

console.log('\nיוצר אירוע ביומן...');
const event = await createCalendarEvent(testAppt);
console.log('✅ אירוע נוצר:', event.htmlLink);
