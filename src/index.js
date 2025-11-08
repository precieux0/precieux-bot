/**
 * OkitakoyBot — Système de parrainage par numéro
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

// === SYSTÈME DE PARRAINAGE ===
const pendingConnections = new Map();
const CODE_EXPIRY = 10 * 60 * 1000;

function generateSponsorCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

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
      
      if (text.length === 6 && /^[A-Z0-9]{6}$/.test(text)) {
        const connection = pendingConnections.get(text);
        if (connection && Date.now() < connection.expiry) {
          pendingConnections.delete(text);
          await sock.sendMessage(from, { 
            text: `✅ *CONNEXION RÉUSSIE!*\n\nBienvenue ${connection.phone}!\n\nTapez *help* pour voir les commandes disponibles. 🤖` 
          });
          return;
        } else {
          await sock.sendMessage(from, { 
            text: '❌ Code invalide ou expiré. Obtenez un nouveau code sur notre site web.' 
          });
          return;
        }
      }
      
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
          `• Obtenez votre code sur notre site web\n` +
          `• Envoyez le code de 6 caractères ici\n\n` +
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
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/generate-code', (req, res) => {
  const { phone } = req.body;
  
  if (!phone) {
    return res.json({ success: false, error: 'Numéro requis' });
  }
  
  const now = Date.now();
  for (const [code, data] of pendingConnections.entries()) {
    if (now > data.expiry) pendingConnections.delete(code);
  }
  
  const sponsorCode = generateSponsorCode();
  const expiry = Date.now() + CODE_EXPIRY;
  
  pendingConnections.set(sponsorCode, {
    phone: phone,
    expiry: expiry,
    timestamp: new Date().toLocaleString()
  });
  
  console.log(`🔐 Nouveau code généré pour ${phone}: ${sponsorCode}`);
  
  res.json({
    success: true,
    code: sponsorCode,
    expiry: new Date(expiry).toLocaleTimeString(),
    instructions: `Envoyez "${sponsorCode}" sur WhatsApp pour vous connecter`
  });
});

app.get('/admin/codes', (req, res) => {
  const activeCodes = [];
  const now = Date.now();
  
  for (const [code, data] of pendingConnections.entries()) {
    if (now < data.expiry) {
      activeCodes.push({ code, ...data });
    }
  }
  
  res.json({ activeCodes });
});

// === CRÉATION DU FICHIER HTML ===
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <title>${BOT_NAME} - Connexion</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; padding: 20px; }
        .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 15px; padding: 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
        h1 { text-align: center; color: #333; margin-bottom: 10px; }
        .subtitle { text-align: center; color: #666; margin-bottom: 30px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 8px; font-weight: bold; color: #333; }
        input { width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px; font-size: 16px; transition: border-color 0.3s; }
        input:focus { border-color: #667eea; outline: none; }
        button { width: 100%; padding: 12px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; transition: transform 0.2s; }
        button:hover { transform: translateY(-2px); }
        button:disabled { background: #ccc; cursor: not-allowed; transform: none; }
        .result { margin-top: 20px; padding: 15px; border-radius: 8px; text-align: center; display: none; }
        .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .code { font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 15px 0; color: #667eea; }
        .instructions { background: #e7f3ff; padding: 15px; border-radius: 8px; margin: 15px 0; }
        .step { margin: 10px 0; padding-left: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔐 ${BOT_NAME}</h1>
        <p class="subtitle">Système de connexion par parrainage</p>
        
        <div class="form-group">
            <label for="phone">Votre numéro de téléphone :</label>
            <input type="tel" id="phone" placeholder="Ex: +229 12345678" required>
        </div>
        
        <button onclick="generateCode()">Générer mon code de connexion</button>
        
        <div id="result" class="result"></div>
        
        <div class="instructions">
            <h3>📱 Comment se connecter :</h3>
            <div class="step">1. Entrez votre numéro ci-dessus</div>
            <div class="step">2. Recevez votre code de parrainage</div>
            <div class="step">3. Ouvrez WhatsApp et envoyez le code au bot</div>
            <div class="step">4. Vous êtes connecté ! 🎉</div>
        </div>
        
        <div style="text-align: center; margin-top: 20px; color: #666; font-size: 14px;">
            <p>Le code est valable 10 minutes</p>
        </div>
    </div>

    <script>
        async function generateCode() {
            const phone = document.getElementById('phone').value;
            const button = document.querySelector('button');
            const result = document.getElementById('result');
            
            if (!phone) {
                showResult('Veuillez entrer votre numéro', 'error');
                return;
            }
            
            button.disabled = true;
            button.textContent = 'Génération en cours...';
            
            try {
                const response = await fetch('/generate-code', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showResult(\\`<h3>✅ Code généré avec succès !</h3>
                        <div class="code">\\${data.code}</div>
                        <p><strong>Expire à:</strong> \\${data.expiry}</p>
                        <div style="background: #fff3cd; padding: 10px; border-radius: 5px; margin: 10px 0;">
                            <strong>Instructions:</strong><br>
                            \\${data.instructions}
                        </div>\\`, 'success');
                } else {
                    showResult('❌ ' + data.error, 'error');
                }
            } catch (error) {
                showResult('❌ Erreur de connexion', 'error');
            }
            
            button.disabled = false;
            button.textContent = 'Générer mon code de connexion';
        }
        
        function showResult(message, type) {
            const result = document.getElementById('result');
            result.innerHTML = message;
            result.className = 'result ' + type;
            result.style.display = 'block';
        }
    </script>
</body>
</html>`;

fs.writeFileSync(path.join(publicDir, 'index.html'), htmlContent);

// === DÉMARRAGE ===
app.listen(PORT, () => {
  console.log(\`🌐 Serveur sur port \\${PORT}\`);
  initializeBot().catch(console.error);
});

console.log(\`
🎯 \\${BOT_NAME} - SYSTÈME DE PARRAINAGE
──────────────────────────────
📱 PROCESSUS DE CONNEXION :

1. Utilisateur entre son numéro sur le site
2. Reçoit un code de 6 caractères
3. Ouvre WhatsApp et envoie le code au bot
4. Le bot vérifie et valide la connexion
5. Utilisateur connecté ! 🎉

🌐 Interface web: http://localhost:\\${PORT}
\`);
