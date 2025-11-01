# OkitakoyBot — WhatsApp bot (Render)

**IMPORTANT:** Ceci est une intégration **non-officielle** utilisant `whatsapp-web.js`. Son usage peut violer les Conditions d'Utilisation de WhatsApp et entraîner la suspension du compte. Utilise-le à tes risques.

## Détails
- **Nom du bot:** OkitakoyBot (Précieux Okitakoy)
- **Fonctions incluses:** réponses automatiques, welcome message, résumé via OpenAI (optionnel), génération d'images via FluxAI (optionnel), export/import session, sauvegarde automatique de la session.
- **Auto backup:** activé par défaut (tu peux désactiver en réglant `AUTO_BACKUP=false` sur Render)

## Fichiers importants
- `index.js` — code principal
- `Dockerfile` — pour déployer en container
- `package.json` — dépendances
- `/session-backups` — dossier où les backups automatiques sont stockés
- `seen.json` — historique local des chats déjà salués

## Installation & déploiement (rapide)
1. Mets les fichiers dans un repo Git (ou uploade sur Render).  
2. Crée un Web Service sur Render (ou utilise Dockerfile).  
3. Build command: `npm install`  Start command: `npm start`  
4. Défini les variables d'environnement sur Render:
   - `EXPORT_TOKEN` (obligatoire, secret fort)
   - `OPENAI_API_KEY` (optionnel)
   - `FLUXAI_API_KEY` (optionnel)
   - `AUTO_BACKUP` (optionnel; par défaut activé)
5. Déploie. Ouvre les logs : un **QR** s'affichera la première fois — scanne-le avec le téléphone du numéro que tu veux transformer en bot (ex: +243894697490).

## Export automatique de session
- Dès que le bot est **ready**, il crée automatiquement un fichier zip dans `/session-backups/` (nom horodaté). Télécharge-le via l'interface Render (ou via SSH si tu utilises un serveur).
- Tu peux aussi télécharger via l'endpoint sécurisé `/export-session?token=TON_SECRET`.

## Importer une session
- POST `/import-session` avec `session=@session.zip` et header `x-export-token: TON_SECRET`.
- Exemple curl:
  ```bash
  curl -X POST -H "x-export-token: TON_SECRET" -F "session=@session-export.zip" https://ton-service.onrender.com/import-session
  ```

## Sécurité
- Les fichiers de session contiennent des jetons sensibles. Ne les partage pas.
- Ne commets pas les backups dans Git.

## Limitations et recommandations
- Render Free peut mettre l'instance en veille -> vérifie les logs et backups.
- Ce bot est pour usage perso / prototype. Pour un usage pro et conforme, utilise WhatsApp Cloud API.

## Besoin d'aide?
Si tu veux que j'ajoute:
- un script qui télécharge automatiquement le dernier backup vers Google Drive,
- une interface web simple pour uploader/importer la session,
- ou le repo webhook officiel pour WhatsApp Cloud API (sans QR),
dis-le moi.
