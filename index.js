/**
 * OkitakoyBot — WhatsApp bot complet (Render)
 * Compatible OpenRouter (texte + image + résumé + génération + backup auto)
 * Auteur : Précieux Okitakoy
 */

const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
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

const BOT_NAME = "OkitakoyBot";
const WELCOME_TEXT =
  "Salut 👋, je suis OkitakoyBot 🤖 — le bot personnel de *Précieux Okitakoy*! Tape *help* pour voir ce que je peux faire.";
const AUTH_DIR = path.resolve("./.wwebjs_auth");
const BACKUP_DIR = path.resolve("./session-backups");
const EXPORT_TOKEN = process.env.EXPORT_TOKEN || "change_this_token";
const AUTO_BACKUP = (process.env.AUTO_BACKUP || "true").toLowerCase() !== "false";
const SHOW_QR_WEB = (process.env.SHOW_QR_WEB || "false").toLowerCase() === "true";

// --- créer le dossier de backup si manquant ---
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// --- initialisation du client WhatsApp ---
const client = new Client({
  authStrategy: new LocalAuth({ clientId: "okitakoy-bot" }),
  puppeteer: { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] },
});

// --- variable QR ---
let latestQr = "";

// --- gestion du QR ---
client.on("qr", async (qr) => {
  console.log("--- QR RECEIVED ---");
  qrcode.generate(qr, { small: true });
  try {
    latestQr = await QRCode.toDataURL(qr);
  } catch (err) {
    console.error("QR generation error", err);
  }
});

// --- authentification ---
client.on("authenticated", () => console.log("✅ AUTHENTICATED"));
client.on("auth_failure", (msg) => console.error("❌ AUTH FAILURE", msg));
client.on("disconnected", (reason) => console.log("🔌 DISCONNECTED", reason));

client.on("ready", () => {
  console.log(`${BOT_NAME} prêt ✅`);
  if (AUTO_BACKUP) {
    try {
      autoExportSession();
    } catch (e) {
      console.error("Auto export session error", e);
    }
  }
});

// --- gestion des messages ---
const SEEN_FILE = path.resolve("./seen.json");
let seen = {};
try {
  if (fs.existsSync(SEEN_FILE)) seen = JSON.parse(fs.readFileSync(SEEN_FILE));
} catch {
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

    // Commande de base
    if (lower === "ping") return msg.reply("pong 🏓");

    if (["help", "aide"].includes(lower)) {
      return msg.reply(
        `📘 *Commandes disponibles:*\n\n` +
          `- ping → Vérifie la connexion\n` +
          `- summarize: [texte] → Résume un texte\n` +
          `- image: [prompt] → Génère une image\n` +
          `- analyze: [photo ou lien] → Analyse et décrit une image\n\n` +
          `Bot maintenu par *Précieux Okitakoy*.`
      );
    }

    // Résumé de texte
    if (lower.startsWith("summarize:") || lower.startsWith("résume:") || lower.startsWith("resumer:")) {
      const text = body.split(":").slice(1).join(":").trim();
      if (!text) return msg.reply("Envoie: summarize: [ton texte]");
      await msg.reply("🧠 Je résume ton texte...");
      const summary = await summarizeWithOpenRouter(text);
      return msg.reply(summary);
    }

    // Génération d'image avec FluxAI
    if (lower.startsWith("image:")) {
      const prompt = body.split(":").slice(1).join(":").trim();
      if (!prompt) return msg.reply("Envoie: image: [ton prompt]");
      await msg.reply("🎨 Génération d'image en cours...");
      try {
        const imgUrl = await generateImageFluxAI(prompt);
        return msg.reply(`🖼️ Image générée:\n${imgUrl}`);
      } catch (e) {
        console.error(e);
        return msg.reply("Erreur lors de la génération d'image.");
      }
    }

    // Analyse d'image
    if (lower.startsWith("analyze:") || msg.hasMedia) {
      await msg.reply("🔍 Analyse de l'image en cours...");
      let imageUrl;

      if (msg.hasMedia) {
        const media = await msg.downloadMedia();
        if (!media || !media.data) return msg.reply("Impossible de lire cette image.");
        const filePath = `./uploads/${Date.now()}.jpg`;
        fs.writeFileSync(filePath, Buffer.from(media.data, "base64"));
        const base64data = media.data;
        const result = await analyzeImageWithOpenRouter(base64data);
        fs.unlinkSync(filePath);
        return msg.reply(result);
      } else {
        const prompt = body.split(":").slice(1).join(":").trim();
        if (!prompt.startsWith("http")) return msg.reply("Envoie une image ou un lien vers une image !");
        const result = await analyzeImageWithOpenRouter(prompt);
        return msg.reply(result);
      }
    }

    if (lower.includes("bonjour") || lower.includes("salut")) {
      return msg.reply("Salut 👋! Tape *help* pour voir mes commandes.");
    }
  } catch (err) {
    console.error("message handler error", err);
  }
});

// ---------- Fonctions OpenRouter ----------
async function summarizeWithOpenRouter(text) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return "❌ Clé OpenRouter manquante.";
  try {
    const resp = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Tu es un assistant qui résume les textes clairement en français." },
          { role: "user", content: text },
        ],
        max_tokens: 400,
      },
      { headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } }
    );
    return resp.data?.choices?.[0]?.message?.content || "Aucun résumé reçu.";
  } catch (e) {
    console.error("OpenRouter error", e.response?.data || e.message);
    return "Erreur lors de la requête OpenRouter.";
  }
}

async function analyzeImageWithOpenRouter(image) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return "Clé OpenRouter manquante.";
  try {
    const messages = [
      {
        role: "system",
        content:
          "Tu es un expert en analyse d’images. Décris l’image en détail (objets, ambiance, contexte) puis donne un résumé rapide à la fin.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Décris cette image en détail et résume-la brièvement à la fin." },
          typeof image === "string" && image.startsWith("http")
            ? { type: "image_url", image_url: image }
            : { type: "image_base64", image_base64: image },
        ],
      },
    ];

    const resp = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      { model: "gpt-4o", messages },
      { headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } }
    );
    return resp.data?.choices?.[0]?.message?.content || "Aucune description trouvée.";
  } catch (e) {
    console.error("Erreur OpenRouter:", e.response?.data || e.message);
    return "Erreur lors de l’analyse d’image.";
  }
}

// ---------- Génération d'image (FluxAI) ----------
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

// ---------- Sauvegarde automatique ----------
function autoExportSession() {
  if (!fs.existsSync(AUTH_DIR)) return console.log("Aucune session à sauvegarder.");
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const zipName = `session-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
  const outputPath = path.join(BACKUP_DIR, zipName);
  const output = fs.createWriteStream(outputPath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (err) => {
    throw err;
  });
  archive.pipe(output);
  archive.directory(AUTH_DIR, false);
  archive.finalize();
  output.on("close", () => console.log(`Session exportée automatiquement → ${outputPath}`));
}

// ---------- Serveur web ----------
app.get("/", (req, res) => {
  if (SHOW_QR_WEB && latestQr) {
    res.send(`<center><h2>${BOT_NAME}</h2><p>Scanne ce QR pour connecter le bot :</p><img src="${latestQr}" width="300"/></center>`);
  } else {
    res.send(`${BOT_NAME} en ligne ✅`);
  }
});

app.get("/qr", (req, res) => {
  if (!latestQr) return res.send("QR non encore généré...");
  res.send(`<img src="${latestQr}" width="300"/>`);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🌐 Serveur web actif sur le port ${port}`));

client.initialize();
