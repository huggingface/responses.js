# ---- Build Stage ----
FROM node:18-alpine AS builder

# Install pnpm as root
RUN corepack enable && corepack prepare pnpm@10.10.0 --activate

USER node
ENV HOME=/home/node \
    PATH=/home/node/.local/bin:$PATH

WORKDIR $HOME/app

# Install dependencies and build
COPY --chown=node package.json pnpm-lock.yaml* ./
COPY --chown=node tsconfig.json ./
COPY --chown=node src ./src
RUN pnpm install --frozen-lockfile
RUN pnpm run build
RUN chown -R node:node $HOME/app

# ---- Production Stage ----
FROM node:18-alpine AS runner

# No need to install pnpm here, just switch to node user
USER node
ENV HOME=/home/node \
    PATH=/home/node/.local/bin:$PATH

# Create app directory
WORKDIR $HOME/app

# Copy only necessary files from builder
COPY --chown=node --from=builder /home/node/app/dist ./dist
COPY --chown=node --from=builder /home/node/app/package.json ./
COPY --chown=node --from=builder /home/node/app/node_modules ./node_modules

# Use a non-root user for security
EXPOSE 3000

CMD ["node", "dist/index.js"]
