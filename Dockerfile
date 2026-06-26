# ─────────────────────────────────────────────────────────────────────────────
# HTTP Forge CLI — Slim Docker image
#
# Build:
#   docker build -t http-forge-cli .
#
# Run (mount your workspace):
#   docker run --rm \
#     -v "$PWD:/workspace" \
#     http-forge-cli \
#     run-suite --suite smoke-tests --reporter junit --out results/junit.xml --exit-code
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: install only production dependencies ─────────────────────────────
FROM node:20-alpine AS installer

WORKDIR /app

# Copy package manifests first to leverage layer caching
COPY package.json package-lock.json* ./

RUN npm ci --omit=dev

# ── Stage 2: slim runtime image ───────────────────────────────────────────────
FROM node:20-alpine

# Security: run as a non-root user
RUN addgroup -S forge && adduser -S forge -G forge

WORKDIR /app

# Copy production node_modules from installer
COPY --from=installer /app/node_modules ./node_modules

# Copy the compiled CLI
COPY dist/ ./dist/
COPY package.json ./

# Expose the CLI binary globally so callers can use `http-forge` directly
RUN npm link --ignore-scripts 2>/dev/null || true

USER forge

# Default working directory that callers mount their workspace into
WORKDIR /workspace

ENTRYPOINT ["http-forge"]
CMD ["--help"]
