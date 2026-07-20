# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL
COPY package*.json ./
# vendored local package (@flowdesk/chat-v2, file:./vendor/...) must exist before install
COPY vendor ./vendor
RUN npm install --prefer-offline
COPY . .
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
# nginx:alpine processes *.template files in /etc/nginx/templates/ via envsubst at startup
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
# Default API URL (overridden via ACA env var NGINX_API_URL at runtime)
ENV NGINX_API_URL=http://localhost:3010
EXPOSE 80
