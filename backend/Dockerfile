# syntax=docker/dockerfile:1

# Phase 7.4 — production-shaped Nest image (HTML portal + JSON API + assets).
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/web/public ./dist/web/public
COPY --from=build /app/src/web/views ./dist/web/views
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Migrate runs as a discrete pre-deploy step (see .github/workflows/ci.yml) —
# not inside the app container start, so a bad migration cannot strand a
# half-started task without an explicit ops decision.
CMD ["node", "dist/main.js"]
