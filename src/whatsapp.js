import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { EventEmitter } from 'events';
import { join, dirname } from 'path';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import pino from 'pino';

const AUTH_DIR = process.env.BAILEYS_AUTH_DIR || join(process.cwd(), '.wwebjs_auth', 'baileys_auth');

// Restore auth from env var (for cloud deployments)
if (process.env.BAILEYS_AUTH_B64 && !existsSync(join(AUTH_DIR, 'creds.json'))) {
  try {
    mkdirSync(AUTH_DIR, { recursive: true });
    const tarPath = join(process.cwd(), '_baileys_restore.tar.gz');
    writeFileSync(tarPath, Buffer.from(process.env.BAILEYS_AUTH_B64, 'base64'));
    execSync(`tar -xzf ${tarPath} -C ${process.cwd()}`);
    console.log('✅ סשן WhatsApp שוחזר מ-env var');
  } catch (e) {
    console.warn('⚠️ לא הצלחתי לשחזר סשן:', e.message);
  }
}

const _emitter = new EventEmitter();
let _sock = null;
let _ownPhone = null;
let _ownLid = null;

async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  _sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['TikTak Laser Bot', 'Chrome', '1.0'],
  });

  _sock.ev.on('creds.update', saveCreds);

  // learn own LID from contacts (WhatsApp privacy mode maps phone→LID)
  _sock.ev.on('contacts.upsert', (contacts) => {
    if (_ownLid || !_ownPhone) return;
    for (const c of contacts) {
      const phone = (c.id || '').split(':')[0].split('@')[0];
      if (phone === _ownPhone && c.lid) {
        _ownLid = c.lid.split(':')[0].split('@')[0];
        console.log('📱 נלמד LID מcontacts:', _ownLid);
      }
    }
  });

  _sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) _emitter.emit('qr', qr);

    if (connection === 'close') {
      const err  = lastDisconnect?.error;
      const code = new Boom(err)?.output?.statusCode;
      console.error('🔌 disconnect code:', code, 'error:', err?.message, err?.output?.payload);
      _emitter.emit('disconnected', err?.message || 'unknown');
      if (code !== DisconnectReason.loggedOut) setTimeout(connect, 5000);
    }

    if (connection === 'open') {
      _ownPhone = _sock.user?.id?.split(':')[0].split('@')[0];
      _ownLid   = _sock.user?.lid?.split(':')[0].split('@')[0] || null;
      console.log('📱 bot own phone:', _ownPhone, '| lid:', _ownLid);
      _emitter.emit('ready');
    }
  });

  _sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const raw of messages) {
      if (!raw.message) continue;
      if (raw.key.fromMe) {
        const remoteJid = raw.key.remoteJid;
        // learn own LID from first fromMe @lid message (self-chat sync)
        if (!_ownLid && remoteJid.endsWith('@lid')) {
          _ownLid = remoteJid.split('@')[0];
          console.log('📱 נלמד LID מself-chat:', _ownLid);
        }
        const isSelfPhone = _ownPhone && remoteJid === `${_ownPhone}@s.whatsapp.net`;
        const isSelfLid   = _ownLid   && remoteJid === `${_ownLid}@lid`;
        if (!isSelfPhone && !isSelfLid) {
          // פקודות מנהל שנשלחות ישירות בצ'אט של לקוח
          const body = _body(raw)?.trim();
          const CHAT_CMDS = /^(הוסף לבוט|הסר מבוט|השתק|המשך)$/i;
          if (body && CHAT_CMDS.test(body) && _ownPhone) {
            _emitter.emit('message', {
              from:      `${_ownPhone}@s.whatsapp.net`,
              fromMe:    true,
              body:      `${body} ${remoteJid}`,
              type:      'chat',
              timestamp: Number(raw.messageTimestamp),
              hasMedia:  false,
              id:        { _serialized: raw.key.id },
            });
          }
        }
        // דלג על כל הודעות fromMe (כולל self-chat) כדי למנוע לופ
        continue;
      }
      _emitter.emit('message', _adapt(raw));
    }
  });
}

function _body(raw) {
  const m = raw.message;
  return m?.conversation
    || m?.extendedTextMessage?.text
    || m?.imageMessage?.caption
    || m?.videoMessage?.caption
    || '';
}

function _type(raw) {
  const m = raw.message;
  if (!m) return 'unknown';
  if (m.audioMessage || m.pttMessage) return 'ptt';
  if (m.imageMessage) return 'image';
  if (m.videoMessage) return 'video';
  return 'chat';
}

function _adapt(raw) {
  return {
    from:     raw.key.remoteJid,
    fromMe:   raw.key.fromMe || false,
    body:     _body(raw),
    type:     _type(raw),
    timestamp: Number(raw.messageTimestamp),
    hasMedia: !!(raw.message?.imageMessage || raw.message?.videoMessage),
    id:       { _serialized: raw.key.id },
  };
}

export const client = {
  on:         _emitter.on.bind(_emitter),
  initialize: connect,
  getState:   async () => _sock ? 'CONNECTED' : 'DISCONNECTED',
};

export function getOwnLid() { return _ownLid; }

export function toChatId(phone) {
  if (phone.includes('@g.us') || phone.includes('@lid')) return phone;
  return phone.replace('@c.us', '').replace('@s.whatsapp.net', '') + '@s.whatsapp.net';
}

export function formatPhone(chatId) {
  if (chatId.includes('@lid')) return chatId.replace(/@.*/, '');
  return '+' + chatId.replace(/@.*/, '');
}

export async function sendMessage(to, body, media) {
  if (!_sock) throw new Error('WhatsApp לא מחובר');
  const jid = toChatId(to);
  if (media) {
    try {
      await _sock.sendMessage(jid, { image: Buffer.from(media.data, 'base64'), caption: body || '' });
      return;
    } catch { /* fallthrough */ }
  }
  await _sock.sendMessage(jid, { text: body });
}
