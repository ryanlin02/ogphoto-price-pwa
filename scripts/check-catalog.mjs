#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const catalog = JSON.parse(await readFile(resolve(root, 'app/data/catalog.json'), 'utf8'));
const version = JSON.parse(await readFile(resolve(root, 'app/data/version.json'), 'utf8'));
if (!Array.isArray(catalog.categories) || catalog.categories.length < 20) throw new Error('分類資料不足');
if (!Array.isArray(catalog.products) || catalog.products.length < 50) throw new Error('品項資料不足');
if (catalog.productCount !== catalog.products.length) throw new Error('品項數不一致');
if (version.productCount !== catalog.productCount) throw new Error('版本資料不一致');
for (const product of catalog.products) {
  for (const field of ['id', 'name', 'category', 'dailyRate', 'deposit', 'promissoryNote', 'sourceUrl']) {
    if (!String(product[field] || '').trim()) throw new Error(`缺少 ${field}：${product.id || '未知品項'}`);
  }
}
console.log(`資料檢查通過：${catalog.categoryCount} 分類、${catalog.productCount} 品項`);
