FROM node:22-slim

WORKDIR /app

# Устанавливаем зависимости для сборки
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Копируем файлы зависимостей
COPY package.json ./

# Устанавливаем все зависимости (включая dev для tsx)
RUN npm install

# Копируем исходный код
COPY src ./src
COPY tsconfig.json ./
# Provider config baked in (pull-only deploy has no host bind-mount)
COPY config ./config

# Компилируем TypeScript
RUN npm run build

# Переменные окружения по умолчанию
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV SYNC_INTERVAL_MS=300000

# Директории для данных
VOLUME ["/app/knowledge", "/app/artifacts"]

# Запускаем воркер
CMD ["node", "dist/worker/index.js"]
