/**
 * OkitakoyBot — WhatsApp bot professionnel avec IA (OpenRouter)
 * Auteur : Précieux Okitakoy
 * Fonctions :
 *  - QR code visible sur page web
 *  - Sauvegarde automatique de session
 *  - Réponses IA (GPT-4 via OpenRouter)
 *  - Commandes: ping, help, summarize, image
 */

const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const QRCode = require("qrcode");
const express = require("express");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const multer = require("multer");
const extract = require("extract-zip");
const axios = require("axios");

const upload = multer({ dest: "uploads/" });
const app = express();
app.use(express.json());

// === Variables principales ===
const BOT_NAME = "OkitakoyBot";
const WELCOME_TEXT = "Bonjour, ici OkitakoyBot 🤖 — votre assistant virtuel professionnel. Tapez *help* pour voir les commandes disponibles.";
const AUTH_DIR = path.resolve("./.wwebjs_auth");
const BACKUP_DIR = path.resolve("./session-backups");
const EXPORT_TOKEN = process.env.EXPORT_TOKEN || "change_this_token";
const AUTO_BACKUP = (process.env.AUTO_BACKUP || "true").toLowerCase() !== "false";
const SHOW_QR_WEB = (process.env.SHOW_QR_WEB || "false").toLowerCase() === "true";
const OPENROUTER_KEY = process.env.OPENAI_API_KEY; // clé OpenRouter
const FLUX_KEY = process.env.FLUXAI_API_KEY;

// === Préparation des dossiers ===
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// === Initialisation du client WhatsApp ===
const client = new Client({
  authStrategy: new LocalAuth({ clientId: "okitakoy-bot" }),
  puppeteer: { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] },
});

let latestQr = "";

// === QR Code ===
client.on("qr", async (qr) => {
  console.log("--- QR reçu ---");
  qrcode.generate(qr, { small: true });
  try {
    latestQr = await QRCode.toDataURL(qr);
  } catch (err) {
    console.error("Erreur QR", err);
  }
});

client.on("authenticated", () => console.log("✅ Authentifié avec succès"));
client.on("auth_failure", (msg) => console.error("❌ Échec d'authentification", msg));
client.on("disconnected", (reason) => console.log("🔌 Déconnecté :", reason));

client.on("ready", () => {
  console.log(`${BOT_NAME} est prêt ✅`);
  if (AUTO_BACKUP) {
    try {
      autoExportSession();
    } catch (e) {
      console.error("Erreur de sauvegarde automatique", e);
    }
  }
});

// === Gestion des messages ===
client.on("message", async (msg) => {
  try {
    const body = msg.body?.trim() || "";
    const lower = body.toLowerCase();
    const chatId = msg.from;

    // Commande de base
    if (lower === "ping") return msg.reply("pong");
    if (["help", "aide"].includes(lower)) {
      return msg.reply(`📋 Commandes disponibles :
- *ping* → test du bot
- *summarize: texte* → résume un texte
- *image: prompt* → génère une image (si FLUXAI_API_KEY configurée)
- *anything else* → le bot répond avec intelligence professionnelle.`);
    }

    if (lower.startsWith("summarize:")) {
      const text = body.split(":").slice(1).join(":").trim();
      if (!text) return msg.reply("Format : summarize: [ton texte]");
      await msg.reply("⏳ Résumé en cours...");
      const summary = await summarizeWithOpenRouter(text);
      return msg.reply(summary);
    }

    if (lower.startsWith("image:")) {
      const prompt = body.split(":").slice(1).join(":").trim();
      if (!prompt) return msg.reply("Format : image: [ton prompt]");
      await msg.reply("🖼️ Génération d'image...");
      try {
        const imgUrl = await generateImageFluxAI(prompt);
        return msg.reply(`Image générée : ${imgUrl}`);
      } catch {
        return msg.reply("Erreur lors de la génération d'image.");
      }
    }

    // 🤖 Réponse automatique IA à tous les autres messages
    if (body.length > 0) {
      const reply = await generateAIReply(body);
      if (reply) await msg.reply(reply);
    }
  } catch (err) {
    console.error("Erreur message:", err);
  }
});

// === Fonctions IA ===
async function summarizeWithOpenRouter(text) {
  if (!OPENROUTER_KEY) return "❌ Clé OpenRouter manquante.";
  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: `Résume ce texte en français de manière concise et professionnelle:\n\n${text}` }],
        max_tokens: 300,
      },
      { headers: { Authorization: `Bearer ${OPENROUTER_KEY}`, "Content-Type": "application/json" } }
    );
    return response.data?.choices?.[0]?.message?.content || "Aucun résumé reçu.";
  } catch (e) {
    console.error("Erreur OpenRouter:", e.response?.data || e.message);
    return "Erreur lors du résumé.";
  }
}

async function generateAIReply(message) {
  if (!OPENROUTER_KEY) return "Clé OpenRouter non configurée.";
  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Tu es OkitakoyBot, un assistant WhatsApp professionnel, poli, précis et utile. Réponds de manière claire, en français formel.",
          },
          { role: "user", content: message },
        ],
      },
      { headers: { Authorization: `Bearer ${OPENROUTER_KEY}`, "Content-Type": "application/json" } }
    );
    return response.data?.choices?.[0]?.message?.content || "";
  } catch (e) {
    console.error("Erreur OpenRouter:", e.response?.data || e.message);
    return "Je n’ai pas pu traiter votre message.";
  }
}

// === Génération image (FluxAI) ===
async function generateImageFluxAI(prompt) {
  if (!FLUX_KEY) throw new Error("FLUXAI_API_KEY manquante");
  const resp = await axios.post(
    "https://api.flux.ai/v1/generate",
    { prompt },
    { headers: { Authorization: `Bearer ${FLUX_KEY}`, "Content-Type": "application/json" } }
  );
  return resp.data?.url || "https://example.com/image-placeholder.png";
}

// === Sauvegarde automatique ===
function autoExportSession() {
  if (!fs.existsSync(AUTH_DIR)) return;
  const zipName = `session-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
  const outputPath = path.join(BACKUP_DIR, zipName);
  const output = fs.createWriteStream(outputPath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(output);
  archive.directory(AUTH_DIR, false);
  archive.finalize();
  output.on("close", () => console.log(`💾 Session sauvegardée : ${outputPath}`));
}

// === Serveur Express ===
app.get("/", (req, res) => {
  if (SHOW_QR_WEB && latestQr)
    res.send(`<center><h2>${BOT_NAME}</h2><p>Scanne ce QR :</p><img src="${latestQr}" width="300"/></center>`);
  else res.send(`${BOT_NAME} actif ✅`);
});

app.get("/qr", (req, res) => {
  if (!latestQr) return res.send("QR non généré...");
  res.send(`<img src="${latestQr}" width="300"/>`);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🌐 Serveur web lancé sur le port ${port}`));

client.initialize();
