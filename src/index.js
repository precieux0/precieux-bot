/**
 * OkitakoyBot — Système de parrainage simple
 * Auteur : Précieux Okitakoy
 */

const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState } = require('@whiskeysockets/baileys');
const express = require('express');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// === CONFIGURATION ===
const BOT_NAME = "OkitakoyBot";
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FLUX_KEY = process.env.FLUXAI_API_KEY;

// === CODE DE PARRAINAGE FIXE ===
const SPONSOR_CODE = "OKITAKOY"; // ⬅️ CODE FIXE - Changez-le !
const connectedUsers = new Set();

// === INITIALISATION GEMINI ===
let genAI, geminiModel;
if (GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  geminiModel = genAI.getGenerativeModel({ model: "gemini-pro" });
}

let sock = null;
let latestQr = "";
let isReady = false;

// === FONCTION D'INITIALISATION BOT ===
async function initializeBot() {
  const { state, saveCreds } = await useMultiFileAuthState('baileys_auth');
  
  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    mobile: false,
    browser: ['Chrome (Linux)', '', '']
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('📱 QR Code reçu');
      qrcode.generate(qr, { small: true });
      latestQr = await QRCode.toDataURL(qr);
    }
    
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
      if (shouldReconnect) setTimeout(() => initializeBot(), 5000);
    } else if (connection === 'open') {
      console.log('✅ Connecté à WhatsApp!');
      isReady = true;
    }
  });

  sock.ev.on('creds.update', saveCreds);
  
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;
    
    try {
      const text = getMessageText(msg);
      if (!text) return;
      
      const lower = text.toLowerCase();
      const from = msg.key.remoteJid;
      const userPhone = from.split('@')[0];
      
      // 🔥 VÉRIFICATION DU CODE DE PARRAINAGE
      if (text.toUpperCase() === SPONSOR_CODE) {
        if (connectedUsers.has(userPhone)) {
          await sock.sendMessage(from, { 
            text: '✅ *DÉJÀ CONNECTÉ!*\n\nVous êtes déjà connecté au bot. Tapez *help* pour voir les commandes.' 
          });
        } else {
          connectedUsers.add(userPhone);
          await sock.sendMessage(from, { 
            text: `✅ *CONNEXION RÉUSSIE!*\n\nBienvenue ! Vous êtes maintenant connecté à *${BOT_NAME}*.\n\nTapez *help* pour voir les commandes disponibles. 🤖` 
          });
        }
        return;
      }
      
      // Si l'utilisateur n'est pas connecté
      if (!connectedUsers.has(userPhone)) {
        await sock.sendMessage(from, { 
          text: `🔐 *CONNEXION REQUISE*\n\nPour utiliser le bot, vous devez d'abord vous connecter avec le code de parrainage.\n\n📱 *Code:* ${SPONSOR_CODE}\n\n_Envoyez ce code pour vous connecter_` 
        });
        return;
      }
      
      // Commandes pour utilisateurs connectés
      if (lower === 'ping') await sock.sendMessage(from, { text: 'pong 🏓' });
      else if (lower === 'help') await sendHelpMessage(from);
      else if (lower.startsWith('summarize:')) await handleSummarize(from, text);
      else if (lower.startsWith('image:')) await handleImageGenerate(from, text);
      else await handleAIResponse(from, text);
      
    } catch (error) {
      console.error('Erreur message:', error);
    }
  });
}

function getMessageText(msg) {
  return msg.message.conversation || 
         msg.message.extendedTextMessage?.text || 
         msg.message.imageMessage?.caption || '';
}

async function sendHelpMessage(from) {
  await sock.sendMessage(from, { 
    text: `🤖 *${BOT_NAME} - Commandes*\n\n` +
          `🔐 *CONNEXION*\n` +
          `• Code: ${SPONSOR_CODE}\n\n` +
          `🤖 *FONCTIONNALITÉS*\n` +
          `• summarize: texte - Résumé IA\n` +
          `• image: prompt - Génération d'image\n` +
          `• ping - Test de connexion\n\n` +
          `💬 Envoyez un message pour discuter avec l'IA`
  });
}

async function handleSummarize(from, text) {
  const toSummarize = text.split(':').slice(1).join(':').trim();
  if (!toSummarize) return;
  await sock.sendMessage(from, { text: '📝 Résumé en cours...' });
  const summary = await summarizeWithGemini(toSummarize);
  await sock.sendMessage(from, { text: `📄 *RÉSUMÉ:*\n${summary}` });
}

async function handleImageGenerate(from, text) {
  const prompt = text.split(':').slice(1).join(':').trim();
  if (!prompt) return;
  await sock.sendMessage(from, { text: '🎨 Génération image...' });
  const imgUrl = await generateImageFluxAI(prompt);
  await sock.sendMessage(from, { text: `🖼️ *IMAGE:*\n${imgUrl}` });
}

async function handleAIResponse(from, text) {
  const aiReply = await generateAIReply(text);
  if (aiReply) await sock.sendMessage(from, { text: aiReply });
}

async function summarizeWithGemini(text) {
  if (!geminiModel) return "❌ IA non disponible";
  try {
    const result = await geminiModel.generateContent(`Résume en français: ${text}`);
    return result.response.text() || "Aucun résumé généré";
  } catch (error) {
    return "❌ Erreur résumé";
  }
}

async function generateAIReply(message) {
  if (!geminiModel) return "❌ IA non disponible";
  try {
    const result = await geminiModel.generateContent(
      `Réponds en français comme un assistant professionnel: ${message}`
    );
    return result.response.text();
  } catch (error) {
    return "❌ Erreur de réponse";
  }
}

async function generateImageFluxAI(prompt) {
  if (!FLUX_KEY) return "❌ Clé Flux manquante";
  try {
    const response = await axios.post(
      'https://api.flux.ai/v1/generate',
      { prompt },
      { headers: { Authorization: `Bearer ${FLUX_KEY}` } }
    );
    return response.data?.url || "❌ Erreur génération";
  } catch (error) {
    return "❌ Erreur API Flux";
  }
}

// === SERVEUR WEB ===
app.get('/', (req, res) => {
  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>${BOT_NAME} - Connexion</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; padding: 20px; display: flex; align-items: center; justify-content: center; }
        .container { max-width: 400px; background: white; border-radius: 15px; padding: 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); text-align: center; }
        h1 { color: #333; margin-bottom: 10px; }
        .subtitle { color: #666; margin-bottom: 20px; }
        .code-box { background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0; border: 2px dashed #667eea; }
        .code { font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 3px; margin: 10px 0; }
        .instructions { background: #e7f3ff; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: left; }
        .step { margin: 10px 0; }
        .copy-btn { background: #28a745; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin-top: 10px; }
        .copy-btn:hover { background: #218838; }
        .status { margin-top: 15px; padding: 10px; border-radius: 5px; }
        .online { background: #d4edda; color: #155724; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔐 ${BOT_NAME}</h1>
        <p class="subtitle">Système de connexion par parrainage</p>
        
        <div class="code-box">
            <h3>VOTRE CODE D'APPAIRAGE :</h3>
            <div class="code" id="sponsorCode">${SPONSOR_CODE}</div>
            <button class="copy-btn" onclick="copyCode()">📋 Cliquez pour copier</button>
        </div>
        
        <div class="instructions">
            <h3>📱 COMMENT SE CONNECTER :</h3>
            <div class="step">1. Ouvrez WhatsApp</div>
            <div class="step">2. Envoyez le code <strong>${SPONSOR_CODE}</strong> au bot</div>
            <div class="step">3. Vous êtes connecté ! 🎉</div>
        </div>
        
        <div class="status ${isReady ? 'online' : ''}">
            Status: ${isReady ? '🟢 Bot en ligne' : '🟡 Connexion en cours...'}
        </div>
        
        <div style="margin-top: 20px; color: #666; font-size: 12px;">
            <p>Code valable pour tous les utilisateurs</p>
        </div>
    </div>

    <script>
        function copyCode() {
            const code = document.getElementById('sponsorCode').textContent;
            navigator.clipboard.writeText(code).then(() => {
                alert('Code copié ! Collez-le dans WhatsApp');
            });
        }
    </script>
</body>
</html>`;
  res.send(html);
});

// === DÉMARRAGE ===
app.listen(PORT, () => {
  console.log('🌐 Serveur sur port ' + PORT);
  initializeBot().catch(console.error);
});

console.log(`
🎯 ${BOT_NAME} - SYSTÈME DE PARRAINAGE SIMPLE
──────────────────────────────
📱 PROCESSUS DE CONNEXION :

1. Utilisateur va sur votre site web
2. Copie le code: ${SPONSOR_CODE}
3. Ouvre WhatsApp et envoie le code au bot
4. Le bot vérifie et valide la connexion
5. Utilisateur connecté ! 🎉

🌐 Interface web: http://localhost:${PORT}
`);
