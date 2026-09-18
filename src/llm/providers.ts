// 免費 LLM 供應商註冊表。全部走 OpenAI 相容 wire format，
// 換一家只換 base_url／api_key／model 三個字串（取自 free-llm-api-test 的結論）。
//
// 規則：
//   1. 沒填金鑰＝跳過這家，不是錯誤。
//   2. 有金鑰但沒填模型 ID＝跳過並記原因，不拿猜的 ID 去打 404。
//   3. 計費型服務（iAI 按 token 計費）預設關閉，要 LLM_ALLOW_METERED=true 才納入。

export type ProviderKey = "groq" | "gemini" | "mistral" | "iai" | "local";

export type Provider = {
  key: ProviderKey;
  label: string;
  base_url: string;
  api_keys: string[];
  model: string;
  vision_model: string;
  supports_vision: boolean;
  /** 計費服務；免費層要求下預設不啟用。 */
  metered: boolean;
  timeout_ms: number;
  extra_body: Record<string, unknown>;
};

export type SkippedProvider = { key: string; reason: string };

export type ProviderRegistry = {
  text: Provider[];
  vision: Provider[];
  skipped: SkippedProvider[];
};

type ProviderSpec = {
  key: ProviderKey;
  label: string;
  default_base_url: string;
  base_url_env: string;
  keys_env: string;
  model_env: string;
  vision_model_env: string;
  supports_vision: boolean;
  metered: boolean;
  timeout_ms: number;
  extra_body: Record<string, unknown>;
  /** 本機模型不需要金鑰，填了 base_url 就算啟用。 */
  requires_key: boolean;
  placeholder_key: string;
};

const SPECS: ProviderSpec[] = [
  {
    key: "groq",
    label: "Groq",
    default_base_url: "https://api.groq.com/openai/v1",
    base_url_env: "GROQ_BASE_URL",
    keys_env: "GROQ_API_KEYS",
    model_env: "GROQ_MODEL",
    vision_model_env: "GROQ_VISION_MODEL",
    supports_vision: false,
    metered: false,
    timeout_ms: 30_000,
    // gpt-oss 預設會把 max_tokens 花在思考上，實驗裡調 low 才穩定吐正文。
    extra_body: { reasoning_effort: "low" },
    requires_key: true,
    placeholder_key: "",
  },
  {
    key: "gemini",
    label: "Gemini (AI Studio)",
    default_base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
    base_url_env: "GEMINI_BASE_URL",
    keys_env: "GEMINI_API_KEYS",
    model_env: "GEMINI_MODEL",
    vision_model_env: "GEMINI_VISION_MODEL",
    supports_vision: true,
    metered: false,
    timeout_ms: 45_000,
    extra_body: {},
    requires_key: true,
    placeholder_key: "",
  },
  {
    key: "mistral",
    label: "Mistral",
    default_base_url: "https://api.mistral.ai/v1",
    base_url_env: "MISTRAL_BASE_URL",
    keys_env: "MISTRAL_API_KEYS",
    model_env: "MISTRAL_MODEL",
    vision_model_env: "MISTRAL_VISION_MODEL",
    supports_vision: true,
    metered: false,
    timeout_ms: 45_000,
    extra_body: {},
    requires_key: true,
    placeholder_key: "",
  },
  {
    key: "iai",
    label: "iAI (NKUST)",
    default_base_url: "https://www.iai.nkust.edu.tw/aihub/v1",
    base_url_env: "IAI_BASE_URL",
    keys_env: "IAI_API_KEYS",
    model_env: "IAI_MODEL",
    vision_model_env: "IAI_VISION_MODEL",
    supports_vision: true,
    metered: true,
    timeout_ms: 90_000,
    extra_body: {},
    requires_key: true,
    placeholder_key: "",
  },
  {
    key: "local",
    label: "Local (Ollama)",
    default_base_url: "",
    base_url_env: "LOCAL_LLM_BASE_URL",
    keys_env: "LOCAL_LLM_API_KEYS",
    model_env: "LOCAL_LLM_MODEL",
    vision_model_env: "LOCAL_LLM_VISION_MODEL",
    supports_vision: true,
    metered: false,
    timeout_ms: 180_000,
    extra_body: {},
    requires_key: false,
    placeholder_key: "ollama",
  },
];

const DEFAULT_TEXT_ORDER: ProviderKey[] = ["groq", "gemini", "mistral", "iai", "local"];
// 視覺以辨識品質排：實驗中 Gemini 是唯一原生多模態且中文菜單最穩的免費層。
const DEFAULT_VISION_ORDER: ProviderKey[] = ["gemini", "groq", "mistral", "iai", "local"];

function read_list(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function read_text(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function allow_metered(): boolean {
  return read_text("LLM_ALLOW_METERED").toLowerCase() === "true";
}

function order_from_env(name: string, fallback: ProviderKey[]): ProviderKey[] {
  const raw = read_list(name).map((value) => value.toLowerCase());
  const known = raw.filter((value): value is ProviderKey =>
    SPECS.some((spec) => spec.key === value),
  );
  return known.length > 0 ? known : fallback;
}

function build_provider(spec: ProviderSpec): Provider | SkippedProvider {
  const base_url = (read_text(spec.base_url_env) || spec.default_base_url).replace(/\/+$/, "");
  const keys = read_list(spec.keys_env);

  if (spec.requires_key && keys.length === 0) {
    return { key: spec.key, reason: `未設定 ${spec.keys_env}` };
  }
  if (!spec.requires_key && !base_url) {
    return { key: spec.key, reason: `未設定 ${spec.base_url_env}` };
  }
  if (!base_url) {
    return { key: spec.key, reason: `未設定 ${spec.base_url_env}` };
  }
  if (spec.metered && !allow_metered()) {
    return { key: spec.key, reason: "計費服務，未開 LLM_ALLOW_METERED" };
  }

  const model = read_text(spec.model_env);
  if (!model) {
    return { key: spec.key, reason: `有金鑰但未設定 ${spec.model_env}` };
  }

  const vision_model = read_text(spec.vision_model_env) || (spec.supports_vision ? model : "");

  return {
    key: spec.key,
    label: spec.label,
    base_url,
    api_keys: keys.length > 0 ? keys : [spec.placeholder_key],
    model,
    vision_model,
    supports_vision: spec.supports_vision && Boolean(vision_model),
    metered: spec.metered,
    timeout_ms: spec.timeout_ms,
    extra_body: spec.extra_body,
  };
}

/** 每次呼叫都重新讀環境變數，容器重啟改設定即可生效，不用改程式。 */
export function load_providers(): ProviderRegistry {
  const available = new Map<ProviderKey, Provider>();
  const skipped: SkippedProvider[] = [];

  for (const spec of SPECS) {
    const result = build_provider(spec);
    if ("reason" in result) {
      skipped.push(result);
    } else {
      available.set(result.key, result);
    }
  }

  const pick = (order: ProviderKey[], filter?: (provider: Provider) => boolean): Provider[] =>
    order
      .map((key) => available.get(key))
      .filter((provider): provider is Provider => Boolean(provider) && (!filter || filter(provider!)));

  return {
    text: pick(order_from_env("LLM_TEXT_ORDER", DEFAULT_TEXT_ORDER)),
    vision: pick(order_from_env("LLM_VISION_ORDER", DEFAULT_VISION_ORDER), (p) => p.supports_vision),
    skipped,
  };
}

export function describe_registry(registry: ProviderRegistry): string {
  const text = registry.text.map((p) => `${p.key}:${p.model}`).join(", ") || "（無）";
  const vision = registry.vision.map((p) => `${p.key}:${p.vision_model}`).join(", ") || "（無）";
  return `文字[${text}] 視覺[${vision}]`;
}
