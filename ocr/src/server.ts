// OCR HTTP 服務。獨立容器，不要跟 Discord bot 塞在同一個行程。
// POST /ocr 對齊 `src/llm/ocr.ts`；GET /health 給 Compose 探針。

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { init_engine, models_ready, run_ocr } from "./engine.ts";
import { parse_ocr_request, to_public_line } from "./protocol.ts";

const HOST = process.env.OCR_HOST?.trim() || "0.0.0.0";
const PORT = Number(process.env.OCR_PORT) || 8868;
const MODEL_NAME = process.env.OCR_MODEL?.trim() || "PP-OCRv6-small";
const API_KEY = process.env.OCR_API_KEY?.trim() || "";
const MAX_BODY_BYTES = 10 * 1024 * 1024;

function send_json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function authorised(req: IncomingMessage): boolean {
  if (!API_KEY) {
    return true;
  }
  return req.headers.authorization === `Bearer ${API_KEY}`;
}

function read_body(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error("請求過大"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function handle_ocr(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!authorised(req)) {
    send_json(res, 401, { error: "未授權" });
    return;
  }
  const raw = await read_body(req);
  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString("utf8") || "{}");
  } catch {
    send_json(res, 400, { error: "JSON 無法解析" });
    return;
  }
  const started = performance.now();
  const request = parse_ocr_request(payload);
  const lines = (await run_ocr(request.image)).map(to_public_line);
  send_json(res, 200, {
    model: MODEL_NAME,
    latency_ms: Math.round(performance.now() - started),
    lines,
  });
}

const server = createServer((req, res) => {
  void (async () => {
    const path = req.url?.split("?")[0] ?? "/";
    try {
      if (req.method === "GET" && (path === "/" || path === "/health")) {
        send_json(res, 200, {
          ok: true,
          service: "ocr",
          name: "AIPAR ETA OCR",
          model: MODEL_NAME,
          ready: models_ready(),
        });
        return;
      }
      if (req.method === "POST" && path === "/ocr") {
        await handle_ocr(req, res);
        return;
      }
      send_json(res, 404, { ok: false, error: "找不到路徑" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      send_json(res, 500, { error: message.slice(0, 200) });
    }
  })();
});

await init_engine();
server.listen(PORT, HOST, () => {
  console.log(`[ocr] PP-OCRv6 small 已監聽 host=${HOST} port=${PORT}`);
});
