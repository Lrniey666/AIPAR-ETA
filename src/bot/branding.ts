// Embed 的視覺識別：配色與標誌。
//
// 配色取自 `logo/` 裡的標誌本身（金 #eabf29、藍 #259fc8），Embed 與網站用同一組，
// 兩邊看起來才像同一個系統。
//
// 標誌要能在 Discord 顯示就得有個 http(s) 位址，而校內沒有公有網域——
// 所以直接用網站自己的 `/assets/`。沒設定 `PUBLIC_BASE_URL` 時就不放圖，
// Embed 少一張圖仍然完整可讀，不會出現破圖。

export const COLOUR = {
  /** 標誌的金色；一般成功與主要資訊。 */
  primary: 0xeabf29,
  /** 標誌的藍色；中性資訊。 */
  info: 0x259fc8,
  warn: 0xb26a00,
  danger: 0xa33a3a,
  success: 0x3f7d3f,
} as const;

export type Branding = {
  /** 網站首頁；`/網站` 指令與 Embed 連結用。 */
  site_url: string | undefined;
  /** 方形標誌，給 Embed 的 thumbnail／author icon。 */
  icon_url: string | undefined;
  /** 橫式標誌，給 Embed 的 footer icon。 */
  wordmark_url: string | undefined;
};

const EMPTY: Branding = { site_url: undefined, icon_url: undefined, wordmark_url: undefined };

let current: Branding = EMPTY;

/**
 * 啟動時呼叫一次。放模組層而不是傳進每個 embed 函式，
 * 是因為這是整個行程唯一且不變的設定，硬串進三十個呼叫點只會讓簽章變醜。
 */
export function set_branding(public_base_url: string | undefined): void {
  const base = public_base_url?.trim().replace(/\/+$/, "");
  if (!base || !/^https?:\/\//i.test(base)) {
    current = EMPTY;
    return;
  }
  current = {
    site_url: base,
    icon_url: `${base}/assets/logo.png`,
    wordmark_url: `${base}/assets/logo-wide.png`,
  };
}

export function branding(): Branding {
  return current;
}

/** 只在有設定網站時才回傳 author 區塊，避免 Discord 拿到 undefined 位址。 */
export function brand_author(name: string): { name: string; iconURL?: string; url?: string } {
  const { icon_url, site_url } = current;
  return {
    name,
    ...(icon_url ? { iconURL: icon_url } : {}),
    ...(site_url ? { url: site_url } : {}),
  };
}

export function brand_footer(text: string): { text: string; iconURL?: string } {
  const { wordmark_url } = current;
  return { text, ...(wordmark_url ? { iconURL: wordmark_url } : {}) };
}
