// סקריפט חד-פעמי לקבלת refresh token מגוגל
// הרץ: node scripts/get-token.js

import 'dotenv/config';
import { google } from 'googleapis';
import http from 'http';

const REDIRECT = 'http://localhost:3001';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  REDIRECT,
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/calendar'],
  prompt: 'consent',
});

console.log('\n1. פתח את הקישור הזה בדפדפן:\n');
console.log(authUrl);
console.log('\n2. אשר גישה ליומן — הקוד יתקבל אוטומטית\n');

const server = http.createServer(async (req, res) => {
  const code = new URL(req.url, REDIRECT).searchParams.get('code');
  if (!code) { res.end('שגיאה'); return; }

  res.end('<h2>✅ הצלחה! אפשר לסגור את הדף</h2>');
  server.close();

  const { tokens } = await oauth2Client.getToken(code);
  console.log('\n✅ הוסף את השורה הזאת ל-.env שלך:\n');
  console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
});

server.listen(3001);
