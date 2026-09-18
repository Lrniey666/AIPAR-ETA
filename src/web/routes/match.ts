// 路徑比對。刻意抽成純函式：這裡曾經因為少跳過一個路徑片段而全部 404，
// 拆出來之後就能用離線測試把每一條路徑釘住。

export type ApiRoute =
  | { kind: "restaurants" }
  | { kind: "restaurant-detail"; id: number }
  | { kind: "sessions" }
  | { kind: "session-detail"; id: number }
  | { kind: "ledger"; guild_id: string }
  | { kind: "llm-usage" };

export type PageRoute =
  | { kind: "index" }
  | { kind: "restaurant"; id: number }
  | { kind: "session"; id: number };

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
  if (head === "restaurants" && id && is_numeric(id)) {
    return { kind: "restaurant", id: Number(id) };
  }
  if (head === "sessions" && id && is_numeric(id)) {
    return { kind: "session", id: Number(id) };
  }
  return undefined;
}

function is_numeric(value: string): boolean {
  return /^\d+$/.test(value) && Number(value) <= Number.MAX_SAFE_INTEGER;
}
