# Dockerfile pour OkitakoyBot — WhatsApp IA professionnelle
FROM node:18

# Créer le répertoire de l’application
WORKDIR /app

# Copier les fichiers package et installer les dépendances
COPY package*.json ./
RUN npm install --production

# Copier tout le reste du projet
COPY . .

# Créer le dossier de sauvegarde des sessions
RUN mkdir -p /app/session-backups

# Exposer le port utilisé par Express
EXPOSE 3000

# Démarrer le bot
CMD ["npm", "start"]
