# ═══════════════════════════════════════════════════════════════
# UN ProjectAdvisor API — Multi-stage Dockerfile
# ═══════════════════════════════════════════════════════════════

# Build context: repo root (required for cross-module imports from indexing-pipeline/)
#   docker build -f api/Dockerfile -t unpa-api .

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
# Build tools needed for native modules (msnodesqlv8)
RUN apk add --no-cache python3 make g++ unixodbc-dev
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev && \
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
COPY --chown=appuser:appgroup --from=deps /prod_modules ./node_modules

# Copy API application code
COPY --chown=appuser:appgroup api/ .

# Copy shared processors from indexing-pipeline (cross-module dependency)
COPY --chown=appuser:appgroup indexing-pipeline/src/processors/ /indexing-pipeline/src/processors/

# Remove dev files
RUN rm -rf tests coverage .env.example jest.config.js tsconfig.json

USER appuser

# Environment
ENV NODE_ENV=production \
    PORT=3000 \
    NODE_PATH=/app/node_modules

EXPOSE 3000

# Use tini as PID 1
ENTRYPOINT ["/sbin/tini", "--"]

CMD ["node", "index.js"]
