// 網站與 API 的 HTTP 伺服器。
// 校內沒有網域，只靠 IP + 埠連線，所以路由保持極簡、不做重寫規則。

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import type { AppConfig } from "../config.ts";
import { ping_database, type Db } from "../db/pool.ts";
import { create_logger } from "../shared/logger.ts";
import { format_datetime } from "../shared/time.ts";
import { layout } from "./render.ts";
import {
  api_ledger,
  api_llm_usage,
  api_restaurant_detail,
  api_restaurants,
  api_session_detail,
  api_sessions,
  NOT_FOUND_RESULT,
  type ApiResult,
} from "./routes/api.ts";
import { match_api_route, match_page_route } from "./routes/match.ts";
import { page_index, page_restaurant, page_session } from "./routes/pages.ts";

const log = create_logger("web");

function send_json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function send_html(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(html),
  });
  res.end(html);
}

async function run_api(pool: Db, pathname: string, query: URLSearchParams): Promise<ApiResult> {
  const route = match_api_route(pathname);
  if (!route) {
    return NOT_FOUND_RESULT;
  }

  switch (route.kind) {
    case "restaurants":
      return api_restaurants(pool, query.get("keyword") ?? "");
    case "restaurant-detail":
      return api_restaurant_detail(pool, route.id);
    case "sessions":
      return api_sessions(pool, query.get("guild") ?? undefined);
    case "session-detail":
      return api_session_detail(pool, route.id);
    case "ledger":
      return api_ledger(pool, route.guild_id);
    case "llm-usage": {
      const hours = Number(query.get("hours") ?? 24);
      return api_llm_usage(pool, Number.isFinite(hours) && hours > 0 ? Math.min(hours, 720) : 24);
    }
  }
}

export function start_web_server(config: AppConfig, pool: Db): Server {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void handle(req, res).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      log.error("處理請求失敗", { url: req.url, error: message });
      if (!res.headersSent) {
        send_json(res, 500, { ok: false, error: message });
      }
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";

    if (req.method !== "GET" && req.method !== "HEAD") {
      send_json(res, 405, { ok: false, error: "只接受 GET" });
      return;
    }

    if (pathname === "/health") {
      try {
        const db = await ping_database(pool);
        send_json(res, 200, {
          ok: true,
          service: "web",
          name: "AIPAR ETA",
          timezone: config.timezone,
          database: db,
        });
      } catch (error) {
        send_json(res, 503, {
          ok: false,
          service: "web",
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (pathname.startsWith("/api")) {
      const result = await run_api(pool, pathname, url.searchParams);
      send_json(res, result.status, result.body);
      return;
    }

    const page_route = match_page_route(pathname);
    if (page_route) {
      const page =
        page_route.kind === "index"
          ? await page_index(pool)
          : page_route.kind === "restaurant"
            ? await page_restaurant(pool, page_route.id)
            : await page_session(pool, page_route.id);
      send_html(res, page.status, page.html);
      return;
    }

    send_html(
      res,
      404,
      layout({
        title: "找不到頁面",
        generated_at: format_datetime(),
        body: `<p class="empty">找不到這個位址。</p><p><a href="/">回總覽</a></p>`,
      }),
    );
  }

  server.listen(config.app_port, config.app_host, () => {
    log.info("網站已監聽", { host: config.app_host, port: config.app_port });
  });
  return server;
}
