#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_PATH = resolve(ROOT, 'app/data/catalog.json');
const CATALOG_HTML_PATH = resolve(ROOT, 'app/catalog.html');
const SITEMAP_PATH = resolve(ROOT, 'sitemap.xml');
const SITE_ROOT = 'https://ryanlin02.github.io/ogphoto-price-pwa/';
const APP_URL = `${SITE_ROOT}app/`;
const CATALOG_URL = `${APP_URL}catalog.html`;

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function compact(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

function summary(value = '', maxLength = 360) {
  const text = compact(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function money(value) {
  const number = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(number) ? new Intl.NumberFormat('zh-TW').format(number) : compact(value);
}

const catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8'));
const productsByCategory = new Map();
for (const product of catalog.products) {
  const products = productsByCategory.get(product.categoryId) || [];
  products.push(product);
  productsByCategory.set(product.categoryId, products);
}

const navigation = catalog.categories
  .filter((category) => productsByCategory.has(category.id))
  .map((category) => `<a href="#category-${escapeHtml(category.id)}">${escapeHtml(compact(category.name))}</a>`)
  .join('\n          ');

const sections = catalog.categories
  .filter((category) => productsByCategory.has(category.id))
  .map((category) => {
    const products = productsByCategory.get(category.id);
    const cards = products.map((product) => `
          <article class="product" id="product-${escapeHtml(product.id)}" data-product-id="${escapeHtml(product.id)}">
            <p class="group">${escapeHtml(compact(product.group))} · ${escapeHtml(compact(product.category))}</p>
            <h3>${escapeHtml(compact(product.name))}</h3>
            <dl>
              <div><dt>每日租金</dt><dd>NT$${escapeHtml(money(product.dailyRate))}</dd></div>
              <div><dt>押金</dt><dd>NT$${escapeHtml(money(product.deposit))}</dd></div>
              <div><dt>本票</dt><dd>NT$${escapeHtml(money(product.promissoryNote))}</dd></div>
            </dl>
            <p class="description">${escapeHtml(summary(product.description))}</p>
            <a class="official" href="${escapeHtml(product.sourceUrl)}" rel="noopener external">查看官方品項資料</a>
          </article>`).join('');
    return `
        <section class="category" id="category-${escapeHtml(category.id)}">
          <header>
            <p>${escapeHtml(compact(category.group))}</p>
            <h2>${escapeHtml(compact(category.name))}</h2>
            <span>${products.length} 項</span>
          </header>
          <div class="products">${cards}
          </div>
        </section>`;
  }).join('');

const itemList = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  '@id': `${CATALOG_URL}#page`,
  url: CATALOG_URL,
  name: '橙攝攝影器材完整租借價目目錄',
  description: '橙攝公開攝影器材租借品項、每日租金、押金、本票與規格的靜態索引。',
  inLanguage: 'zh-Hant-TW',
  isPartOf: { '@id': `${APP_URL}#website` },
  mainEntity: {
    '@type': 'ItemList',
    numberOfItems: catalog.products.length,
    itemListElement: catalog.products.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: compact(product.name),
      url: `${CATALOG_URL}#product-${product.id}`,
    })),
  },
};

const generatedDate = new Date(catalog.generatedAt);
const dateLabel = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  dateStyle: 'long',
  timeStyle: 'short',
}).format(generatedDate);

const catalogHtml = `<!doctype html>
<html lang="zh-Hant-TW">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#ffffff">
    <meta name="description" content="瀏覽橙攝 ${catalog.productCount} 項公開攝影器材租借價目，包含相機、鏡頭、燈光、收音與穩定器等分類的每日租金、押金、本票及規格。">
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
    <link rel="canonical" href="${CATALOG_URL}">
    <link rel="alternate" hreflang="zh-Hant-TW" href="${CATALOG_URL}">
    <meta property="og:locale" content="zh_TW">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="橙攝器材查價">
    <meta property="og:title" content="橙攝完整器材目錄｜${catalog.productCount} 項租借價格與規格">
    <meta property="og:description" content="可直接被搜尋引擎讀取的橙攝公開攝影器材租借價目與規格索引。">
    <meta property="og:url" content="${CATALOG_URL}">
    <meta property="og:image" content="${APP_URL}og-image.png">
    <meta name="twitter:card" content="summary_large_image">
    <title>橙攝完整器材目錄｜${catalog.productCount} 項攝影器材租借價格與規格</title>
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-GJ4S4Z7274"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-GJ4S4Z7274');
    </script>
    <script type="application/ld+json">${JSON.stringify(itemList)}</script>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Noto Sans TC", "PingFang TC", sans-serif; }
      * { box-sizing: border-box; }
      html { scroll-behavior: smooth; background: #f8fafc; }
      body { margin: 0; color: #1e293b; background: #f8fafc; }
      a { color: #c2410c; text-underline-offset: 3px; }
      .hero { padding: 38px 18px 30px; color: #fff; background: #173f3b; }
      .hero-inner, main, footer { width: min(100%, 1080px); margin: auto; }
      .eyebrow { margin: 0 0 8px; color: #fed7aa; font-size: .82rem; font-weight: 800; letter-spacing: .08em; }
      h1 { margin: 0; font-size: clamp(1.75rem, 7vw, 3rem); line-height: 1.2; }
      .lead { max-width: 760px; margin: 12px 0 20px; color: #e2e8f0; line-height: 1.7; }
      .cta { display: inline-grid; min-height: 46px; place-items: center; border-radius: 12px; padding: 8px 16px; color: #fff; background: #ea580c; font-weight: 800; text-decoration: none; }
      main { padding: 20px 14px 54px; }
      .notice { margin: 0 0 16px; padding: 13px 15px; border: 1px solid #fed7aa; border-radius: 12px; color: #78716c; background: #fff7ed; font-size: .88rem; line-height: 1.6; }
      .category-nav { display: flex; gap: 7px; overflow-x: auto; padding: 5px 0 18px; scrollbar-width: thin; }
      .category-nav a { flex: 0 0 auto; border: 1px solid #e2e8f0; border-radius: 999px; padding: 7px 11px; color: #475569; background: #fff; font-size: .78rem; text-decoration: none; }
      .category { margin: 0 0 24px; scroll-margin-top: 12px; }
      .category > header { display: grid; grid-template-columns: 1fr auto; align-items: end; margin-bottom: 9px; }
      .category > header p { grid-column: 1 / -1; margin: 0 0 3px; color: #c2410c; font-size: .72rem; font-weight: 800; }
      .category h2 { margin: 0; font-size: 1.18rem; }
      .category > header span { color: #64748b; font-size: .76rem; }
      .products { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 310px), 1fr)); gap: 9px; }
      .product { border: 1px solid #e2e8f0; border-radius: 13px; padding: 13px; background: #fff; box-shadow: 0 2px 8px rgba(15,23,42,.035); scroll-margin-top: 12px; }
      .group { margin: 0 0 4px; color: #c2410c; font-size: .68rem; font-weight: 800; }
      .product h3 { margin: 0; font-size: .95rem; line-height: 1.4; }
      dl { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin: 10px 0; }
      dl div { min-width: 0; border-radius: 8px; padding: 7px; background: #f8fafc; }
      dt { color: #64748b; font-size: .64rem; }
      dd { overflow: hidden; margin: 2px 0 0; color: #b45309; font-size: .78rem; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
      .description { margin: 0 0 10px; color: #475569; font-size: .78rem; line-height: 1.55; }
      .official { font-size: .76rem; font-weight: 750; }
      footer { padding: 0 14px 46px; color: #64748b; font-size: .78rem; line-height: 1.6; text-align: center; }
    </style>
  </head>
  <body>
    <header class="hero">
      <div class="hero-inner">
        <p class="eyebrow">橙攝公開價目 · 搜尋引擎友善目錄</p>
        <h1>攝影器材租借完整目錄</h1>
        <p class="lead">共 ${catalog.categoryCount} 個分類、${catalog.productCount} 項器材。這個頁面提供可直接索引的品名、每日租金、押金、本票與公開規格；快速搜尋、收藏與租借清單請使用查價工具。</p>
        <a class="cta" href="./">開啟手機查價工具</a>
      </div>
    </header>
    <main>
      <p class="notice">資料最後更新：${escapeHtml(dateLabel)}。價格、庫存、優惠、運費與租借條件均以橙攝官方網站即時確認為準。</p>
      <nav class="category-nav" aria-label="器材分類">
          ${navigation}
      </nav>${sections}
    </main>
    <footer>
      <p>本頁整理公開資訊供查詢使用，不是橙攝官方預約系統。</p>
      <p><a href="./">返回橙攝器材查價</a> · <a href="${escapeHtml(catalog.sourceUrl)}" rel="noopener external">橙攝官方價目表</a></p>
    </footer>
  </body>
</html>
`;

const lastmod = generatedDate.toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${APP_URL}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${CATALOG_URL}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
</urlset>
`;

await writeFile(CATALOG_HTML_PATH, catalogHtml, 'utf8');
await writeFile(SITEMAP_PATH, sitemap, 'utf8');
console.log(`SEO 檔案已產生：${catalog.productCount} 品項、${SITEMAP_PATH}`);
