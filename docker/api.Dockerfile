# syntax=docker/dockerfile:1
# Local RC image for @amber/api. Not a cloud deploy artifact.
FROM node:22-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY api/package.json api/tsconfig.json api/tsconfig.build.json api/nest-cli.json api/
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
COPY packages/shared ./packages/shared
COPY api ./api
RUN pnpm --filter @amber/shared build \
  && pnpm prisma:generate \
  && pnpm --filter @amber/api build

FROM node:22-bookworm-slim
WORKDIR /repo
ENV NODE_ENV=production
ENV PORT=3001
ARG GIT_SHA=dev
ARG BUILD_ID=local
ENV GIT_SHA=$GIT_SHA
ENV BUILD_ID=$BUILD_ID
RUN corepack enable
COPY --from=build /repo /repo
EXPOSE 3001
CMD ["node", "api/dist/main.js"]
