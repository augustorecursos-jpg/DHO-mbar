# Serviço de aniversários no WhatsApp (Baileys: conexão direta, sem navegador).
FROM node:22-slim
ENV NODE_ENV=production DATA_DIR=/data PORT=3001
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
# /data guarda o login do WhatsApp: precisa ser um disco permanente, senão será preciso escanear o QR a cada deploy.
VOLUME ["/data"]
EXPOSE 3001
CMD ["node", "server.js"]
