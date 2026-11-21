FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY . .
RUN mkdir -p /data
ENV DB_PATH=/data/app.db
EXPOSE 3000
CMD ["node", "server.js"]
