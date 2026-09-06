# hub -- portable container build, same shape across every isconl engine
# (vault/pulse/scope/circle/spark/hub) on purpose: one Dockerfile pattern
# to maintain, not six bespoke ones. hub is the only one that also serves a
# UI: web/, real HTML/CSS/JS (no build step, no second stage needed)
# ported from the legacy dashboard and wired to hub's own API. This
# replaced the earlier Flutter-web build stage -- Flutter compiled to web
# carried its own CanvasKit runtime and didn't read as a web page; the
# Flutter app itself (app/) is now mobile-only, built separately via
# `flutter build apk`, not part of this image at all.

# node:20-slim (Debian/glibc), not -alpine: @bitwarden/sdk-napi is a native
# N-API module: musl (alpine) breaks native bindings built against glibc.
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY lib ./lib
COPY src ./src
COPY web ./web

# Real fail-closed bind guard already in src/server.js: refuses to bind
# 0.0.0.0 without a configured token. Set HUB_TOKEN (or ISCONL_TOKEN) and
# HUB_BIND=0.0.0.0 at runtime -- not baked into the image. hub is the
# single front door (Decision 003), hence port 8080 while every spoke
# engine runs 8081-8085.
EXPOSE 8080
CMD ["node", "src/server.js"]
