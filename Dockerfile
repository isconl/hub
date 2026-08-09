# hub -- portable container build, same shape across every isconl engine
# (vault/pulse/scope/circle/spark/hub) on purpose: one Dockerfile pattern
# to maintain, not six bespoke ones.
#
# node:20-slim (Debian/glibc), not -alpine: @bitwarden/sdk-napi is a native
# N-API module: musl (alpine) breaks native bindings built against glibc.
FROM node:20-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY lib ./lib
COPY src ./src

# Real fail-closed bind guard already in src/server.js: refuses to bind
# 0.0.0.0 without a configured token. Set HUB_TOKEN (or ISCONL_TOKEN) and
# HUB_BIND=0.0.0.0 at runtime -- not baked into the image. hub is the
# single front door (Decision 003), hence port 8080 while every spoke
# engine runs 8081-8085.
EXPOSE 8080
CMD ["node", "src/server.js"]
