/**
 * OkitakoyBot — WhatsApp bot avec backup automatique + QR visible sur Render
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

// --- constantes principales ---
const BOT_NAME = "OkitakoyBot";
const WELCOME_TEXT =
  "Salut 👋 je suis *OkitakoyBot* 🤖 — le bot personnel de *Précieux Okitakoy* !\n\nTape *help* pour voir mes commandes.";
const AUTH_DIR = path.resolve("./.wwebjs_auth");
const BACKUP_DIR = path.resolve("./session-backups");
const EXPORT_TOKEN = process.env.EXPORT_TOKEN || "change_this_token";
const AUTO_BACKUP = (process.env.AUTO_BACKUP || "true").toLowerCase() !== "false";
const SHOW_QR_WEB = (process.env.SHOW_QR_WEB || "false").toLowerCase() === "true";

// --- créer dossier de backup si manquant ---
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// --- initialisation du client WhatsApp ---
const client = new Client({
  authStrategy: new LocalAuth({ clientId: "okitakoy-bot" }),
  puppeteer: { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] },
});

let latestQr = "";

// --- QR code ---
client.on("qr", async (qr) => {
  console.log("--- QR reçu ---");
  qrcode.generate(qr, { small: true });
  console.log("Scanne le QR dans les logs ou sur /qr");
  try {
    latestQr = await QRCode.toDataURL(qr);
  } catch (err) {
    console.error("Erreur QR:", err);
  }
});

// --- événements WhatsApp ---
client.on("authenticated", () => console.log("✅ Authentifié avec succès"));
client.on("auth_failure", (msg) => console.error("❌ Authentification échouée:", msg));
client.on("disconnected", (reason) => console.log("🔌 Déconnecté:", reason));

client.on("ready", () => {
  console.log(`✅ ${BOT_NAME} prêt et connecté à WhatsApp !`);
  if (AUTO_BACKUP) {
    try {
      autoExportSession();
    } catch (e) {
      console.error("Erreur auto export:", e);
    }
  }
});

// --- gestion des messages ---
const SEEN_FILE = path.resolve("./seen.json");
let seen = {};
try {
  if (fs.existsSync(SEEN_FILE)) seen = JSON.parse(fs.readFileSync(SEEN_FILE));
} catch (e) {
  console.error("Erreur lecture seen.json", e);
  seen = {};
}

client.on("message", async (msg) => {
  try {
    const body = (msg.body || "").trim();
    const lower = body.toLowerCase();
    const chatId = msg.from || "unknown";

    if (!seen[chatId]) {
      await msg.reply(WELCOME_TEXT);
      seen[chatId] = true;
      fs.writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2));
    }

    if (lower === "ping") return msg.reply("pong 🏓");

    if (["help", "aide"].includes(lower)) {
      return msg.reply(
        `📜 *Commandes disponibles:*\n\n` +
        `• *ping* → Test de réponse\n` +
        `• *summarize:* <texte> → Résume un texte\n` +
        `• *image:* <prompt> → Génère une image (FluxAI)\n\n` +
        `Bot maintenu par *Précieux Okitakoy* ✨`
      );
    }

    if (lower.startsWith("summarize:") || lower.startsWith("résume:") || lower.startsWith("resumer:")) {
      const text = body.split(":").slice(1).join(":").trim();
      if (!text) return msg.reply("Envoie: summarize: [ton texte]");
      await msg.reply("⏳ Je résume...");
      const summary = await summarizeWithOpenRouter(text);
      return msg.reply(summary);
    }

    if (lower.startsWith("image:")) {
      const prompt = body.split(":").slice(1).join(":").trim();
      if (!prompt) return msg.reply("Envoie: image: [ton prompt]");
      await msg.reply("🎨 Génération d'image en cours...");
      try {
        const imgUrl = await generateImageFluxAI(prompt);
        return msg.reply(`🖼️ Image générée:\n${imgUrl}`);
      } catch (e) {
        console.error(e);
        return msg.reply("❌ Erreur lors de la génération d'image.");
      }
    }

    if (lower.includes("bonjour") || lower.includes("salut")) {
      return msg.reply("Salut 👋 Tape *help* pour la liste des commandes.");
    }
  } catch (err) {
    console.error("Erreur message:", err);
  }
});

// ---------- FONCTIONS API ----------

// 🔹 OpenRouter pour résumer
async function summarizeWithOpenRouter(text) {
  const key = process.env.OPENAI_API_KEY; // ta clé OpenRouter
  if (!key) return "❌ Aucune clé API OpenRouter configurée.";
  try {
    const resp = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: `Fais un résumé court en français:\n\n${text}` }],
        max_tokens: 300,
      },
      { headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } }
    );
    return resp.data?.choices?.[0]?.message?.content || "⚠️ Aucun résumé reçu.";
  } catch (e) {
    console.error("OpenRouter error:", e.response?.data || e.message);
    return "❌ Erreur lors de la requête OpenRouter.";
  }
}

// 🔹 FluxAI pour générer une image
async function generateImageFluxAI(prompt) {
  const key = process.env.FLUXAI_API_KEY;
  if (!key) throw new Error("FLUXAI_API_KEY manquant");
  const resp = await axios.post(
    "https://api.flux.ai/v1/generate",
    { prompt },
    { headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } }
  );
  return resp.data?.url || "https://example.com/image-placeholder.png";
}

// ---------- BACKUP AUTOMATIQUE ----------
function autoExportSession() {
  if (!fs.existsSync(AUTH_DIR)) return console.log("Aucune session à sauvegarder.");
  const zipName = `session-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
  const outputPath = path.join(BACKUP_DIR, zipName);
  const output = fs.createWriteStream(outputPath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (err) => { throw err; });
  archive.pipe(output);
  archive.directory(AUTH_DIR, false);
  archive.finalize();
  output.on("close", () => console.log(`💾 Session exportée → ${outputPath}`));
}

// ---------- SERVEUR WEB ----------
app.get("/", (req, res) => {
  if (SHOW_QR_WEB && latestQr) {
    res.send(`<center><h2>${BOT_NAME}</h2><p>📱 Scanne ce QR pour connecter le bot :</p><img src="${latestQr}" width="300"/></center>`);
  } else {
    res.send(`${BOT_NAME} en ligne ✅<br/>Auto backup: ${AUTO_BACKUP}<br/>QR visible: ${SHOW_QR_WEB}`);
  }
});

app.get("/qr", (req, res) => {
  if (!latestQr) return res.send("QR non encore généré...");
  res.send(`<img src="${latestQr}" width="300"/>`);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🌍 Serveur web actif sur le port ${port}`));

client.initialize();
