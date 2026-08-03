# The build context is the REPOSITORY ROOT, not mcp/.
# The SPA imports @guided-ux/tour, which vite.config.js aliases to
# ../packages/guided-ux — a path an mcp-only context cannot reach, so the image
# could not be built from a clean checkout at all. Every caller must therefore
# pass `context: .` together with `file: mcp/Dockerfile`.

# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app/mcp
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL
COPY mcp/package*.json ./
# vendored local packages (@flowdesk/chat-v2, @flowdesk/voice-launcher —
# file:./vendor/...) must exist before install
COPY mcp/vendor ./vendor
RUN npm install --prefer-offline
# the aliased package lives outside mcp/ — hence the repo-root context
COPY packages /app/packages
COPY mcp .
# The SPA bundles to a single ~8.6 MB chunk and rollup exhausts node's default
# heap inside a container ("Ineffective mark-compacts near heap limit"). This is
# a ceiling, not a reservation, so it is safe on smaller build machines too.
ENV NODE_OPTIONS=--max-old-space-size=8192
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine
COPY --from=builder /app/mcp/dist /usr/share/nginx/html
# nginx:alpine processes *.template files in /etc/nginx/templates/ via envsubst at startup
COPY mcp/nginx.conf.template /etc/nginx/templates/default.conf.template
# Public HTTP(S) variant (:80 ACME + redirect, :443 SPA + /api proxy). Swapped in
# by the entrypoint hook below ONLY when /etc/nginx/ssl holds a certificate, so
# the same image still starts on hosts without one.
COPY mcp/nginx.public-tls.conf.template /etc/nginx/public-tls.conf.template
COPY mcp/docker-entrypoint.d/05-enable-tls-template.sh /docker-entrypoint.d/05-enable-tls-template.sh
RUN chmod +x /docker-entrypoint.d/05-enable-tls-template.sh
# Default API URL (overridden via ACA env var NGINX_API_URL at runtime)
ENV NGINX_API_URL=http://localhost:3010
# SERVER_NAME is referenced by the TLS template; "_" = match any host.
ENV SERVER_NAME=_
# Must exist even when empty. envsubst only replaces variables that are SET, and
# an unsubstituted ${FLOWDESK_PROXY_API_KEY} reaches nginx as a $-variable
# reference — "unknown variable" — so the frontend would not start at all on a
# deployment that does not enforce the proxy key.
ENV FLOWDESK_PROXY_API_KEY=
EXPOSE 80 443
