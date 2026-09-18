// 路徑比對。刻意抽成純函式：這裡曾經因為少跳過一個路徑片段而全部 404，
// 拆出來之後就能用離線測試把每一條路徑釘住。

export type ApiRoute =
  | { kind: "restaurants" }
  | { kind: "restaurant-detail"; id: number }
  | { kind: "sessions" }
  | { kind: "session-detail"; id: number }
  | { kind: "ledger"; guild_id: string }
  | { kind: "debts"; guild_id: string }
  | { kind: "overview" }
  | { kind: "llm-usage" };

export type PageRoute =
  | { kind: "index" }
  | { kind: "restaurants" }
  | { kind: "restaurant"; id: number }
  | { kind: "sessions" }
  | { kind: "session"; id: number }
  | { kind: "ledger"; guild_id?: string }
  | { kind: "status" };

/** "/api/restaurants/12" → ["api", "restaurants", "12"]，去掉頭尾的空片段。 */
export function split_path(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

export function match_api_route(pathname: string): ApiRoute | undefined {
  const [prefix, head, id, ...rest] = split_path(pathname);
  if (prefix !== "api" || !head || rest.length > 0) {
    return undefined;
  }

  if (head === "restaurants") {
    if (!id) {
      return { kind: "restaurants" };
    }
    return is_numeric(id) ? { kind: "restaurant-detail", id: Number(id) } : undefined;
  }

  if (head === "sessions") {
    if (!id) {
      return { kind: "sessions" };
    }
    return is_numeric(id) ? { kind: "session-detail", id: Number(id) } : undefined;
  }

  if (head === "ledger" && id) {
    return { kind: "ledger", guild_id: id };
  }

  if (head === "debts" && id) {
    return { kind: "debts", guild_id: id };
  }

  if (head === "overview" && !id) {
    return { kind: "overview" };
  }

  if (head === "llm-usage" && !id) {
    return { kind: "llm-usage" };
  }

  return undefined;
}

export function match_page_route(pathname: string): PageRoute | undefined {
  const [head, id, ...rest] = split_path(pathname);
  if (rest.length > 0) {
    return undefined;
  }
  if (!head) {
    return { kind: "index" };
  }
  if (head === "restaurants") {
    if (!id) {
      return { kind: "restaurants" };
    }
    return is_numeric(id) ? { kind: "restaurant", id: Number(id) } : undefined;
  }
  if (head === "sessions") {
    if (!id) {
      return { kind: "sessions" };
    }
    return is_numeric(id) ? { kind: "session", id: Number(id) } : undefined;
  }
  if (head === "ledger") {
    // guild id 是 Discord 雪花，超過安全整數範圍，一律當字串傳。
    return id ? { kind: "ledger", guild_id: id } : { kind: "ledger" };
  }
  if (head === "status" && !id) {
    return { kind: "status" };
  }
  return undefined;
}

/** 靜態檔只收 `/assets/<檔名>`，檔名再交給白名單比對。 */
export function match_asset_route(pathname: string): string | undefined {
  const [head, name, ...rest] = split_path(pathname);
  if (head !== "assets" || !name || rest.length > 0) {
    return undefined;
  }
  return /^[a-z0-9._-]+$/i.test(name) ? name : undefined;
}

function is_numeric(value: string): boolean {
  return /^\d+$/.test(value) && Number(value) <= Number.MAX_SAFE_INTEGER;
}
