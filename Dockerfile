# Dockerfile for OkitakoyBot with Chromium deps
FROM node:18-slim

# Install system dependencies required by Chromium / Puppeteer
RUN apt-get update && apt-get install -y \
  ca-certificates \
  fonts-liberation \
  libasound2 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libc6 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libexpat1 \
  libfontconfig1 \
  libgcc1 \
  libgconf-2-4 \
  libgdk-pixbuf2.0-0 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnss3 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  wget \
  unzip \
  --no-install-recommends && \
  rm -rf /var/lib/apt/lists/*

# Install Chromium (the package name may vary by distro; chromium is available here)
RUN apt-get update && apt-get install -y chromium --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package.json and package-lock (if present) first for caching
COPY package*.json ./

# Install node deps
RUN npm install --production

# Copy app source
COPY . .

# Set Puppeteer executable to system chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PORT=3000

# Ensure backup dir exists
RUN mkdir -p /app/session-backups

EXPOSE 3000
CMD ["npm", "start"]
