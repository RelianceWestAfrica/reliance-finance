# =============================================================================
# Reliance Finance - Next.js production image
# =============================================================================
# Build multi-stage : deps -> builder -> runner. Optimise pour Next.js standalone
# output (~100 MB final image).
# =============================================================================

# ---------- Stage 1 : dependencies (cache layer) ------------------------------
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /repo

# Active pnpm via corepack
RUN corepack enable && corepack prepare pnpm@11.1.0 --activate

# Copie uniquement les manifestes pour profiter du cache Docker
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/database/package.json ./packages/database/
COPY packages/workflow-engine/package.json ./packages/workflow-engine/
COPY packages/config/eslint/package.json ./packages/config/eslint/
COPY packages/config/typescript/package.json ./packages/config/typescript/

RUN pnpm install --frozen-lockfile --prod=false


# ---------- Stage 2 : builder -------------------------------------------------
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@11.1.0 --activate

# Recopie node_modules depuis deps
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /repo/packages ./packages

# Code source
COPY . .

# Active Next standalone output
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm db:generate
RUN pnpm --filter @reliance-finance/web build


# ---------- Stage 3 : runner (image finale) ----------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Utilisateur non-root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copie le standalone output + les assets publics + le client Prisma
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public

# Prisma client (genere dans packages/database/src/generated/client)
COPY --from=builder /repo/packages/database/src/generated ./packages/database/src/generated
COPY --from=builder /repo/packages/database/prisma ./packages/database/prisma

# Le bundle Next.js standalone ne trace pas le binaire natif du Query Engine
# Prisma (charge dynamiquement au runtime). On le copie explicitement a cote
# du serveur standalone + dans les chemins ou Prisma le cherche.
COPY --from=builder /repo/packages/database/src/generated/client/*.so.node ./apps/web/.next/server/
RUN mkdir -p /app/apps/web/.prisma && \
    cp /app/packages/database/src/generated/client/*.so.node /app/apps/web/ 2>/dev/null || true

USER nextjs

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
