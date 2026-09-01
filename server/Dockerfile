# Build context is the REPOSITORY ROOT (see /railway.json):
#   docker build -f server/Dockerfile -t maru-sync .
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY server/tsconfig.json server/tsconfig.build.json ./
COPY server/src ./src
COPY server/scripts ./scripts
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY server/package.json server/package-lock.json ./
COPY server/migrations ./migrations
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
USER node
EXPOSE 8787
CMD ["node", "dist/src/index.js"]
