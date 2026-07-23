#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP_URL = 'https://ryanlin02.github.io/ogphoto-price-pwa/app/';
const CATALOG_URL = `${APP_URL}catalog.html`;
const [catalog, appHtml, catalogHtml, rootHtml, sitemap] = await Promise.all([
  readFile(resolve(ROOT, 'app/data/catalog.json'), 'utf8').then(JSON.parse),
  readFile(resolve(ROOT, 'app/index.html'), 'utf8'),
  readFile(resolve(ROOT, 'app/catalog.html'), 'utf8'),
  readFile(resolve(ROOT, 'index.html'), 'utf8'),
  readFile(resolve(ROOT, 'sitemap.xml'), 'utf8'),
]);

function requireMatch(value, pattern, message) {
  if (!pattern.test(value)) throw new Error(message);
}

requireMatch(appHtml, /<title>[^<]*攝影器材租借價格[^<]*<\/title>/, '主頁 SEO 標題缺失');
requireMatch(appHtml, new RegExp(`<link rel="canonical" href="${APP_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`), '主頁 canonical 錯誤');
requireMatch(appHtml, /<meta name="robots" content="index, follow,/, '主頁 robots 設定錯誤');
requireMatch(appHtml, /"@type": "WebApplication"/, '主頁 WebApplication 結構化資料缺失');
requireMatch(appHtml, /<meta property="og:image"[^>]+og-image\.png/, '主頁社群分享圖片缺失');

requireMatch(rootHtml, /<meta name="robots" content="noindex, follow">/, '轉址頁應設為 noindex, follow');
requireMatch(rootHtml, new RegExp(`<link rel="canonical" href="${APP_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`), '轉址頁 canonical 錯誤');

requireMatch(catalogHtml, new RegExp(`<link rel="canonical" href="${CATALOG_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`), '器材目錄 canonical 錯誤');
requireMatch(catalogHtml, /"@type":"CollectionPage"/, '器材目錄 CollectionPage 結構化資料缺失');
const renderedProducts = (catalogHtml.match(/data-product-id=/g) || []).length;
if (renderedProducts !== catalog.productCount) {
  throw new Error(`器材目錄品項數不一致：${renderedProducts}/${catalog.productCount}`);
}

for (const url of [APP_URL, CATALOG_URL]) {
  if (!sitemap.includes(`<loc>${url}</loc>`)) throw new Error(`Sitemap 缺少 ${url}`);
}
if ((sitemap.match(/<url>/g) || []).length !== 2) throw new Error('Sitemap 網址數量異常');

console.log(`SEO 檢查通過：主頁、靜態目錄 ${renderedProducts} 品項、Sitemap 2 個網址`);
