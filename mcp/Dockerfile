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
# Public HTTP(S) variant (:80 ACME + redirect, :443 SPA + /api proxy). Swapped in
# by the entrypoint hook below ONLY when /etc/nginx/ssl holds a certificate, so
# the same image still starts on hosts without one.
COPY nginx.public-tls.conf.template /etc/nginx/templates/public-tls.conf.template
COPY docker-entrypoint.d/05-enable-tls-template.sh /docker-entrypoint.d/05-enable-tls-template.sh
RUN chmod +x /docker-entrypoint.d/05-enable-tls-template.sh
# Default API URL (overridden via ACA env var NGINX_API_URL at runtime)
ENV NGINX_API_URL=http://localhost:3010
# SERVER_NAME is referenced by the TLS template; "_" = match any host.
ENV SERVER_NAME=_
EXPOSE 80 443
