import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

export type HealthPayload = {
  ok: boolean;
  service: string;
  [key: string]: unknown;
};

type StatusLoader = () => Promise<HealthPayload>;

function send_json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

export function start_health_server(
  host: string,
  port: number,
  service: string,
  load_status: StatusLoader,
): void {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const path = req.url?.split("?")[0] ?? "/";
    if (path !== "/" && path !== "/health") {
      send_json(res, 404, { ok: false, error: "找不到路徑" });
      return;
    }

    try {
      const body = await load_status();
      send_json(res, body.ok ? 200 : 503, body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      send_json(res, 503, { ok: false, service, error: message });
    }
  });

  server.listen(port, host, () => {
    console.log(`[${service}] 健康檢查已監聽 ${host}:${port}`);
  });
}
