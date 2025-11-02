# Étape 1 : Image de base Node.js
FROM node:20-slim

# Étape 2 : Variables d'environnement
ENV NODE_ENV=production \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    SHOW_QR_WEB=true \
    AUTO_BACKUP=true

# Étape 3 : Installation des dépendances système
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-common \
    chromium-driver \
    fonts-liberation \
    libatk-bridge2.0-0 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    wget \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Étape 4 : Dossier de travail
WORKDIR /app

# Étape 5 : Copie des fichiers
COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Étape 6 : Port exposé
EXPOSE 3000

# Étape 7 : Démarrage
CMD ["node", "index.js"]
