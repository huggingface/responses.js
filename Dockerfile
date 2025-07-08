# ---- Build Stage ----
FROM node:18-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.10.0 --activate

WORKDIR /app

# Install dependencies and build
COPY package.json pnpm-lock.yaml* ./
COPY tsconfig.json ./
COPY src ./src
RUN pnpm install --frozen-lockfile
RUN pnpm run build

# ---- Production Stage ----
FROM node:18-alpine AS runner

# Create app directory
WORKDIR /app

# Copy only necessary files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# Use a non-root user for security
RUN adduser -D appuser
USER appuser

EXPOSE 3000

CMD ["node", "dist/index.js"]
