#!/usr/bin/env node

const SITE_ROOT = 'https://ryanlin02.github.io/ogphoto-price-pwa/';
const KEY = '03d6e3f49a04b2905d17b9cbb13b3d68';
const payload = {
  host: 'ryanlin02.github.io',
  key: KEY,
  keyLocation: `${SITE_ROOT}${KEY}.txt`,
  urlList: [
    `${SITE_ROOT}app/`,
    `${SITE_ROOT}app/catalog.html`,
  ],
};

try {
  const response = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    console.warn(`IndexNow 暫時未接受通知：HTTP ${response.status}`);
  } else {
    console.log(`IndexNow 已接受 ${payload.urlList.length} 個網址：HTTP ${response.status}`);
  }
} catch (error) {
  console.warn(`IndexNow 通知略過：${error.message || error}`);
}
