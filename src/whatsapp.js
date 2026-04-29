import pkg from 'whatsapp-web.js';
import { rmSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
const { Client, LocalAuth } = pkg;

// מחיקת SingletonLock שנשאר מ-instance קודם
try {
  const authDir = join(process.cwd(), '.wwebjs_auth');
  if (existsSync(authDir)) {
    for (const session of readdirSync(authDir)) {
      const lock = join(authDir, session, 'SingletonLock');
      if (existsSync(lock)) { rmSync(lock); console.log('🔓 SingletonLock נמחק'); }
    }
  }
} catch { /* נמשיך גם אם נכשל */ }

export const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {

    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-extensions',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-breakpad',
      '--disable-component-update',
      '--disable-domain-reliability',
      '--disable-hang-monitor',
      '--disable-ipc-flooding-protection',
      '--disable-renderer-backgrounding',
      '--disable-speech-api',
      '--hide-scrollbars',
      '--mute-audio',
      '--blink-settings=imagesEnabled=false',
    ],
  },
});

export function toChatId(phone) {
  return phone.includes('@') ? phone : `${phone}@c.us`;
}

export function formatPhone(chatId) {
  return '+' + chatId.replace('@c.us', '').replace('@s.whatsapp.net', '');
}

export async function sendMessage(to, body, media) {
  const chatId = toChatId(to);
  if (media) {
    await client.sendMessage(chatId, media, { caption: body });
  } else {
    await client.sendMessage(chatId, body);
  }
}
