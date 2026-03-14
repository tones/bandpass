FROM node:22-alpine AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV SESSION_SECRET=build-time-placeholder-not-used-at-runtime
RUN npm run build

FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Standalone audio worker process (compiled by esbuild during build)
COPY --from=builder --chown=nextjs:nodejs /app/worker/main.js ./worker/main.js

# Database migrations
COPY --from=builder --chown=nextjs:nodejs /app/lib/db/migrations ./lib/db/migrations
# serverExternalPackages need to be copied into standalone
COPY --from=builder /app/node_modules/pg ./node_modules/pg
COPY --from=builder /app/node_modules/pg-types ./node_modules/pg-types
COPY --from=builder /app/node_modules/pg-pool ./node_modules/pg-pool
COPY --from=builder /app/node_modules/pg-protocol ./node_modules/pg-protocol
COPY --from=builder /app/node_modules/pg-connection-string ./node_modules/pg-connection-string
COPY --from=builder /app/node_modules/pg-int8 ./node_modules/pg-int8
COPY --from=builder /app/node_modules/pgpass ./node_modules/pgpass
COPY --from=builder /app/node_modules/postgres-array ./node_modules/postgres-array
COPY --from=builder /app/node_modules/postgres-bytea ./node_modules/postgres-bytea
COPY --from=builder /app/node_modules/postgres-date ./node_modules/postgres-date
COPY --from=builder /app/node_modules/postgres-interval ./node_modules/postgres-interval
COPY --from=builder /app/node_modules/split2 ./node_modules/split2
COPY --from=builder /app/node_modules/essentia.js ./node_modules/essentia.js
COPY --from=builder /app/node_modules/audio-decode ./node_modules/audio-decode
COPY --from=builder /app/node_modules/@wasm-audio-decoders ./node_modules/@wasm-audio-decoders
COPY --from=builder /app/node_modules/@eshaz ./node_modules/@eshaz
COPY --from=builder /app/node_modules/mpg123-decoder ./node_modules/mpg123-decoder
COPY --from=builder /app/node_modules/ogg-opus-decoder ./node_modules/ogg-opus-decoder
COPY --from=builder /app/node_modules/opus-decoder ./node_modules/opus-decoder
COPY --from=builder /app/node_modules/codec-parser ./node_modules/codec-parser
COPY --from=builder /app/node_modules/simple-yenc ./node_modules/simple-yenc
COPY --from=builder /app/node_modules/@thi.ng ./node_modules/@thi.ng
COPY --from=builder /app/node_modules/audio-buffer ./node_modules/audio-buffer
COPY --from=builder /app/node_modules/audio-type ./node_modules/audio-type
COPY --from=builder /app/node_modules/node-wav ./node_modules/node-wav
COPY --from=builder /app/node_modules/qoa-format ./node_modules/qoa-format

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
