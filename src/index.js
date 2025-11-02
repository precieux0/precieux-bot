/**
 * OkitakoyBot — WhatsApp Bot professionnel (avec IA OpenRouter)
 * Auteur : Précieux Okitakoy
 * Fonctionnalités :
 *  ✅ QR code web
 *  ✅ Keep-alive + reconnexion automatique
 *  ✅ Réponses IA (OpenRouter)
 *  ✅ Sauvegarde automatique
 *  ✅ Commandes : ping, help, summarize, image
 */

const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const QRCode = require("qrcode");
const express = require("express");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const archiver = require("archiver");
const multer = require("multer");
const extract = require("extract-zip");

const app = express();
const upload = multer({ dest: "uploads/" });
app.use(express.json());

// === CONFIGURATION PRINCIPALE ===
const BOT_NAME = "OkitakoyBot";
const WELCOME_TEXT = "Bonjour 👋, je suis *OkitakoyBot*, l’assistant professionnel de Précieux Okitakoy. Tapez *help* pour voir les commandes disponibles.";
const AUTH_DIR = path.resolve("./.wwebjs_auth");
const BACKUP_DIR = path.resolve("./session-backups");
const PORT = process.env.PORT || 3000;

const SHOW_QR_WEB = (process.env.SHOW_QR_WEB || "true").toLowerCase() === "true";
const AUTO_BACKUP = (process.env.AUTO_BACKUP || "true").toLowerCase() === "true";
const EXPORT_TOKEN = process.env.EXPORT_TOKEN || "change_this_token";
const OPENROUTER_KEY = process.env.OPENAI_API_KEY; // Clé OpenRouter
const FLUX_KEY = process.env.FLUXAI_API_KEY;

// === PRÉPARATION DES DOSSIERS ===
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// === INITIALISATION DU CLIENT WHATSAPP ===
const client = new Client({
  authStrategy: new LocalAuth({ clientId: "okitakoy-bot" }),
  puppeteer: { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] },
});

let latestQr = "";
let isReady = false;

// === ÉVÉNEMENTS DU CLIENT ===
client.on("qr", async (qr) => {
  console.log("📱 Nouveau QR Code reçu !");
  qrcode.generate(qr, { small: true });
  try {
    latestQr = await QRCode.toDataURL(qr);
  } catch (err) {
    console.error("Erreur QR:", err);
  }
});

client.on("ready", () => {
  isReady = true;
  console.log(`✅ ${BOT_NAME} est connecté et prêt à répondre !`);
  if (AUTO_BACKUP) autoExportSession();
});

client.on("authenticated", () => console.log("🔐 Authentifié avec succès"));
client.on("auth_failure", (msg) => console.error("❌ Échec d’authentification :", msg));
client.on("disconnected", async (reason) => {
  console.error("⚠️ Déconnexion détectée :", reason);
  isReady = false;
  console.log("🔄 Tentative de reconnexion dans 10 secondes...");
  setTimeout(() => client.initialize(), 10000);
});

// === KEEP ALIVE ===
setInterval(() => {
  axios
    .get(`https://${process.env.RENDER_EXTERNAL_URL || `localhost:${PORT}`}`)
    .then(() => console.log("💓 Keep-alive signal envoyé."))
    .catch(() => {});
}, 600000); // toutes les 10 minutes

// === GESTION DES MESSAGES ===
client.on("message", async (msg) => {
  try {
    const body = msg.body?.trim() || "";
    const lower = body.toLowerCase();

    // Réponses aux commandes
    if (lower === "ping") return msg.reply("pong ✅");

    if (["help", "aide"].includes(lower)) {
      return msg.reply(
        `📘 *Commandes disponibles* :
- *ping* → test du bot
- *summarize: texte* → résume un texte avec IA
- *image: prompt* → génère une image via FluxAI
- Message libre → réponse intelligente automatique 🤖`
      );
    }

    if (lower.startsWith("summarize:")) {
      const text = body.split(":").slice(1).join(":").trim();
      if (!text) return msg.reply("Format attendu : summarize: [ton texte]");
      await msg.reply("✍️ Résumé en cours...");
      const summary = await summarizeWithOpenRouter(text);
      return msg.reply(summary);
    }

    if (lower.startsWith("image:")) {
      const prompt = body.split(":").slice(1).join(":").trim();
      if (!prompt) return msg.reply("Format attendu : image: [ton prompt]");
      await msg.reply("🎨 Génération de l’image...");
      const imgUrl = await generateImageFluxAI(prompt);
      return msg.reply(`🖼️ Image générée : ${imgUrl}`);
    }

    // Si aucun mot-clé => réponse IA automatique
    if (body.length > 0) {
      const aiReply = await generateAIReply(body);
      if (aiReply) await msg.reply(aiReply);
    }
  } catch (err) {
    console.error("Erreur message:", err);
  }
});

// === FONCTIONS IA ===
async function summarizeWithOpenRouter(text) {
  if (!OPENROUTER_KEY) return "❌ Clé OpenRouter manquante.";
  try {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: `Résume ce texte en français professionnellement :\n${text}` }],
      },
      { headers: { Authorization: `Bearer ${OPENROUTER_KEY}`, "Content-Type": "application/json" } }
    );
    return res.data?.choices?.[0]?.message?.content || "Aucun résumé généré.";
  } catch (e) {
    console.error("Erreur résumé:", e.response?.data || e.message);
    return "Erreur lors du résumé.";
  }
}

async function generateAIReply(message) {
  if (!OPENROUTER_KEY) return "Clé OpenRouter manquante.";
  try {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Tu es OkitakoyBot, un assistant professionnel WhatsApp. Réponds toujours en français clair et respectueux, comme un conseiller professionnel.",
          },
          { role: "user", content: message },
        ],
      },
      { headers: { Authorization: `Bearer ${OPENROUTER_KEY}`, "Content-Type": "application/json" } }
    );
    return res.data?.choices?.[0]?.message?.content || "";
  } catch (e) {
    console.error("Erreur OpenRouter:", e.response?.data || e.message);
    return "Je n’ai pas pu répondre à votre message.";
  }
}

async function generateImageFluxAI(prompt) {
  if (!FLUX_KEY) return "❌ Clé FLUXAI_API_KEY manquante.";
  try {
    const res = await axios.post(
      "https://api.flux.ai/v1/generate",
      { prompt },
      { headers: { Authorization: `Bearer ${FLUX_KEY}`, "Content-Type": "application/json" } }
    );
    return res.data?.url || "Aucune image générée.";
  } catch (e) {
    console.error("Erreur FluxAI:", e.response?.data || e.message);
    return "Erreur lors de la génération d'image.";
  }
}

// === SAUVEGARDE AUTOMATIQUE ===
function autoExportSession() {
  if (!fs.existsSync(AUTH_DIR)) return;
  const zipName = `session-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
  const output = fs.createWriteStream(path.join(BACKUP_DIR, zipName));
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(output);
  archive.directory(AUTH_DIR, false);
  archive.finalize();
  output.on("close", () => console.log(`💾 Session sauvegardée automatiquement.`));
}

// === SERVEUR WEB EXPRESS ===
app.get("/", (req, res) => {
  if (SHOW_QR_WEB && latestQr)
    res.send(`<center><h2>${BOT_NAME}</h2><p>Scanne ce QR pour connecter le bot :</p><img src="${latestQr}" width="300"/></center>`);
  else
    res.send(`<center><h2>${BOT_NAME}</h2><p>Bot actif et connecté ✅</p><p>Status : ${isReady ? "🟢 En ligne" : "🔴 En attente de connexion"}</p></center>`);
});

app.get("/qr", (req, res) => {
  if (!latestQr) return res.send("QR non généré...");
  res.send(`<img src="${latestQr}" width="300"/>`);
});

app.listen(PORT, () => console.log(`🌐 Serveur Express lancé sur le port ${PORT}`));

client.initialize();
