# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Install dependencies for Prisma and building native modules
RUN apt-get update && apt-get install -y \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first for layer caching
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source and build
COPY . .
RUN npm run build

# Production stage - Web app
FROM node:20-slim AS production

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    openssl \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nuxt

# Copy Prisma schema, generated client, and CLI for migrations
COPY --from=builder --chown=nuxt:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nuxt:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nuxt:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nuxt:nodejs /app/node_modules/prisma ./node_modules/prisma

# Copy built application
COPY --from=builder --chown=nuxt:nodejs /app/.output ./.output
COPY --from=builder --chown=nuxt:nodejs /app/package*.json ./

# Set environment
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

USER nuxt

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]

# Scraper stage - for running scrapers with Playwright
FROM mcr.microsoft.com/playwright:v1.48.0-noble AS scraper

WORKDIR /app

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/server ./server
COPY --from=builder /app/tsconfig.json ./

# Install tsx for running TypeScript directly
RUN npm install -g tsx

# Install playwright browsers
RUN npx playwright install chromium

ENV NODE_ENV=production

# Default command runs all scrapers
CMD ["tsx", "server/scrapers/runner.ts"]
