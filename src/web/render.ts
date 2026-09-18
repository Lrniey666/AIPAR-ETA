// 網站的 HTML 外框：導覽列、頁首、頁尾與幾個共用的小元件。
// 樣式與主題切換腳本在 `theme.ts`，一樣全部內嵌，不依賴外部 CDN。

import { STYLE, THEME_BOOT_SCRIPT, THEME_TOGGLE_SCRIPT } from "./theme.ts";

export function escape_html(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 導覽列。網站定位是「輔助 bot 的查閱與儀表板」，所以只放看得到資料的頁。 */
const NAV_ITEMS = [
  { href: "/", label: "儀表板" },
  { href: "/restaurants", label: "餐廳與菜單" },
  { href: "/sessions", label: "揪團紀錄" },
  { href: "/ledger", label: "帳務" },
  { href: "/status", label: "系統狀態" },
] as const;

export type PageOptions = {
  title: string;
  subtitle?: string;
  body: string;
  generated_at: string;
  /** 目前頁面的路徑，用來標示導覽列的 aria-current。 */
  active?: string;
};

/** `/restaurants/3` 也要讓「餐廳與菜單」亮起來，所以比對的是第一段路徑。 */
function is_active(href: string, active: string | undefined): boolean {
  if (active === undefined) {
    return false;
  }
  if (href === "/") {
    return active === "/";
  }
  return active === href || active.startsWith(`${href}/`);
}

function nav_html(active: string | undefined): string {
  const links = NAV_ITEMS.map(
    (item) =>
      `<a class="nav__link" href="${item.href}"${
        is_active(item.href, active) ? ' aria-current="page"' : ""
      }>${escape_html(item.label)}</a>`,
  ).join("");

  return `<nav class="nav" aria-label="主要導覽">
  <a class="nav__brand" href="/">
    <img src="/assets/logo.svg" alt="" width="34" height="30" aria-hidden="true">
    <span>AIPARC ETA<small>實驗室伙食系統</small></span>
  </a>
  <div class="nav__links">${links}</div>
  <button id="theme-toggle" class="theme-toggle" type="button"
          aria-label="切換深色模式" aria-pressed="false">
    <span class="icon-light" aria-hidden="true">☾</span><span class="icon-dark" aria-hidden="true">☀</span>
  </button>
</nav>`;
}

export function layout(options: PageOptions): string {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escape_html(options.title)}｜AIPARC ETA</title>
<link rel="icon" href="/assets/logo.svg" type="image/svg+xml">
<script>${THEME_BOOT_SCRIPT}</script>
<style>${STYLE}</style>
</head>
<body>
${nav_html(options.active)}
<main class="shell">
<div class="page-head">
  <h1>${escape_html(options.title)}</h1>
  ${options.subtitle ? `<p>${escape_html(options.subtitle)}</p>` : ""}
</div>
${options.body}
</main>
<footer>
  <span>實驗室伙食系統 AIPARC ETA．資料寫入一律經由 Discord bot，本站唯讀。</span>
  <span>更新於 ${escape_html(options.generated_at)}（台北時間）</span>
</footer>
<script>${THEME_TOGGLE_SCRIPT}</script>
</body>
</html>`;
}

/** 表格外框。手機上靠這層橫向捲動，不讓整頁被撐寬。 */
export function table(headers: string[], rows: string[]): string {
  if (rows.length === 0) {
    return "";
  }
  const head = headers
    .map((header) =>
      header.startsWith("#")
        ? `<th class="amount">${escape_html(header.slice(1))}</th>`
        : `<th>${escape_html(header)}</th>`,
    )
    .join("");
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

export function panel(title: string, body: string): string {
  return `<section class="panel"><h2>${escape_html(title)}</h2><div class="panel__body">${body}</div></section>`;
}

export function stat(label: string, value: string, note = ""): string {
  return `<div class="stat"><div class="stat__label">${escape_html(label)}</div>
    <div class="stat__value">${escape_html(value)}</div>
    ${note ? `<div class="stat__note">${escape_html(note)}</div>` : ""}</div>`;
}

export function empty(message: string): string {
  return `<p class="empty">${escape_html(message)}</p>`;
}

const STATUS_CHIP: Record<string, string> = {
  open: "chip--open",
  locked: "chip--done",
  settled: "chip--done",
  cancelled: "chip--warn",
};

export const STATUS_LABEL: Record<string, string> = {
  open: "開放中",
  locked: "已封單",
  settled: "已結算",
  cancelled: "已取消",
};

export function status_chip(status: string): string {
  return `<span class="chip ${STATUS_CHIP[status] ?? ""}">${escape_html(STATUS_LABEL[status] ?? status)}</span>`;
}
