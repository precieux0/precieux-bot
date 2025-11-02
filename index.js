/**
 * ===============================================================
 *  OkitakoyBot — WhatsApp Bot Professionnel avec IA (OpenRouter)
 *  Auteur : Précieux Okitakoy
 *  Version : 3.0 Stable Render Edition
 * ===============================================================
 *  ⚙️  Fonctionnalités :
 *   - QR code visible sur page web (Render)
 *   - Sauvegarde automatique de session
 *   - Keep-alive (connexion illimitée)
 *   - Reconnexion automatique en cas de crash
 *   - Journalisation colorée + sauvegarde journalière
 *   - Commandes : ping, help, summarize, image
 *   - Réponses IA automatiques via OpenRouter (GPT-4)
 * ===============================================================
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
const chalk = require("chalk");

const upload = multer({ dest: "uploads/" });
const app = express();
app.use(express.json());

// === Variables principales ===
const BOT_NAME = "OkitakoyBot";
const WELCOME_TEXT =
  "Bonjour, ici OkitakoyBot 🤖 — votre assistant virtuel professionnel. Tapez *help* pour voir les commandes disponibles.";
const AUTH_DIR = path.resolve("./.wwebjs_auth");
const BACKUP_DIR = path.resolve("./session-backups");
const LOG_DIR = path.resolve("./logs");
const EXPORT_TOKEN = process.env.EXPORT_TOKEN || "change_this_token";
const AUTO_BACKUP = (process.env.AUTO_BACKUP || "true").toLowerCase() !== "false";
const SHOW_QR_WEB = (process.env.SHOW_QR_WEB || "false").toLowerCase() === "true";
const OPENROUTER_KEY = process.env.OPENAI_API_KEY;
const FLUX_KEY = process.env.FLUXAI_API_KEY;

// === Préparation des dossiers ===
[BACKUP_DIR, LOG_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// === Logger personnalisé ===
function log(type, msg) {
  const date = new Date();
  const timestamp = date.toISOString().replace("T", " ").split(".")[0];
  let color;
  switch (type) {
    case "INFO":
      color = chalk.green;
      break;
    case "WARN":
      color = chalk.yellow;
      break;
    case "ERROR":
      color = chalk.red;
      break;
    default:
      color = chalk.cyan;
  }
  console.log(color(`[${timestamp}] [${type}] ${msg}`));

  const logFile = path.join(LOG_DIR, `okibot-${date.toISOString().slice(0, 10)}.log`);
  fs.appendFileSync(logFile, `[${timestamp}] [${type}] ${msg}\n`);
}

// === Initialisation du client WhatsApp ===
let client;

function initClient() {
  client = new Client({
    authStrategy: new LocalAuth({ clientId: "okitakoy-bot" }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-extensions", "--disable-gpu"],
    },
  });

  let latestQr = "";

  client.on("qr", async (qr) => {
    log("INFO", "QR code reçu");
    qrcode.generate(qr, { small: true });
    latestQr = await QRCode.toDataURL(qr).catch(() => "");
  });

  client.on("authenticated", () => log("INFO", "✅ Authentifié avec succès"));
  client.on("auth_failure", (msg) => log("ERROR", `❌ Échec d'authentification: ${msg}`));
  client.on("ready", () => {
    log("INFO", `${BOT_NAME} est prêt et connecté ✅`);
    if (AUTO_BACKUP) autoExportSession();
  });

  client.on("disconnected", (reason) => {
    log("WARN", `Déconnecté (${reason}) → tentative de reconnexion...`);
    setTimeout(() => initClient(), 5000);
  });

  // === Gestion des messages ===
  client.on("message", async (msg) => {
    try {
      const body = msg.body?.trim() || "";
      const lower = body.toLowerCase();

      if (lower === "ping") return msg.reply("pong ✅");

      if (["help", "aide"].includes(lower)) {
        return msg.reply(
          `📋 Commandes disponibles :
- *ping* → test du bot
- *summarize: texte* → résume un texte
- *image: prompt* → génère une image
- Toute autre phrase → réponse intelligente IA.`
        );
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

      if (body.length > 0) {
        const reply = await generateAIReply(body);
        if (reply) await msg.reply(reply);
      }
    } catch (err) {
      log("ERROR", `Erreur message: ${err.message}`);
    }
  });

  // === Keep-alive constant ===
  setInterval(() => {
    log("INFO", "💓 Ping keep-alive pour maintenir la session ouverte.");
    client.getChats().catch(() => {});
  }, 1000 * 60 * 5); // toutes les 5 minutes

  // === Serveur Express (QR code + keep-alive web) ===
  app.get("/", (req, res) => {
    if (SHOW_QR_WEB && latestQr) {
      res.send(`<center><h2>${BOT_NAME}</h2><p>Scannez ce QR :</p><img src="${latestQr}" width="300"/></center>`);
    } else {
      res.send(`${BOT_NAME} en ligne ✅`);
    }
  });

  app.get("/qr", (req, res) => {
    if (!latestQr) return res.send("QR non généré...");
    res.send(`<img src="${latestQr}" width="300"/>`);
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => log("INFO", `🌐 Serveur web lancé sur le port ${port}`));

  client.initialize();
}

// === Fonctions auxiliaires ===
async function summarizeWithOpenRouter(text) {
  if (!OPENROUTER_KEY) return "❌ Clé OpenRouter manquante.";
  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: `Résume ce texte en français de manière concise:\n\n${text}` }],
        max_tokens: 300,
      },
      { headers: { Authorization: `Bearer ${OPENROUTER_KEY}`, "Content-Type": "application/json" } }
    );
    return response.data?.choices?.[0]?.message?.content || "Aucun résumé reçu.";
  } catch (e) {
    log("ERROR", `Erreur OpenRouter: ${e.message}`);
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
              "Tu es OkitakoyBot, un assistant WhatsApp professionnel, poli et utile. Réponds clairement en français formel.",
          },
          { role: "user", content: message },
        ],
      },
      { headers: { Authorization: `Bearer ${OPENROUTER_KEY}`, "Content-Type": "application/json" } }
    );
    return response.data?.choices?.[0]?.message?.content || "";
  } catch (e) {
    log("ERROR", `Erreur IA: ${e.message}`);
    return "Je n’ai pas pu traiter votre message.";
  }
}

async function generateImageFluxAI(prompt) {
  if (!FLUX_KEY) throw new Error("FLUXAI_API_KEY manquante");
  const resp = await axios.post(
    "https://api.flux.ai/v1/generate",
    { prompt },
    { headers: { Authorization: `Bearer ${FLUX_KEY}`, "Content-Type": "application/json" } }
  );
  return resp.data?.url || "https://example.com/image-placeholder.png";
}

function autoExportSession() {
  if (!fs.existsSync(AUTH_DIR)) return;
  const zipName = `session-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
  const outputPath = path.join(BACKUP_DIR, zipName);
  const output = fs.createWriteStream(outputPath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(output);
  archive.directory(AUTH_DIR, false);
  archive.finalize();
  output.on("close", () => log("INFO", `💾 Session sauvegardée : ${outputPath}`));
}

// === Démarrage du bot ===
initClient();
