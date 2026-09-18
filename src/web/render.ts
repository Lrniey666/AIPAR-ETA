// 網站的 HTML 外框。
// 樣式全部內嵌：校內網路不保證連得到外部 CDN，也不想為了一個字型多一次網路往返。

export function escape_html(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STYLE = `
:root { color-scheme: light dark; --ink:#1c1f1d; --paper:#fbfaf7; --line:#d9d6cd;
        --accent:#2f6f4e; --muted:#6b6b6b; }
@media (prefers-color-scheme: dark) {
  :root { --ink:#e8e6e1; --paper:#16181a; --line:#2f3336; --accent:#7fb693; --muted:#9aa0a6; }
}
* { box-sizing: border-box; }
body { margin:0; padding:0 16px 48px; background:var(--paper); color:var(--ink);
       font: 16px/1.6 "Noto Sans TC", "Segoe UI", system-ui, sans-serif; }
main { max-width: 860px; margin: 0 auto; }
header { border-bottom:1px solid var(--line); margin-bottom:24px; padding:20px 0 12px; }
header h1 { margin:0; font-size:20px; letter-spacing:.02em; }
header p { margin:4px 0 0; color:var(--muted); font-size:14px; }
a { color:var(--accent); text-decoration:none; }
a:hover { text-decoration:underline; }
h2 { font-size:17px; margin:28px 0 10px; }
table { border-collapse:collapse; width:100%; font-size:15px; }
th, td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); }
th { font-weight:600; color:var(--muted); font-size:13px; text-transform:uppercase; letter-spacing:.04em; }
td.amount, th.amount { text-align:right; font-variant-numeric: tabular-nums; }
.card { border:1px solid var(--line); border-radius:10px; padding:14px 16px; margin-bottom:12px; }
.tag { display:inline-block; border:1px solid var(--line); border-radius:999px;
       padding:1px 10px; font-size:12px; color:var(--muted); }
.empty { color:var(--muted); font-style:italic; }
footer { margin-top:40px; padding-top:12px; border-top:1px solid var(--line);
         color:var(--muted); font-size:13px; }
`;

export type PageOptions = {
  title: string;
  subtitle?: string;
  body: string;
  generated_at: string;
};

export function layout(options: PageOptions): string {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape_html(options.title)}｜AIPAR ETA</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<header>
  <h1><a href="/">AIPAR ETA</a>｜${escape_html(options.title)}</h1>
  ${options.subtitle ? `<p>${escape_html(options.subtitle)}</p>` : ""}
</header>
${options.body}
<footer>實驗室伙食系統．資料更新於 ${escape_html(options.generated_at)}（台北時間）</footer>
</main>
</body>
</html>`;
}
