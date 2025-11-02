# ---- Étape 1 : base Node.js ----
FROM node:18

# Créer le répertoire de travail
WORKDIR /app

# Copier les fichiers de configuration
COPY package*.json ./

# Installer uniquement les dépendances nécessaires à la production
RUN npm install --production

# Copier le reste du code
COPY . .

# Créer le dossier pour les sauvegardes
RUN mkdir -p /app/session-backups

# Exposer le port pour le serveur Express (Render s’en sert)
EXPOSE 3000

# Empêcher Render de couper le processus en gardant le bot actif
ENV NODE_ENV=production
ENV SHOW_QR_WEB=true
ENV AUTO_BACKUP=true

# Commande de démarrage
CMD ["npm", "start"]
