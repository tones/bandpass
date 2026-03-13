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

# serverExternalPackages need to be copied into standalone
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder /app/node_modules/bindings ./node_modules/bindings
COPY --from=builder /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path
COPY --from=builder /app/node_modules/prebuild-install ./node_modules/prebuild-install
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

RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
