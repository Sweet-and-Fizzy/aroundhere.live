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

# Production stage - unified image with Playwright for web app and scraping
FROM mcr.microsoft.com/playwright:v1.57.0-noble AS production

WORKDIR /app

# Install tsx for running TypeScript scrapers directly
RUN npm install -g tsx

# Install only Chromium (not all browsers)
RUN npx playwright install chromium

# Copy built application and dependencies
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/server ./server
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/tsconfig.json ./

# Set environment
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

# Default command runs the web app
CMD ["node", ".output/server/index.mjs"]
