# ═══════════════════════════════════════════════════════════════
# UN ProjectAdvisor API — Multi-stage Dockerfile
# ═══════════════════════════════════════════════════════════════

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production && \
    cp -R node_modules /prod_modules && \
    npm ci

# Stage 2: Production image
FROM node:20-alpine AS production

# Install tini for proper signal handling
RUN apk add --no-cache tini curl

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

WORKDIR /app

# Copy production dependencies
COPY --from=deps /prod_modules ./node_modules

# Copy application code
COPY . .

# Remove dev files
RUN rm -rf tests coverage .env.example jest.config.js tsconfig.json

# Set ownership
RUN chown -R appuser:appgroup /app

USER appuser

# Environment
ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node scripts/docker-healthcheck.js || exit 1

# Use tini as PID 1
ENTRYPOINT ["/sbin/tini", "--"]

CMD ["node", "index.js"]
