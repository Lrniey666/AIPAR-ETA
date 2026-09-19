// 檢查每一家 LLM 供應商現在打不打得通：`npm run llm:check`。
//
// 為什麼需要這支：免費層的模型 ID 會下架改名，「.env 填了」不等於「打得到」。
// 每家只送一次極短的請求，把延遲與錯誤原因印出來，不要在上線後才靠使用者回報。
// iAI 為校內免費層，有金鑰就會打到。LLM_ALLOW_METERED 只擋標成計費的供應商。

import { deflateSync } from "node:zlib";

import { LlmGateway } from "../llm/gateway.ts";
import { load_providers } from "../llm/providers.ts";
import { set_log_level } from "../shared/logger.ts";
import { format_datetime } from "../shared/time.ts";

set_log_level(process.env.LOG_LEVEL?.trim() || "error");

const registry = load_providers();
const gateway = new LlmGateway(registry);

console.log(`LLM 供應商連線檢查　${format_datetime()}`);

if (registry.skipped.length > 0) {
  console.log("\n略過：");
  for (const skipped of registry.skipped) {
    console.log(`  · ${skipped.key}：${skipped.reason}`);
  }
}

async function probe(mode: "text" | "vision"): Promise<void> {
  const providers = mode === "text" ? registry.text : registry.vision;
  console.log(`\n${mode === "text" ? "文字" : "視覺"}供應商（${providers.length} 家）：`);

  for (const provider of providers) {
    const model = mode === "text" ? provider.model : provider.vision_model;
    const started = performance.now();
    try {
      const result = await gateway.complete({
        task: `check-${mode}`,
        mode,
        only: [provider.key],
        messages:
          mode === "text"
            ? [{ role: "user", content: "只回答一個字：好" }]
            : [
                {
                  role: "user",
                  content: [
                    { type: "text", text: "這張圖是什麼顏色？只回顏色名稱。" },
                    { type: "image_url", image_url: { url: RED_SQUARE } },
                  ],
                },
              ],
        max_tokens: 256,
      });
      const reply = result.text.trim().replace(/\s+/g, " ").slice(0, 40) || "（空回覆）";
      console.log(`  ✓ ${provider.key.padEnd(8)} ${model.padEnd(28)} ${Math.round(result.latency_ms)}ms  ${reply}`);
    } catch (error) {
      const detail = (error instanceof Error ? error.message : String(error)).slice(0, 160);
      console.log(`  ✗ ${provider.key.padEnd(8)} ${model.padEnd(28)} ${Math.round(performance.now() - started)}ms  ${detail}`);
    }
  }
}

// 64×64 純紅 PNG。探針刻意不用 16×16——實驗中有模型要求每邊至少 32 像素而誤判為「不支援視覺」。
const RED_SQUARE = `data:image/png;base64,${build_red_png()}`;

await probe("text");
await probe("vision");

/** 產生一張 64×64 的純紅 PNG（手工組 chunk，免得為了一張測試圖多一個相依）。 */
function build_red_png(): string {
  const width = 64;
  const height = 64;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0; // filter type: none
    offset += 1;
    for (let x = 0; x < width; x += 1) {
      raw[offset] = 0xd0;
      raw[offset + 1] = 0x21;
      raw[offset + 2] = 0x21;
      offset += 3;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]).toString("base64");
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.byteLength, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
