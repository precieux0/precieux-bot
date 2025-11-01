# Dockerfile for OkitakoyBot (Node.js 18)
FROM node:18

# Create app directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy the rest of the application
COPY . .

# Create backup folder
RUN mkdir -p /app/session-backups

# Expose port for healthcheck
EXPOSE 3000

# Start the bot
CMD ["npm", "start"]
