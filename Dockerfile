FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm install --production && npm cache clean --force

# Copy app files
COPY server.js ./
COPY public ./public

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
