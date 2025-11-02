/**
 * OkitakoyBot — WhatsApp bot prototype with automatic session backups
 * Affiche le QR code sur une page web (Render) si SHOW_QR_WEB = true
 */

const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const QRCode = require("qrcode"); // <-- ajout important
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
  "Salut, je suis OkitakoyBot 🤖 — le bot personnel de Précieux Okitakoy ! Tape *help* pour voir ce que je peux faire.";
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
  console.log("Scan le QR dans les logs (Render) ou sur /qr");
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
  console.log(`${BOT_NAME} prêt !`);
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
} catch (e) {
  console.error("Error reading seen.json", e);
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

    if (lower === "ping") return msg.reply("pong");

    if (["help", "aide"].includes(lower)) {
      return msg.reply(
        `Bonjour! Commandes disponibles:\n- ping\n- help\n- summarize: <texte>\n- image: <prompt>\nBot maintenu par Précieux Okitakoy.`
      );
    }

    if (lower.startsWith("summarize:") || lower.startsWith("résume:") || lower.startsWith("resumer:")) {
      const text = body.split(":").slice(1).join(":").trim();
      if (!text) return msg.reply("Envoie: summarize: [ton texte]");
      await msg.reply("Je résume...");
      const summary = await summarizeWithOpenAI(text);
      return msg.reply(summary);
    }

    if (lower.startsWith("image:")) {
      const prompt = body.split(":").slice(1).join(":").trim();
      if (!prompt) return msg.reply("Envoie: image: [ton prompt]");
      await msg.reply("Génération d'image en cours...");
      try {
        const imgUrl = await generateImageFluxAI(prompt);
        return msg.reply(`Image générée: ${imgUrl}`);
      } catch (e) {
        console.error(e);
        return msg.reply("Erreur lors de la génération d'image.");
      }
    }

    if (lower.includes("bonjour") || lower.includes("salut")) {
      return msg.reply('Salut! Tape "help" pour la liste des commandes.');
    }
  } catch (err) {
    console.error("message handler error", err);
  }
});

// ---------- Fonctions auxiliaires ----------
async function summarizeWithOpenAI(text) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return "OpenAI API key non configurée.";
  try {
    const resp = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: `Fais un résumé court en français:\n\n${text}` }],
        max_tokens: 300,
      },
      { headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } }
    );
    return resp.data?.choices?.[0]?.message?.content || "Aucun résumé reçu.";
  } catch (e) {
    console.error("OpenAI error", e.response?.data || e.message);
    return "Erreur lors de la requête OpenAI.";
  }
}

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

// ---------- Endpoints Web ----------
app.get("/", (req, res) => {
  if (SHOW_QR_WEB && latestQr) {
    res.send(`<center><h2>${BOT_NAME}</h2><p>Scanne ce QR pour connecter le bot :</p><img src="${latestQr}" width="300"/></center>`);
  } else {
    res.send(`${BOT_NAME} running. Auto backup: ${AUTO_BACKUP}`);
  }
});

app.get("/qr", (req, res) => {
  if (!latestQr) return res.send("QR non encore généré...");
  res.send(`<img src="${latestQr}" width="300"/>`);
});

app.get("/export-session", (req, res) => {
  const token = req.query.token || req.headers["x-export-token"];
  if (token !== EXPORT_TOKEN) return res.status(401).send("Unauthorized");
  if (!fs.existsSync(AUTH_DIR)) return res.status(404).send("No session data found");
  const zipName = `session-export-${Date.now()}.zip`;
  res.setHeader("Content-Disposition", `attachment; filename=${zipName}`);
  res.setHeader("Content-Type", "application/zip");
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (err) => {
    throw err;
  });
  archive.pipe(res);
  archive.directory(AUTH_DIR, false);
  archive.finalize();
});

app.post("/import-session", upload.single("session"), async (req, res) => {
  const token = req.query.token || req.headers["x-export-token"];
  if (token !== EXPORT_TOKEN) return res.status(401).send("Unauthorized");
  if (!req.file) return res.status(400).send("No file uploaded");
  const zipPath = req.file.path;
  try {
    if (fs.existsSync(AUTH_DIR)) fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    await extract(zipPath, { dir: path.resolve("./") });
    fs.unlinkSync(zipPath);
    res.send("Session imported. Restart service if needed.");
  } catch (e) {
    console.error("Import error", e);
    res.status(500).send("Import failed");
  }
});

// ---------- Lancer le serveur ----------
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`✅ Serveur web actif sur le port ${port}`));

client.initialize();
