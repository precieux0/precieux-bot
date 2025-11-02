# Dockerfile optimisé pour precieux-bot (WhatsApp + OpenRouter)
FROM node:18

# Définir le répertoire de travail
WORKDIR /app

# Copier et installer les dépendances
COPY package*.json ./
RUN npm install --production

# Copier le reste du projet
COPY . .

# Créer un dossier pour les sessions (évite les crashs)
RUN mkdir -p /app/session-backups

# Exposer le port (Render en a besoin)
EXPOSE 3000

# Démarrage du bot
CMD ["npm", "start"]
