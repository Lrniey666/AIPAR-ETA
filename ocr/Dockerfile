# OCR sidecar：PP-OCRv6 small（CPU ONNX），不要跟 bot 塞同一個映像。
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
ENV ONNXRUNTIME_NODE_INSTALL=skip
RUN npm ci --omit=dev

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    TZ=Asia/Taipei \
    OCR_HOST=0.0.0.0 \
    OCR_PORT=8868 \
    ONNXRUNTIME_NODE_INSTALL=skip
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY models ./models
USER node
EXPOSE 8868
CMD ["node", "src/server.ts"]
