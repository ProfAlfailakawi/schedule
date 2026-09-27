FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
# قراءة المسح تشغّل نحو 11 عاملاً (خيوط Tesseract WASM)، ولكل خيط في glibc ساحة
# ذاكرة خاصة لا تعود إلى النظام؛ على خادم 4 GiB أُوقف الخادم لنفاد الذاكرة وهو
# يقرأ ملفاً واضحاً (سجلات 2026-09-26). ساحتان تكفيان وتُبقيان الذروة أدنى، مجاناً.
ENV MALLOC_ARENA_MAX=2

COPY --from=build /app /app

EXPOSE 3000

CMD ["node", "dist/server.cjs"]
