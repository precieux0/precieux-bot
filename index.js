/**
 * OkitakoyBot — WhatsApp bot prototype with automatic session backups
 * IMPORTANT: Non-official integration using whatsapp-web.js. May violate WhatsApp ToS.
 *
 * ENV variables (set on Render):
 * - EXPORT_TOKEN : secret token to protect export/import endpoints (required)
 * - OPENAI_API_KEY : optional (for summarize)
 * - FLUXAI_API_KEY : optional (for image generation)
 * - AUTO_BACKUP : optional; set to 'false' to disable automatic backups. Default: enabled
 * - PORT : optional (default 3000)
 */
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const multer = require('multer');
const extract = require('extract-zip');
const axios = require('axios');
const upload = multer({ dest: 'uploads/' });
const app = express();
app.use(express.json());

const BOT_NAME = 'OkitakoyBot';
const WELCOME_TEXT = 'Salut, je suis OkitakoyBot 🤖 — le bot personnel de Précieux Okitakoy ! Tape *help* pour voir ce que je peux faire.';
const AUTH_DIR = path.resolve('./.wwebjs_auth');
const BACKUP_DIR = path.resolve('./session-backups');
const EXPORT_TOKEN = process.env.EXPORT_TOKEN || 'change_this_token';
const AUTO_BACKUP = (process.env.AUTO_BACKUP || 'true').toLowerCase() !== 'false';

// ensure backup dir exists
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'okitakoy-bot' }),
  puppeteer: { headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] }
});

// track seen chats to send welcome only once per chat
const SEEN_FILE = path.resolve('./seen.json');
let seen = {};
try {
  if (fs.existsSync(SEEN_FILE)) seen = JSON.parse(fs.readFileSync(SEEN_FILE));
} catch (e) {
  console.error('Error reading seen.json', e);
  seen = {};
}

client.on('qr', qr => {
  console.log('--- QR RECEIVED ---');
  qrcode.generate(qr, { small: true });
  console.log('Scan le QR dans les logs (Render) pour authentifier le numéro.');
});

client.on('authenticated', () => console.log('AUTHENTICATED'));
client.on('auth_failure', msg => console.error('AUTH FAILURE', msg));
client.on('disconnected', reason => console.log('DISCONNECTED', reason));

client.on('ready', () => {
  console.log(`${BOT_NAME} prêt !`);
  if (AUTO_BACKUP) {
    try {
      autoExportSession();
    } catch (e) {
      console.error('Auto export session error', e);
    }
  }
});

client.on('message', async msg => {
  try {
    const body = (msg.body || '').trim();
    const lower = body.toLowerCase();
    const chatId = msg.from || 'unknown';

    // send welcome once per chat
    if (!seen[chatId]) {
      try {
        await msg.reply(WELCOME_TEXT);
        seen[chatId] = true;
        fs.writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2));
      } catch (e) {
        console.error('Could not send welcome', e);
      }
    }

    // basic commands
    if (lower === 'ping') return msg.reply('pong');
    if (lower === 'help' || lower === 'aide') {
      return msg.reply(`Bonjour! Commandes disponibles:\n- ping\n- help\n- summarize: <texte>\n- image: <prompt>\nBot maintenu par Précieux Okitakoy.`);
    }

    if (lower.startsWith('summarize:') || lower.startsWith('résume:') || lower.startsWith('resumer:')) {
      const text = body.split(':').slice(1).join(':').trim();
      if (!text) return msg.reply('Envoie: summarize: [ton texte]');
      await msg.reply('Je résume...');
      const summary = await summarizeWithOpenAI(text);
      return msg.reply(summary);
    }

    if (lower.startsWith('image:')) {
      const prompt = body.split(':').slice(1).join(':').trim();
      if (!prompt) return msg.reply('Envoie: image: [ton prompt]');
      await msg.reply('Génération d\'image en cours...');
      try {
        const imgUrl = await generateImageFluxAI(prompt);
        return msg.reply(`Image générée: ${imgUrl}`);
      } catch (e) {
        console.error(e);
        return msg.reply('Erreur lors de la génération d\'image.');
      }
    }

    // greeting handler
    if (lower.includes('bonjour') || lower.includes('salut')) {
      return msg.reply('Salut! Tape "help" pour la liste des commandes.');
    }

  } catch (err) {
    console.error('message handler error', err);
  }
});

// ---------- Helpers (OpenAI & FluxAI placeholders) ----------
async function summarizeWithOpenAI(text) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return 'OpenAI API key non configurée. Configure OPENAI_API_KEY.';
  try {
    const resp = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: `Fais un résumé court en français de ce texte:\n\n${text}` }],
      max_tokens: 300,
    }, {
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }
    });
    const content = resp.data?.choices?.[0]?.message?.content;
    return content || 'Aucun résumé reçu.';
  } catch (e) {
    console.error('OpenAI error', e.response?.data || e.message);
    return 'Erreur lors de la requête OpenAI.';
  }
}

async function generateImageFluxAI(prompt) {
  const key = process.env.FLUXAI_API_KEY;
  if (!key) throw new Error('FLUXAI_API_KEY missing');
  // Placeholder: adapt to FluxAI API
  const resp = await axios.post('https://api.flux.ai/v1/generate', { prompt }, {
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }
  });
  return resp.data?.url || 'https://example.com/generated-image-placeholder.png';
}

// ---------- Auto export session ----------
function autoExportSession() {
  if (!fs.existsSync(AUTH_DIR)) return console.log('Aucune session trouvée pour sauvegarde.');
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const zipName = `session-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
  const outputPath = path.join(BACKUP_DIR, zipName);
  const output = fs.createWriteStream(outputPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', err => { throw err; });
  archive.pipe(output);
  archive.directory(AUTH_DIR, false);
  archive.finalize();
  output.on('close', () => console.log(`Session exportée automatiquement → ${outputPath}`));
}

// ---------- Export session endpoint (protected) ----------
app.get('/export-session', (req, res) => {
  const token = req.query.token || req.headers['x-export-token'];
  if (token !== EXPORT_TOKEN) return res.status(401).send('Unauthorized');
  if (!fs.existsSync(AUTH_DIR)) return res.status(404).send('No session data found');
  const zipName = `session-export-${Date.now()}.zip`;
  res.setHeader('Content-Disposition', `attachment; filename=${zipName}`);
  res.setHeader('Content-Type', 'application/zip');
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', err => { throw err; });
  archive.pipe(res);
  archive.directory(AUTH_DIR, false);
  archive.finalize();
});

// ---------- Import session endpoint (protected) ----------
app.post('/import-session', upload.single('session'), async (req, res) => {
  const token = req.query.token || req.headers['x-export-token'];
  if (token !== EXPORT_TOKEN) return res.status(401).send('Unauthorized');
  if (!req.file) return res.status(400).send('No file uploaded');
  const zipPath = req.file.path;
  try {
    // remove existing auth dir (backup optional)
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    }
    await extract(zipPath, { dir: path.resolve('./') });
    fs.unlinkSync(zipPath);
    return res.send('Session imported. Restart service if needed.');
  } catch (e) {
    console.error('Import error', e);
    return res.status(500).send('Import failed');
  }
});

// Health and info endpoints
app.get('/', (req, res) => res.send(`${BOT_NAME} running. Auto backup: ${AUTO_BACKUP}`));
app.get('/info', (req, res) => res.json({ bot: BOT_NAME, autoBackup: AUTO_BACKUP }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Health server listening on', port));

client.initialize();
