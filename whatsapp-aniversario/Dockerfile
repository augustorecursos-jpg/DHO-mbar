# Serviço de aniversários no WhatsApp (whatsapp-web.js + Chromium).
FROM node:22-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-noto-color-emoji ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_SKIP_DOWNLOAD=true CHROME_PATH=/usr/bin/chromium NODE_ENV=production DATA_DIR=/data PORT=3001
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
# /data guarda a sessão do WhatsApp: precisa ser um disco permanente, senão será preciso escanear o QR a cada deploy.
VOLUME ["/data"]
EXPOSE 3001
CMD ["node", "server.js"]
