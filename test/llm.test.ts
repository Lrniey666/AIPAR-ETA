// LLM 閘道與供應商註冊表的離線測試。
// 用假的 fetch 取代真實連線：這裡要驗的是換金鑰／換供應商的決策邏輯，不是對方的服務。

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { AllProvidersFailed, LlmGateway, NoProviderAvailable } from "../src/llm/gateway.ts";
import { load_providers, type Provider, type ProviderRegistry } from "../src/llm/providers.ts";

const ENV_KEYS = [
  "GROQ_API_KEYS",
  "GEMINI_API_KEYS",
  "MISTRAL_API_KEYS",
  "IAI_API_KEYS",
  "LOCAL_LLM_BASE_URL",
  "LOCAL_LLM_MODEL",
  "GROQ_MODEL",
  "GEMINI_MODEL",
  "MISTRAL_MODEL",
  "IAI_MODEL",
  "GEMINI_VISION_MODEL",
  "LLM_ALLOW_METERED",
  "LLM_TEXT_ORDER",
  "LLM_VISION_ORDER",
];

let saved_env: Record<string, string | undefined> = {};
const real_fetch = globalThis.fetch;

beforeEach(() => {
  saved_env = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved_env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  globalThis.fetch = real_fetch;
});

test("供應商：完全沒有金鑰時不報錯，只是全部略過", () => {
  const registry = load_providers();
  assert.equal(registry.text.length, 0);
  assert.equal(registry.vision.length, 0);
  assert.equal(registry.skipped.length, 5);
});

test("供應商：有金鑰但沒填模型 ID 要被略過並說明原因", () => {
  process.env.GROQ_API_KEYS = "key-1";
  const registry = load_providers();
  assert.equal(registry.text.length, 0);
  assert.match(registry.skipped.find((item) => item.key === "groq")?.reason ?? "", /GROQ_MODEL/);
});

test("供應商：逗號分隔的多把金鑰都要收進輪替", () => {
  process.env.GROQ_API_KEYS = "key-1, key-2 ,key-3";
  process.env.GROQ_MODEL = "openai/gpt-oss-20b";
  const registry = load_providers();
  assert.equal(registry.text.length, 1);
  assert.deepEqual(registry.text[0]?.api_keys, ["key-1", "key-2", "key-3"]);
});

test("供應商：iAI 為免費層，有金鑰與模型 ID 即納入", () => {
  process.env.IAI_API_KEYS = "key-1";
  process.env.IAI_MODEL = "Furen-std";

  const registry = load_providers();
  assert.equal(registry.text.length, 1);
  assert.equal(registry.text[0]?.key, "iai");
  assert.equal(registry.vision.length, 1);
  assert.equal(registry.vision[0]?.key, "iai");
});

test("供應商：不支援視覺的那家不會被排進視覺佇列", () => {
  process.env.GROQ_API_KEYS = "key-1";
  process.env.GROQ_MODEL = "openai/gpt-oss-20b";
  process.env.GEMINI_API_KEYS = "key-2";
  process.env.GEMINI_MODEL = "gemini-3.6-flash";

  const registry = load_providers();
  assert.deepEqual(
    registry.text.map((provider) => provider.key),
    ["groq", "gemini"],
  );
  assert.deepEqual(
    registry.vision.map((provider) => provider.key),
    ["gemini"],
  );
});

function make_provider(key: Provider["key"], api_keys: string[]): Provider {
  return {
    key,
    label: key,
    base_url: `https://example.invalid/${key}`,
    api_keys,
    model: `${key}-model`,
    vision_model: `${key}-vision`,
    supports_vision: true,
    metered: false,
    timeout_ms: 1000,
    extra_body: {},
  };
}

function make_registry(...providers: Provider[]): ProviderRegistry {
  return { text: providers, vision: providers, skipped: [] };
}

/** 依 URL 與金鑰決定回什麼；順便記錄每一次呼叫，好斷言順序。 */
function stub_fetch(reply: (url: string, api_key: string) => Response): string[] {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const auth = String((init?.headers as Record<string, string>)?.authorization ?? "");
    const api_key = auth.replace(/^Bearer\s+/, "");
    calls.push(`${url.split("/").pop()}:${api_key}`);
    return reply(url, api_key);
  }) as typeof fetch;
  return calls;
}

function ok_response(text: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("閘道：沒有任何供應商時要給得出可讀的錯誤", async () => {
  const gateway = new LlmGateway({ text: [], vision: [], skipped: [{ key: "groq", reason: "未設定金鑰" }] });
  await assert.rejects(
    () => gateway.complete({ task: "t", messages: [{ role: "user", content: "hi" }] }),
    (error: unknown) => error instanceof NoProviderAvailable && /未設定金鑰/.test((error as Error).message),
  );
});

test("閘道：401 換下一把金鑰，同一家還有機會", async () => {
  const gateway = new LlmGateway(make_registry(make_provider("groq", ["bad", "good"])));
  const calls = stub_fetch((_url, api_key) =>
    api_key === "good" ? ok_response("成功") : new Response("unauthorised", { status: 401 }),
  );

  const result = await gateway.complete({ task: "t", messages: [{ role: "user", content: "hi" }] });
  assert.equal(result.text, "成功");
  assert.deepEqual(calls, ["completions:bad", "completions:good"]);
});

test("閘道：400 直接換下一家，不再試同一家其他金鑰", async () => {
  const gateway = new LlmGateway(
    make_registry(make_provider("groq", ["k1", "k2"]), make_provider("gemini", ["k3"])),
  );
  const calls = stub_fetch((url) =>
    url.includes("groq") ? new Response("bad request", { status: 400 }) : ok_response("換家成功"),
  );

  const result = await gateway.complete({ task: "t", messages: [{ role: "user", content: "hi" }] });
  assert.equal(result.provider, "gemini");
  assert.deepEqual(calls, ["completions:k1", "completions:k3"]);
});

test("閘道：空回覆當成失敗，換下一家", async () => {
  const gateway = new LlmGateway(
    make_registry(make_provider("gemini", ["k1"]), make_provider("mistral", ["k2"])),
  );
  stub_fetch((url) => (url.includes("gemini") ? ok_response("   ") : ok_response("有內容")));

  const result = await gateway.complete({ task: "t", messages: [{ role: "user", content: "hi" }] });
  assert.equal(result.provider, "mistral");
  assert.equal(result.text, "有內容");
});

test("閘道：要 JSON 卻挖不出來時換成下一家", async () => {
  const gateway = new LlmGateway(
    make_registry(make_provider("gemini", ["k1"]), make_provider("mistral", ["k2"])),
  );
  stub_fetch((url) =>
    url.includes("gemini") ? ok_response("我先想一下，菜單好像有豆漿") : ok_response('{"title":"四海","categories":[]}'),
  );

  const result = await gateway.complete({
    task: "menu-vision",
    messages: [{ role: "user", content: "hi" }],
    require_json: true,
  });
  assert.equal(result.provider, "mistral");
  assert.equal(result.text, '{"title":"四海","categories":[]}');
});

test("閘道：全部失敗時要把每一次嘗試都帶在錯誤裡", async () => {
  const gateway = new LlmGateway(
    make_registry(make_provider("groq", ["k1"]), make_provider("gemini", ["k2"])),
  );
  stub_fetch(() => new Response("bad request", { status: 400 }));

  await assert.rejects(
    () => gateway.complete({ task: "t", messages: [{ role: "user", content: "hi" }] }),
    (error: unknown) => {
      assert.ok(error instanceof AllProvidersFailed);
      assert.equal(error.attempts.length, 2);
      return true;
    },
  );
});

test("閘道：推理模型只給 reasoning 欄位時也要取得到文字", async () => {
  const gateway = new LlmGateway(make_registry(make_provider("groq", ["k1"])));
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: "", reasoning_content: "想了一下的結論" } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

  const result = await gateway.complete({ task: "t", messages: [{ role: "user", content: "hi" }] });
  assert.equal(result.text, "想了一下的結論");
});
