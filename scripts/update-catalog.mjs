#!/usr/bin/env node
/**
 * 將橙攝公開價目頁整理為本 App 使用的 JSON。
 * 不登入、不預約；預設低頻率逐頁讀取，失敗不寫入半套資料。
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = resolve(ROOT, 'app/data/catalog.json');
const VERSION = resolve(ROOT, 'app/data/version.json');
const HOME = 'https://www.ogphoto.com.tw/price.php?act=init';
const ORIGIN = 'https://www.ogphoto.com.tw/';
const DELAY_MS = Number(process.env.OGPHOTO_DELAY_MS || 180);
const TIMEOUT_MS = 25_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function decodeHtml(value = '') {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function textFromHtml(value = '') {
  return decodeHtml(value)
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:p|div|li|h\d|tr)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\r/g, '')
    .replace(/[\t ]+\n/g, '\n')
    .replace(/\n[\t ]+/g, '\n')
    .replace(/[\t ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalise(value = '') {
  return textFromHtml(value).replace(/\s+/g, ' ').trim();
}

function absoluteUrl(path) {
  return new URL(path, ORIGIN).href;
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'OGPhotoPricePWA/1.0 (personal price lookup; low-frequency daily update)',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'zh-TW,zh;q=0.9,en;q=0.6',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    if (html.length < 300 || /please wait while your request is being verified/i.test(html)) {
      throw new Error('網站未提供可用的價目內容');
    }
    return html;
  } finally {
    clearTimeout(timeout);
  }
}

function parseCategories(homeHtml) {
  const categories = [];
  const sectionPattern = /<h3[^>]*>([\s\S]*?)<\/h3>\s*<div[^>]*>\s*<ul class="list-unstyled link-list">([\s\S]*?)<\/ul>/gi;
  for (const match of homeHtml.matchAll(sectionPattern)) {
    const group = normalise(match[1]);
    for (const categoryMatch of match[2].matchAll(/<a[^>]*href="price\.php\?id=(\d+)[^"]*"[^>]*title="([^"]+)"[^>]*>/gi)) {
      categories.push({
        id: categoryMatch[1],
        group,
        name: normalise(categoryMatch[2]),
        sourceUrl: absoluteUrl(`price.php?id=${categoryMatch[1]}`),
      });
    }
  }
  const unique = new Map(categories.map((category) => [category.id, category]));
  return [...unique.values()];
}

function parseCategoryProducts(html, category) {
  const products = [];
  const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/i)?.[1] || '';
  for (const row of body.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
    const mid = row[1].match(/rent\/11_rent_product\.php\?mid=(\d+)/i)?.[1];
    if (!mid) continue;
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1]);
    if (cells.length < 4) continue;
    const title = normalise(cells[0].match(/title="([^"]+)"/i)?.[1] || cells[0]);
    if (!title) continue;
    const rawImageUrl = cells[0].match(/<img[^>]+src="([^"]+)"/i)?.[1] || null;
    products.push({
      id: mid,
      name: title,
      categoryId: category.id,
      category: category.name,
      group: category.group,
      dailyRate: normalise(cells[1]),
      deposit: normalise(cells[2]),
      promissoryNote: normalise(cells[3]),
      imageUrl: rawImageUrl ? absoluteUrl(rawImageUrl) : null,
      sourceUrl: absoluteUrl(`rent/11_rent_product.php?mid=${mid}`),
    });
  }
  return products;
}

function parseProductDetail(html, fallbackImageUrl) {
  const lists = [...html.matchAll(/<ul class="product-list">([\s\S]*?)<\/ul>/gi)].map((match) => textFromHtml(match[1]));
  const description = lists.shift() || '';
  const accessories = lists.filter(Boolean).join('\n');
  const rawImageUrl = html.match(/class="ms-brd"[^>]+data-src="([^"]+)"/i)?.[1]
    || html.match(/class="ms-thumb"[^>]+src="([^"]+)"/i)?.[1]
    || fallbackImageUrl
    || null;
  return { description, accessories, imageUrl: rawImageUrl ? absoluteUrl(rawImageUrl) : null };
}

async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.next`;
  await writeFile(temporary, content, 'utf8');
  await rename(temporary, path);
}

async function previousCatalog() {
  try {
    return JSON.parse(await readFile(OUTPUT, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  console.log('讀取公開分類頁…');
  const homeHtml = await fetchHtml(HOME);
  const categories = parseCategories(homeHtml);
  if (categories.length < 20) throw new Error(`分類數異常：${categories.length}`);

  const productMap = new Map();
  for (let index = 0; index < categories.length; index += 1) {
    const category = categories[index];
    process.stdout.write(`分類 ${index + 1}/${categories.length}：${category.name}\n`);
    const categoryHtml = await fetchHtml(category.sourceUrl);
    for (const product of parseCategoryProducts(categoryHtml, category)) productMap.set(product.id, product);
    await sleep(DELAY_MS);
  }

  const products = [...productMap.values()];
  if (products.length < 50) throw new Error(`品項數異常：${products.length}`);
  console.log(`讀取 ${products.length} 個公開品項詳情…`);

  for (let index = 0; index < products.length; index += 1) {
    const product = products[index];
    process.stdout.write(`詳情 ${index + 1}/${products.length}：${product.name}\n`);
    try {
      const detailHtml = await fetchHtml(product.sourceUrl);
      Object.assign(product, parseProductDetail(detailHtml, product.imageUrl));
      if (!product.description) {
        product.description = '官方詳情頁未提供可讀文字內容，請開啟官方頁面確認。';
        product.detailUnavailable = true;
      }
    } catch (error) {
      product.description = '本次更新無法讀取公開詳情，請開啟官方頁面查看。';
      product.accessories = '';
      product.detailError = String(error.message || error);
    }
    await sleep(DELAY_MS);
  }

  const failedDetails = products.filter((product) => product.detailError).length;
  if (failedDetails > Math.max(5, Math.floor(products.length * 0.08))) {
    throw new Error(`詳情連線異常：${failedDetails}/${products.length}`);
  }

  const now = new Date().toISOString();
  const prior = await previousCatalog();
  const catalog = {
    schemaVersion: 1,
    sourceName: '橙攝攝影器材行公開價目表',
    sourceUrl: HOME,
    generatedAt: now,
    categoryCount: categories.length,
    productCount: products.length,
    categories,
    products,
    changesFromPrevious: prior ? {
      previousGeneratedAt: prior.generatedAt,
      previousProductCount: prior.productCount,
      productCountChange: products.length - prior.productCount,
    } : null,
  };
  const version = {
    schemaVersion: 1,
    generatedAt: now,
    productCount: products.length,
    categoryCount: categories.length,
  };
  await atomicWrite(OUTPUT, `${JSON.stringify(catalog, null, 2)}\n`);
  await atomicWrite(VERSION, `${JSON.stringify(version, null, 2)}\n`);
  console.log(`完成：${categories.length} 分類、${products.length} 品項，${now}`);
}

main().catch((error) => {
  console.error(`更新失敗：${error.stack || error}`);
  process.exitCode = 1;
});
