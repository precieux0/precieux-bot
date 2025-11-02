/**
 * OkitakoyBot — WhatsApp Bot IA permanent
 * Auteur : Précieux Okitakoy
 * Version : Cloud Backup Render
 */

import express from "express";
import axios from "axios";
import chalk from "chalk";
import qrcode from "qrcode-terminal";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import archiver from "archiver";
import unzipper from "unzipper";
import { fileURLToPath } from "url";
import { Client, LocalAuth } from "whatsapp-web.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// === CONFIG ===
const BOT_NAME = "OkitakoyBot";
const AUTH_DIR = path.resolve("./.wwebjs_auth");
const BACKUP_FILE = path.resolve("./session-backups/session.zip");
const PORT = process.env.PORT || 3000;
const SELF_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
const OPENROUTER_KEY = process.env.OPENAI_API_KEY;
const FLUX_KEY = process.env.FLUXAI_API_KEY;

// === CRÉATION DES DOSSIERS ===
fs.mkdirSync(path.dirname(BACKUP_FILE), { recursive: true });

// === INITIALISATION ===
let client;
let latestQr = "";

async function startClient() {
  console.log(chalk.cyan("🚀 Démarrage d’OkitakoyBot..."));

  // ✅ Restaure la session avant d’initier le client
  await importBackup();

  client = new Client({
    authStrategy: new LocalAuth({ clientId: "okitakoy-bot" }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });

  client.on("qr", async (qr) => {
    console.log(chalk.yellow("📱 QR code reçu : scannez-le pour connecter le bot"));
    qrcode.generate(qr, { small: true });
    latestQr = await QRCode.toDataURL(qr);
  });

  client.on("ready", () => {
    console.log(chalk.green(`✅ ${BOT_NAME} connecté et prêt à l’emploi`));
    exportBackup();
  });

  client.on("disconnected", (reason) => {
    console.log(chalk.red(`⚠️ Déconnecté (${reason}) — reconnexion automatique...`));
    setTimeout(startClient, 5000);
  });

  client.on("message", async (msg) => {
    const text = msg.body?.trim() || "";
    const lower = text.toLowerCase();

    if (lower === "ping") return msg.reply("pong 🏓");

    if (["help", "aide"].includes(lower)) {
      return msg.reply(`📋 *Commandes :*
- *ping* → test
- *summarize: texte* → résumé IA
- *image: prompt* → image IA
- *help* → cette aide`);
    }

    if (lower.startsWith("summarize:")) {
      const content = text.split(":").slice(1).join(":").trim();
      if (!content) return msg.reply("❗ Format : summarize: ton texte");
      await msg.reply("⏳ Résumé en cours...");
      const result = await summarizeText(content);
      return msg.reply(result);
    }

    if (lower.startsWith("image:")) {
      const prompt = text.split(":").slice(1).join(":").trim();
      if (!prompt) return msg.reply("❗ Format : image: ton prompt");
      await msg.reply("🎨 Génération en cours...");
      const imageUrl = await generateImage(prompt);
      return msg.reply(`🖼️ Image générée : ${imageUrl}`);
    }

    const reply = await generateAIReply(text);
    if (reply) await msg.reply(reply);
  });

  client.initialize();
}

// === IA ===
async function summarizeText(txt) {
  if (!OPENROUTER_KEY) return "❌ Clé OpenRouter manquante.";
  try {
    const r = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: `Résume ceci : ${txt}` }],
      },
      { headers: { Authorization: `Bearer ${OPENROUTER_KEY}` } }
    );
    return r.data?.choices?.[0]?.message?.content || "Résumé indisponible.";
  } catch {
    return "Erreur lors du résumé.";
  }
}

async function generateAIReply(msg) {
  if (!OPENROUTER_KEY) return;
  try {
    const r = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Tu es OkitakoyBot, assistant professionnel francophone, poli, précis et amical.",
          },
          { role: "user", content: msg },
        ],
      },
      { headers: { Authorization: `Bearer ${OPENROUTER_KEY}` } }
    );
    return r.data?.choices?.[0]?.message?.content;
  } catch {
    return "Erreur IA.";
  }
}

async function generateImage(prompt) {
  if (!FLUX_KEY) return "⚠️ Clé FLUXAI_API_KEY manquante.";
  const res = await axios.post(
    "https://api.flux.ai/v1/generate",
    { prompt },
    { headers: { Authorization: `Bearer ${FLUX_KEY}` } }
  );
  return res.data?.url || "https://via.placeholder.com/512?text=Erreur";
}

// === SAUVEGARDE / RESTAURATION SESSION ===
function exportBackup() {
  if (!fs.existsSync(AUTH_DIR)) return;
  const output = fs.createWriteStream(BACKUP_FILE);
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(output);
  archive.directory(AUTH_DIR, false);
  archive.finalize();
  output.on("close", () => console.log(chalk.gray("💾 Session sauvegardée.")));
}

async function importBackup() {
  if (!fs.existsSync(BACKUP_FILE)) {
    console.log(chalk.gray("Aucune sauvegarde trouvée, démarrage normal."));
    return;
  }
  console.log(chalk.gray("🔁 Restauration de la session sauvegardée..."));
  await fs
    .createReadStream(BACKUP_FILE)
    .pipe(unzipper.Extract({ path: AUTH_DIR }))
    .promise();
  console.log(chalk.gray("✅ Session restaurée."));
}

// === SERVEUR EXPRESS ===
app.get("/", (_, res) => res.send(`<h3>${BOT_NAME} est actif ✅</h3>`));
app.get("/qr", (_, res) =>
  res.send(latestQr ? `<img src="${latestQr}" width="300"/>` : "QR non disponible")
);

app.listen(PORT, () =>
  console.log(chalk.green(`🌍 Serveur en ligne sur le port ${PORT}`))
);

// === KEEP ALIVE Render ===
setInterval(async () => {
  try {
    await axios.get(SELF_URL);
    console.log(chalk.blue("🔁 Keep-Alive actif"));
  } catch {
    console.log(chalk.red("⚠️ Keep-Alive : ping échoué"));
  }
}, 4 * 60 * 1000);

// === DÉMARRAGE ===
startClient();
