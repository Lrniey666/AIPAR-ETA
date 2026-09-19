// 網站的樣式與主題切換。
//
// 樣式全部內嵌：校內網路不保證連得到外部 CDN，也不想為了一個字型多一次網路往返。
//
// 三件事值得先說明白：
//   深淺色  預設跟隨系統（prefers-color-scheme），使用者按過切換鈕之後改以他的選擇為準，
//           存在 localStorage。<head> 裡有一小段同步腳本先把 data-theme 補上，避免閃白。
//   轉場    用 View Transitions API 做「從按鈕為圓心向外擴散」的圓形遮罩。
//           瀏覽器沒有這個 API 就直接換色，不做退化動畫——半套的動畫比沒有更難看。
//   無障礙  系統設定為減少動態時，轉場整個關掉直接切換（不是縮短，是關掉），
//           避免大面積圓形擴散引發暈眩。

/** 深淺色會在整份 CSS 裡被引用，抽成變數才不會兩邊改到不一致。 */
export const THEME_STORAGE_KEY = "aiparc-eta-theme";

export const STYLE = `
:root {
  color-scheme: light;
  --brand-gold: #eabf29;
  --brand-blue: #259fc8;

  --paper: #f7f6f2;
  --surface: #ffffff;
  --surface-2: #fbfaf7;
  --ink: #231815;
  --ink-soft: #5d5a55;
  --line: #e2ded3;
  --accent: #b8860b;
  --accent-soft: rgba(234, 191, 41, 0.16);
  --shadow: 0 1px 2px rgba(35, 24, 21, .05), 0 8px 24px rgba(35, 24, 21, .06);

  --radius-lg: 22px;
  --radius-md: 16px;
  --radius-sm: 10px;
  --gutter: clamp(16px, 4vw, 40px);
  --measure: min(1320px, 100%);
}

/* 深色：先跟隨系統，使用者明確選了淺色就不套用。 */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --paper: #131518;
    --surface: #1b1e23;
    --surface-2: #23272d;
    --ink: #e9e7e2;
    --ink-soft: #a3a8b0;
    --line: #30353c;
    --accent: #eabf29;
    --accent-soft: rgba(234, 191, 41, 0.14);
    --shadow: 0 1px 2px rgba(0, 0, 0, .4), 0 10px 30px rgba(0, 0, 0, .35);
  }
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --paper: #131518;
  --surface: #1b1e23;
  --surface-2: #23272d;
  --ink: #e9e7e2;
  --ink-soft: #a3a8b0;
  --line: #30353c;
  --accent: #eabf29;
  --accent-soft: rgba(234, 191, 41, 0.14);
  --shadow: 0 1px 2px rgba(0, 0, 0, .4), 0 10px 30px rgba(0, 0, 0, .35);
}

* { box-sizing: border-box; }

html { -webkit-text-size-adjust: 100%; }

body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font: 16px/1.65 "Noto Sans TC", "Segoe UI", system-ui, -apple-system, sans-serif;
  font-synthesis-weight: none;
}

/* 平滑圓角：支援 corner-shape 的瀏覽器給超橢圓，其餘退回一般圓角。 */
.card, .panel, .nav, .chip, .btn, .stat, table { border-radius: var(--radius-md); }
.card, .panel { border-radius: var(--radius-lg); }
@supports (corner-shape: superellipse(4)) {
  .card, .panel, .nav, .chip, .btn, .stat { corner-shape: superellipse(4); }
}

a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
a:focus-visible, button:focus-visible {
  outline: 2px solid var(--brand-blue);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

.shell { width: var(--measure); margin: 0 auto; padding: 0 var(--gutter) 64px; }

/* ── 導覽列 ─────────────────────────────────────────── */
.nav {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin: 0 0 28px;
  padding: 10px var(--gutter);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
}
.nav__brand { display: flex; align-items: center; gap: 10px; margin-inline-end: auto; font-weight: 700; color: var(--ink); }
.nav__brand:hover { text-decoration: none; }
.nav__brand img { width: 34px; height: 30px; }
.nav__brand small { display: block; font-weight: 400; font-size: 12px; color: var(--ink-soft); }
.nav__links { display: flex; gap: 4px; flex-wrap: wrap; }
.nav a.nav__link {
  padding: 7px 14px;
  border-radius: 999px;
  color: var(--ink-soft);
  font-size: 15px;
}
.nav a.nav__link:hover { background: var(--surface-2); color: var(--ink); text-decoration: none; }
.nav a.nav__link[aria-current="page"] { background: var(--accent-soft); color: var(--ink); font-weight: 600; }

.theme-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--ink);
  font-size: 17px;
  cursor: pointer;
}
.theme-toggle:hover { background: var(--surface-2); }
.theme-toggle .icon-dark { display: none; }
:root[data-theme="dark"] .theme-toggle .icon-dark { display: inline; }
:root[data-theme="dark"] .theme-toggle .icon-light { display: none; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .theme-toggle .icon-dark { display: inline; }
  :root:not([data-theme="light"]) .theme-toggle .icon-light { display: none; }
}

/* ── 頁首與版塊 ─────────────────────────────────────── */
.page-head { margin: 8px 0 24px; }
.page-head h1 { margin: 0; font-size: clamp(22px, 3.2vw, 30px); letter-spacing: .01em; }
.page-head p { margin: 6px 0 0; color: var(--ink-soft); font-size: 15px; }

h2 { font-size: 18px; margin: 32px 0 12px; }
h2:first-of-type { margin-top: 8px; }

.card, .panel {
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
  padding: 18px 20px;
}
.panel { padding: 0; overflow: hidden; }
.panel > h2 { margin: 0; padding: 16px 20px 12px; border-bottom: 1px solid var(--line); font-size: 16px; }
.panel > .panel__body { padding: 16px 20px; }

.grid { display: grid; gap: 16px; }
.grid--stats { grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
.grid--split { grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); align-items: start; }

.stat {
  background: var(--surface);
  border: 1px solid var(--line);
  padding: 16px 18px;
  box-shadow: var(--shadow);
}
.stat__label { color: var(--ink-soft); font-size: 13px; letter-spacing: .04em; }
.stat__value { font-size: clamp(22px, 3vw, 28px); font-weight: 700; font-variant-numeric: tabular-nums; margin-top: 4px; }
.stat__note { color: var(--ink-soft); font-size: 13px; margin-top: 2px; }

/* ── 表格 ───────────────────────────────────────────── */
.table-wrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 15px; }
th, td { text-align: start; padding: 10px 12px; border-bottom: 1px solid var(--line); }
thead th {
  position: sticky;
  top: 0;
  background: var(--surface-2);
  font-weight: 600;
  color: var(--ink-soft);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: .06em;
}
tbody tr:last-child td { border-bottom: 0; }
tbody tr:hover { background: var(--surface-2); }
td.amount, th.amount { text-align: end; font-variant-numeric: tabular-nums; }

.chip {
  display: inline-block;
  padding: 2px 11px;
  border: 1px solid var(--line);
  border-radius: 999px;
  font-size: 12px;
  color: var(--ink-soft);
  background: var(--surface-2);
}
.chip--open { border-color: color-mix(in srgb, var(--brand-gold) 55%, var(--line)); color: var(--accent); background: var(--accent-soft); }
.chip--done { border-color: color-mix(in srgb, var(--brand-blue) 45%, var(--line)); color: var(--brand-blue); }
.chip--warn { color: #b3261e; border-color: #e7a9a4; }

.empty { color: var(--ink-soft); font-style: italic; }
.owes { font-variant-numeric: tabular-nums; }
.owes b { color: var(--accent); }

footer {
  width: var(--measure);
  margin: 48px auto 0;
  padding: 16px var(--gutter) 40px;
  border-top: 1px solid var(--line);
  color: var(--ink-soft);
  font-size: 13px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: space-between;
}

/* 曲面寬螢幕：資訊不要被擠在中間一條窄柱裡。 */
@media (min-width: 1800px) { :root { --measure: min(1680px, 100%); } }

/* 手機：導覽列改成可橫向捲動的一列，表格文字縮小。 */
@media (max-width: 640px) {
  .nav { gap: 6px; padding-inline: 16px; }
  .nav__brand small { display: none; }
  .nav__links { order: 3; width: 100%; overflow-x: auto; flex-wrap: nowrap; padding-bottom: 2px; }
  .nav a.nav__link { white-space: nowrap; }
  table { font-size: 14px; }
  th, td { padding: 8px 10px; }
}

/* ── 主題轉場 ───────────────────────────────────────── */
::view-transition-old(root), ::view-transition-new(root) { animation: none; mix-blend-mode: normal; }
::view-transition-old(root) { z-index: 0; }
::view-transition-new(root) { z-index: 1; }

@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; }
  * { transition: none !important; animation: none !important; scroll-behavior: auto !important; }
}
`;

/**
 * 先於畫面繪製執行的一小段：把上次選的主題補回 <html>，避免深色使用者看到白閃。
 * 刻意寫成同步、無相依、吞掉例外（無痕視窗讀 localStorage 會丟）。
 */
export const THEME_BOOT_SCRIPT = `
(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
if(t==="dark"||t==="light"){document.documentElement.dataset.theme=t;}}catch(e){}})();
`;

/** 切換鈕的行為。圓心取自按鈕位置，半徑取到視窗最遠角，遮罩才蓋得滿。 */
export const THEME_TOGGLE_SCRIPT = `
(function(){
  var key=${JSON.stringify(THEME_STORAGE_KEY)};
  var root=document.documentElement;
  var button=document.getElementById("theme-toggle");
  if(!button){return;}

  function current(){
    if(root.dataset.theme==="dark"||root.dataset.theme==="light"){return root.dataset.theme;}
    return window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
  }
  function label(mode){
    button.setAttribute("aria-label",mode==="dark"?"切換到淺色模式":"切換到深色模式");
    button.setAttribute("aria-pressed",mode==="dark"?"true":"false");
  }
  function apply(next){
    root.dataset.theme=next;
    label(next);
    try{localStorage.setItem(key,next);}catch(e){}
  }

  button.addEventListener("click",function(event){
    var next=current()==="dark"?"light":"dark";
    var reduce=window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // 無障礙：使用者要求減少動態時完全不做轉場，直接換色。
    if(reduce||typeof document.startViewTransition!=="function"){apply(next);return;}

    var box=button.getBoundingClientRect();
    var x=box.left+box.width/2, y=box.top+box.height/2;
    var radius=Math.hypot(Math.max(x,innerWidth-x),Math.max(y,innerHeight-y));

    document.startViewTransition(function(){apply(next);}).ready.then(function(){
      root.animate(
        {clipPath:["circle(0px at "+x+"px "+y+"px)","circle("+radius+"px at "+x+"px "+y+"px)"]},
        {duration:520,easing:"cubic-bezier(.22,.61,.36,1)",pseudoElement:"::view-transition-new(root)"}
      );
    }).catch(function(){});
    event.preventDefault();
  });

  // 載入時只更新鈕的標籤：沒按過切換鈕的人應該繼續跟隨系統設定，
  // 在這裡把 data-theme 寫死會讓他之後改系統深淺色都沒反應。
  label(current());
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change",function(){
    if(root.dataset.theme!=="dark"&&root.dataset.theme!=="light"){label(current());}
  });
})();
`;
