# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

FROM base AS builder
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/motor ./apps/motor
COPY packages ./packages
RUN pnpm install --frozen-lockfile --filter @vega-hogar/motor...
RUN pnpm -r --filter "@vega-hogar/motor..." build

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/package.json /app/tsconfig.base.json ./
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/motor/src ./apps/motor/src
COPY --from=builder /app/apps/motor/tsconfig.json ./apps/motor/
COPY --from=builder /app/apps/motor/package.json ./apps/motor/

RUN pnpm install --frozen-lockfile --filter @vega-hogar/motor... --prod

RUN chown -R app:app /app
USER app
WORKDIR /app/apps/motor
EXPOSE 3010
CMD ["./node_modules/.bin/tsx", "src/index.ts"]
