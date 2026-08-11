# hub -- portable container build, same shape across every isconl engine
# (vault/pulse/scope/circle/spark/hub) on purpose: one Dockerfile pattern
# to maintain, not six bespoke ones. hub is the only one with a second
# stage: it's the only engine that also serves a UI (the Flutter web
# console), and that needs a real Flutter SDK to build -- the Dart SDK
# alone (via a plain node/debian base) can't run `flutter build web`.
#
# Same shape Render's own build now uses (see the isconl service's
# buildCommand) -- this stage exists so `docker build .`/docker-compose
# produce the identical console without needing Render at all.
FROM ghcr.io/cirruslabs/flutter:stable AS webbuild
WORKDIR /app
COPY app/pubspec.yaml app/pubspec.lock ./
RUN flutter pub get
COPY app/ .
RUN flutter build web --release

# node:20-slim (Debian/glibc), not -alpine: @bitwarden/sdk-napi is a native
# N-API module: musl (alpine) breaks native bindings built against glibc.
FROM node:20-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY lib ./lib
COPY src ./src
COPY --from=webbuild /app/build/web ./app/build/web

# Real fail-closed bind guard already in src/server.js: refuses to bind
# 0.0.0.0 without a configured token. Set HUB_TOKEN (or ISCONL_TOKEN) and
# HUB_BIND=0.0.0.0 at runtime -- not baked into the image. hub is the
# single front door (Decision 003), hence port 8080 while every spoke
# engine runs 8081-8085.
EXPOSE 8080
CMD ["node", "src/server.js"]
