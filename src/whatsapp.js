import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;

export const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu',
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
