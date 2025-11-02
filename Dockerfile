# ================================
# 🧩 Étape 1 : Utilisation d'une image Node stable
# ================================
FROM node:22.16.0

# ================================
# 📁 Étape 2 : Création du dossier de travail
# ================================
WORKDIR /app

# ================================
# 📦 Étape 3 : Copie des fichiers nécessaires
# ================================
COPY package*.json ./

# ================================
# ⚙️ Étape 4 : Installation des dépendances
# ================================
RUN npm install --production

# ================================
# 📂 Étape 5 : Copie du code source
# ================================
COPY . .

# ================================
# 🔐 Étape 6 : Préparation du dossier de session
# ================================
RUN mkdir -p session-backups
RUN touch session-backups/.gitkeep

# ================================
# 🛠️ Étape 7 : Variables d'environnement (optionnelles)
# ================================
ENV NODE_ENV=production
ENV PORT=3000

# ================================
# 🌍 Étape 8 : Exposition du port
# ================================
EXPOSE 3000

# ================================
# 🔁 Étape 9 : Lancement automatique + Keep Alive
# ================================
CMD [ "npm", "start" ]
