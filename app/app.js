const DATA_URL = 'data/catalog.json';
const VERSION_URL = 'data/version.json';
const CACHE_KEY = 'ogphoto-catalog-cache-v1';
const FAVORITES_KEY = 'ogphoto-favorites-v1';

const state = {
  catalog: null,
  group: '全部',
  category: '全部',
  search: '',
  sort: 'category',
  favoritesOnly: false,
  favorites: new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]')),
};

const element = (id) => document.getElementById(id);
const searchInput = element('searchInput');
const productList = element('productList');
const dataStatus = element('dataStatus');
const dialog = element('detailDialog');

function cleanSearch(value = '') {
  return value.toLocaleLowerCase('zh-Hant').replace(/[\s\-_／/.,，。()（）]/g, '');
}

function priceNumber(value) {
  return Number(String(value).replace(/[^\d]/g, '')) || 0;
}

function formatNumber(value) {
  const number = priceNumber(value);
  return number ? new Intl.NumberFormat('zh-TW').format(number) : '—';
}

function dateText(iso) {
  if (!iso) return '尚未取得資料';
  return new Intl.DateTimeFormat('zh-TW', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));
}

function saveCatalog(catalog) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(catalog)); } catch { /* Service Worker cache is the fallback. */ }
}

function setCatalog(catalog, source = '線上') {
  state.catalog = catalog;
  saveCatalog(catalog);
  dataStatus.textContent = `${source}資料：${catalog.productCount} 項 · 最後更新 ${dateText(catalog.generatedAt)}`;
  render();
}

function getGroups() {
  return [...new Set(state.catalog.categories.map((category) => category.group))];
}

function updateCategoryControls() {
  const groupTabs = element('groupTabs');
  const categoryChips = element('categoryChips');
  groupTabs.replaceChildren();
  categoryChips.replaceChildren();
  ['全部', ...getGroups()].forEach((group) => {
    const button = document.createElement('button');
    button.className = `chip group-chip${state.group === group ? ' selected' : ''}`;
    button.type = 'button';
    button.textContent = group;
    button.setAttribute('aria-selected', String(state.group === group));
    button.addEventListener('click', () => {
      state.group = group;
      state.category = '全部';
      render();
    });
    groupTabs.append(button);
  });
  const categories = state.catalog.categories.filter((category) => state.group === '全部' || category.group === state.group);
  if (categories.length) {
    ['全部', ...categories.map((category) => category.name)].forEach((category) => {
      const button = document.createElement('button');
      button.className = `chip category-chip${state.category === category ? ' selected' : ''}`;
      button.type = 'button';
      button.textContent = category;
      button.addEventListener('click', () => { state.category = category; render(); });
      categoryChips.append(button);
    });
  }
}

function filteredProducts() {
  const query = cleanSearch(state.search);
  const products = state.catalog.products.filter((product) => {
    const matchesGroup = state.group === '全部' || product.group === state.group;
    const matchesCategory = state.category === '全部' || product.category === state.category;
    const matchesFavorite = !state.favoritesOnly || state.favorites.has(product.id);
    const haystack = cleanSearch([product.name, product.category, product.group, product.description, product.accessories].join(' '));
    return matchesGroup && matchesCategory && matchesFavorite && (!query || haystack.includes(query));
  });
  return products.sort((a, b) => {
    if (state.sort === 'price-asc') return priceNumber(a.dailyRate) - priceNumber(b.dailyRate) || a.name.localeCompare(b.name, 'zh-Hant');
    if (state.sort === 'price-desc') return priceNumber(b.dailyRate) - priceNumber(a.dailyRate) || a.name.localeCompare(b.name, 'zh-Hant');
    if (state.sort === 'name') return a.name.localeCompare(b.name, 'zh-Hant');
    return state.catalog.categories.findIndex((item) => item.id === a.categoryId) - state.catalog.categories.findIndex((item) => item.id === b.categoryId)
      || a.name.localeCompare(b.name, 'zh-Hant');
  });
}

function addProductCard(product) {
  const card = element('productCardTemplate').content.firstElementChild.cloneNode(true);
  const main = card.querySelector('.card-main');
  const image = card.querySelector('.card-image');
  const imageWrap = card.querySelector('.card-image-wrap');
  card.querySelector('.category-label').textContent = product.category;
  card.querySelector('h2').textContent = product.name;
  card.querySelector('.detail-preview').textContent = product.description || '點選查看公開品項詳情';
  card.querySelector('.rate-block strong').textContent = formatNumber(product.dailyRate);
  if (product.imageUrl) {
    image.src = product.imageUrl;
    image.addEventListener('error', () => imageWrap.classList.add('image-unavailable'), { once: true });
  } else imageWrap.classList.add('image-unavailable');
  main.addEventListener('click', () => showDetail(product));
  const favorite = card.querySelector('.favorite-button');
  const selected = state.favorites.has(product.id);
  favorite.textContent = selected ? '★' : '☆';
  favorite.setAttribute('aria-pressed', String(selected));
  favorite.setAttribute('aria-label', selected ? '移除收藏' : '加入收藏');
  favorite.addEventListener('click', () => toggleFavorite(product.id));
  productList.append(card);
}

function render() {
  if (!state.catalog) return;
  updateCategoryControls();
  const products = filteredProducts();
  productList.replaceChildren();
  products.forEach(addProductCard);
  const context = [state.group !== '全部' ? state.group : '', state.category !== '全部' ? state.category : '', state.favoritesOnly ? '我的收藏' : ''].filter(Boolean).join(' · ');
  element('resultSummary').textContent = `${context ? `${context}：` : ''}找到 ${products.length} 項器材`;
  element('emptyState').hidden = products.length !== 0;
  element('resetFilters').hidden = !(state.group !== '全部' || state.category !== '全部' || state.search || state.favoritesOnly);
  element('favoritesButton').setAttribute('aria-pressed', String(state.favoritesOnly));
  element('favoritesButton').classList.toggle('active', state.favoritesOnly);
  element('clearSearch').hidden = !state.search;
}

function detailText(text, heading) {
  const section = document.createElement('section');
  section.className = 'detail-section';
  const title = document.createElement('h3');
  title.textContent = heading;
  section.append(title);
  const content = document.createElement('div');
  content.className = 'detail-text';
  String(text || '官方詳情未提供文字內容。').split(/\n{2,}/).forEach((paragraph) => {
    const p = document.createElement('p');
    p.textContent = paragraph;
    content.append(p);
  });
  section.append(content);
  return section;
}

function showDetail(product) {
  const content = element('detailContent');
  content.replaceChildren();
  const header = document.createElement('header');
  header.className = 'detail-header';
  const close = document.createElement('button');
  close.className = 'dialog-close';
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', '關閉詳情');
  close.addEventListener('click', () => dialog.close());
  const category = document.createElement('p');
  category.className = 'category-label';
  category.textContent = `${product.group} ／ ${product.category}`;
  const title = document.createElement('h2');
  title.textContent = product.name;
  header.append(close, category, title);
  content.append(header);
  if (product.imageUrl) {
    const image = document.createElement('img');
    image.className = 'detail-image';
    image.src = product.imageUrl;
    image.alt = product.name;
    image.addEventListener('error', () => image.remove(), { once: true });
    content.append(image);
  }
  const pricing = document.createElement('section');
  pricing.className = 'price-grid';
  [['每日租金', `${formatNumber(product.dailyRate)} 元`], ['押金', `${formatNumber(product.deposit)} 元`], ['本票金額', `${formatNumber(product.promissoryNote)} 元`]].forEach(([label, value]) => {
    const item = document.createElement('div');
    item.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    pricing.append(item);
  });
  content.append(pricing, detailText(product.description, '公開品項說明'));
  if (product.accessories) content.append(detailText(product.accessories, '內附配件'));
  const actions = document.createElement('footer');
  actions.className = 'detail-actions';
  const favorite = document.createElement('button');
  favorite.className = 'secondary-action';
  favorite.type = 'button';
  favorite.textContent = state.favorites.has(product.id) ? '★ 已收藏' : '☆ 加入收藏';
  favorite.addEventListener('click', () => { toggleFavorite(product.id); showDetail(product); });
  const official = document.createElement('a');
  official.className = 'official-action';
  official.href = product.sourceUrl;
  official.target = '_blank';
  official.rel = 'noopener noreferrer';
  official.textContent = '在橙攝官方頁面開啟 ↗';
  actions.append(favorite, official);
  content.append(actions);
  dialog.showModal();
}

function toggleFavorite(id) {
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...state.favorites]));
  render();
}

async function loadOnline({ force = false } = {}) {
  const versionResponse = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: force ? 'no-store' : 'default' });
  if (!versionResponse.ok) throw new Error('版本資料無法讀取');
  const version = await versionResponse.json();
  if (state.catalog?.generatedAt === version.generatedAt) return false;
  const catalogResponse = await fetch(`${DATA_URL}?v=${encodeURIComponent(version.generatedAt)}`, { cache: 'no-store' });
  if (!catalogResponse.ok) throw new Error('價目資料無法讀取');
  setCatalog(await catalogResponse.json());
  return true;
}

async function initialise() {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (saved?.products?.length) setCatalog(saved, '本機快取');
  } catch { /* No local cache yet. */ }
  try {
    const changed = await loadOnline();
    if (!changed && state.catalog) dataStatus.textContent = `已是最新資料：${state.catalog.productCount} 項 · 最後更新 ${dateText(state.catalog.generatedAt)}`;
  } catch {
    if (state.catalog) dataStatus.textContent = `目前離線，顯示最近資料：${dateText(state.catalog.generatedAt)}`;
    else dataStatus.textContent = '暫時無法載入資料。請確認網路後按「檢查更新」。';
  }
}

searchInput.addEventListener('input', (event) => { state.search = event.target.value; render(); });
element('clearSearch').addEventListener('click', () => { searchInput.value = ''; state.search = ''; searchInput.focus(); render(); });
element('sortSelect').addEventListener('change', (event) => { state.sort = event.target.value; render(); });
element('favoritesButton').addEventListener('click', () => { state.favoritesOnly = !state.favoritesOnly; render(); });
element('resetFilters').addEventListener('click', () => {
  state.group = '全部'; state.category = '全部'; state.search = ''; state.favoritesOnly = false; searchInput.value = ''; render();
});
element('updateButton').addEventListener('click', async () => {
  element('updateButton').disabled = true;
  dataStatus.textContent = '正在檢查已發布的最新資料…';
  try {
    const changed = await loadOnline({ force: true });
    if (!changed) dataStatus.textContent = `已是最新資料：${state.catalog.productCount} 項 · 最後更新 ${dateText(state.catalog.generatedAt)}`;
  } catch {
    dataStatus.textContent = state.catalog ? `更新暫時無法連線，保留最近資料：${dateText(state.catalog.generatedAt)}` : '更新失敗，請確認網路後再試。';
  } finally { element('updateButton').disabled = false; }
});
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js');
initialise();
