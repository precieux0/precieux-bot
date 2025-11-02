# Image de base
FROM node:22-slim

WORKDIR /app

# Installation des dépendances
COPY package*.json ./
RUN npm install

# Copie du projet
COPY . .

# Expose le port 3000
EXPOSE 3000

# Démarre le bot
CMD ["npm", "start"]
