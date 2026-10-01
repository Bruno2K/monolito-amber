# syntax=docker/dockerfile:1
# Local RC image for @amber/web. Not a cloud deploy artifact.
# Rewrites /api to the compose service `api` (API_INTERNAL_URL).
FROM node:22-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY web/package.json web/tsconfig.json web/
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY packages/shared ./packages/shared
COPY web ./web
ENV API_INTERNAL_URL=http://api:3001
ENV NEXT_PUBLIC_API_URL=http://localhost:3001
RUN pnpm --filter @amber/shared build && pnpm --filter @amber/web build

FROM node:22-bookworm-slim
WORKDIR /repo
ENV NODE_ENV=production
ENV PORT=3000
ENV API_INTERNAL_URL=http://api:3001
ENV NEXT_PUBLIC_API_URL=http://localhost:3001
RUN corepack enable
COPY --from=build /repo /repo
EXPOSE 3000
CMD ["pnpm", "--filter", "@amber/web", "start"]
