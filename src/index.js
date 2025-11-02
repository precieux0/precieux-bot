// ===============================
// 🔧 CONFIGURATION PRINCIPALE
// ===============================
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const fs = require('fs');
const path = require('path');

// ===============================
// 🌐 SERVEUR EXPRESS (KEEP ALIVE)
// ===============================
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('🤖 OkitaBot est en ligne et fonctionne parfaitement !');
});

app.listen(PORT, () => {
  console.log(`🌍 Serveur en ligne sur le port ${PORT}`);
});

// ===============================
// 📁 SÉCURISATION DU DOSSIER DE SESSION
// ===============================
const SESSION_PATH = path.join(__dirname, '../session-backups');
if (!fs.existsSync(SESSION_PATH)) {
  fs.mkdirSync(SESSION_PATH, { recursive: true });
  console.log('📁 Dossier de session créé.');
}

// ===============================
// 💬 INITIALISATION DU CLIENT WHATSAPP
// ===============================
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: SESSION_PATH }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

// ===============================
// ⚙️ ÉVÉNEMENTS DU BOT
// ===============================

// QR à scanner
client.on('qr', (qr) => {
  console.log('📱 Scan ce QR code pour te connecter :');
  qrcode.generate(qr, { small: true });
});

// Authentifié
client.on('authenticated', () => {
  console.log('✅ Authentification réussie !');
});

// Prêt
client.on('ready', () => {
  console.log('🤖 OkitaBot est prêt et connecté !');
});

// Échec d’authentification
client.on('auth_failure', (msg) => {
  console.error('❌ Erreur d’authentification :', msg);
});

// Reconnexion auto si déconnecté
client.on('disconnected', (reason) => {
  console.warn('⚠️ Bot déconnecté :', reason);
  console.log('🔄 Tentative de reconnexion automatique dans 5 secondes...');
  setTimeout(() => {
    client.initialize();
  }, 5000);
});

// ===============================
// 💬 GESTION DES MESSAGES
// ===============================
client.on('message', async (message) => {
  console.log(`📩 Message reçu de ${message.from}: ${message.body}`);

  // Exemple simple : ping/pong
  if (message.body.toLowerCase() === 'ping') {
    await message.reply('🏓 Pong !');
  }

  // Réponse automatique pour tout autre message
  else {
    await message.reply(
      '🤖 Bonjour ! Je suis OkitaBot, votre assistant actif 24h/24 et 7j/7.'
    );
  }
});

// ===============================
// 🚀 LANCEMENT DU BOT
// ===============================
client.initialize();
