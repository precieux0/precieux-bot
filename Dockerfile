# ==============================================================
#  OkitakoyBot — Dockerfile stable pour Node.js 18+
#  Inclut : dépendances, session persistante, keep-alive
# ==============================================================
FROM node:18-slim

# Crée le dossier de l'application
WORKDIR /app

# Copie des fichiers nécessaires
COPY package*.json ./

# Installation des dépendances
RUN npm install --production

# Copie du reste du projet
COPY . .

# Création des dossiers nécessaires
RUN mkdir -p /app/session-backups /app/logs

# Expose le port web pour Render ou healthcheck
EXPOSE 3000

# Garde le conteneur toujours actif avec un healthcheck
HEALTHCHECK --interval=1m --timeout=10s \
  CMD node -e "require('http').get('http://localhost:3000', res => res.statusCode === 200 || process.exit(1));"

# Démarrage du bot
CMD ["npm", "start"]
