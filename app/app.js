const DATA_URL = 'data/catalog.json';
const VERSION_URL = 'data/version.json';
const CACHE_KEY = 'ogphoto-catalog-cache-v1';
const FAVORITES_KEY = 'ogphoto-favorites-v1';
const CART_KEY = 'ogphoto-rental-list-v1';

function storedJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; }
}

const savedCart = storedJson(CART_KEY, {});

const state = {
  catalog: null,
  group: '全部',
  category: '全部',
  search: '',
  sort: 'category',
  favoritesOnly: false,
  favorites: new Set(storedJson(FAVORITES_KEY, [])),
  cart: {
    title: savedCart.title || '器材租借清單',
    note: savedCart.note || '',
    days: Math.max(1, Number(savedCart.days) || 1),
    items: Array.isArray(savedCart.items) ? savedCart.items : [],
  },
};

const element = (id) => document.getElementById(id);
const searchInput = element('searchInput');
const productList = element('productList');
const dataStatus = element('dataStatus');
const dialog = element('detailDialog');
const cartDialog = element('cartDialog');

function cleanSearch(value = '') {
  return value.toLocaleLowerCase('zh-Hant').replace(/[\s\-_／/.,，。()（）]/g, '');
}

function priceNumber(value) {
  return Number(String(value).replace(/[^\d]/g, '')) || 0;
}

function formatNumber(value) {
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  return digits ? new Intl.NumberFormat('zh-TW').format(Number(digits)) : '—';
}

function positiveInteger(value, fallback = 1) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? Math.min(number, 365) : fallback;
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
}

function cartItemCount() {
  return state.cart.items.reduce((total, item) => total + positiveInteger(item.quantity), 0);
}

function cartProduct(item) {
  return state.catalog?.products.find((product) => product.id === item.id) || null;
}

function effectiveDays(item) {
  return item.days ? positiveInteger(item.days) : state.cart.days;
}

function cartEntries() {
  return state.cart.items.map((item) => ({ item, product: cartProduct(item) })).filter(({ product }) => product);
}

function cartTotals() {
  return cartEntries().reduce((totals, { item, product }) => {
    const quantity = positiveInteger(item.quantity);
    const days = effectiveDays(item);
    totals.rental += priceNumber(product.dailyRate) * quantity * days;
    totals.deposit += priceNumber(product.deposit) * quantity;
    totals.promissoryNote += priceNumber(product.promissoryNote) * quantity;
    return totals;
  }, { rental: 0, deposit: 0, promissoryNote: 0 });
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
  const cart = card.querySelector('.cart-button');
  cart.addEventListener('click', () => addToCart(product.id));
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
  element('cartCount').textContent = String(cartItemCount());
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

function addToCart(id) {
  const existing = state.cart.items.find((item) => item.id === id);
  if (existing) existing.quantity = positiveInteger(existing.quantity) + 1;
  else state.cart.items.push({ id, quantity: 1, days: null });
  saveCart();
  render();
}

function removeFromCart(id) {
  state.cart.items = state.cart.items.filter((item) => item.id !== id);
  saveCart();
  render();
  renderCart();
}

function setCartItem(id, updates) {
  const item = state.cart.items.find((entry) => entry.id === id);
  if (!item) return;
  Object.assign(item, updates);
  saveCart();
  render();
  renderCart();
}

function cartText() {
  const totals = cartTotals();
  const lines = [
    state.cart.title.trim() || '器材租借清單',
    `建立日期：${new Intl.DateTimeFormat('zh-TW').format(new Date())}`,
    `全體預設租期：${state.cart.days} 天`,
    '',
  ];
  cartEntries().forEach(({ item, product }, index) => {
    const quantity = positiveInteger(item.quantity);
    const days = effectiveDays(item);
    lines.push(`${index + 1}. ${product.name}`);
    lines.push(`   每日租金：${formatNumber(product.dailyRate)} 元 × ${days} 天 × ${quantity} 件 = ${formatNumber(priceNumber(product.dailyRate) * days * quantity)} 元`);
    lines.push(`   押金：${formatNumber(product.deposit)} 元；本票金額：${formatNumber(product.promissoryNote)} 元`);
    lines.push(`   官方頁面：${product.sourceUrl}`);
  });
  lines.push('', `基本日租預估：${formatNumber(totals.rental)} 元`, `押金合計：${formatNumber(totals.deposit)} 元`, `本票金額合計：${formatNumber(totals.promissoryNote)} 元`);
  if (state.cart.note.trim()) lines.push('', `備註：${state.cart.note.trim()}`);
  lines.push('', '注意：以上依公開每日租金計算，未自動套用長租優惠、個案報價、運費、搭配限制或庫存狀態；最終以橙攝官方確認為準。');
  return lines.join('\n');
}

function downloadCartText() {
  const blob = new Blob([`\uFEFF${cartText()}\n`], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  link.href = URL.createObjectURL(blob);
  link.download = `${day}_橙攝器材租借清單.txt`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function inputField(type, value, label, onChange, options = {}) {
  const input = document.createElement('input');
  input.type = type;
  input.value = value;
  input.setAttribute('aria-label', label);
  Object.entries(options).forEach(([key, optionValue]) => input.setAttribute(key, optionValue));
  input.addEventListener('change', (event) => onChange(event.target.value));
  return input;
}

function renderCart() {
  const content = element('cartContent');
  content.replaceChildren();
  const header = document.createElement('header');
  header.className = 'cart-header';
  const headingWrap = document.createElement('div');
  const titleInput = inputField('text', state.cart.title, '清單標題', (value) => { state.cart.title = value; saveCart(); });
  titleInput.className = 'cart-title-input';
  const label = document.createElement('p');
  label.textContent = '個人租借準備 · 非官方訂單';
  headingWrap.append(label, titleInput);
  const close = document.createElement('button');
  close.className = 'dialog-close';
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', '關閉租借清單');
  close.addEventListener('click', () => cartDialog.close());
  header.append(headingWrap, close);
  content.append(header);

  const controls = document.createElement('section');
  controls.className = 'cart-controls';
  const daysLabel = document.createElement('label');
  daysLabel.textContent = '全體預設租期';
  const days = inputField('number', String(state.cart.days), '全體預設租期（天）', (value) => {
    state.cart.days = positiveInteger(value);
    saveCart();
    renderCart();
  }, { min: '1', max: '365', inputmode: 'numeric' });
  daysLabel.append(days, document.createTextNode(' 天'));
  const clear = document.createElement('button');
  clear.className = 'cart-clear-button';
  clear.type = 'button';
  clear.textContent = '清空清單';
  clear.disabled = state.cart.items.length === 0;
  clear.addEventListener('click', () => {
    if (!window.confirm('確定要清空全部租借清單嗎？')) return;
    state.cart.items = [];
    saveCart();
    render();
    renderCart();
  });
  controls.append(daysLabel, clear);
  content.append(controls);

  const entries = cartEntries();
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'cart-empty';
    empty.innerHTML = '<strong>尚未加入器材</strong><span>在器材卡片或詳情頁按「加入清單」即可開始整理。</span>';
    content.append(empty);
  } else {
    const list = document.createElement('section');
    list.className = 'cart-list';
    entries.forEach(({ item, product }) => {
      const quantity = positiveInteger(item.quantity);
      const days = effectiveDays(item);
      const row = document.createElement('article');
      row.className = 'cart-row';
      const top = document.createElement('div');
      top.className = 'cart-row-top';
      const copy = document.createElement('div');
      const category = document.createElement('p');
      category.className = 'category-label';
      category.textContent = product.category;
      const name = document.createElement('h3');
      name.textContent = product.name;
      const official = document.createElement('a');
      official.href = product.sourceUrl;
      official.target = '_blank';
      official.rel = 'noopener noreferrer';
      official.textContent = '官方頁面 ↗';
      copy.append(category, name, official);
      const remove = document.createElement('button');
      remove.className = 'cart-remove-button';
      remove.type = 'button';
      remove.textContent = '移除';
      remove.addEventListener('click', () => removeFromCart(product.id));
      top.append(copy, remove);
      const fields = document.createElement('div');
      fields.className = 'cart-row-fields';
      const dayLabel = document.createElement('label');
      dayLabel.textContent = '天數';
      const dayInput = inputField('number', String(days), `${product.name} 租借天數`, (value) => {
        const nextDays = positiveInteger(value);
        setCartItem(product.id, { days: nextDays === state.cart.days ? null : nextDays });
      }, { min: '1', max: '365', inputmode: 'numeric' });
      dayLabel.append(dayInput);
      const resetDays = document.createElement('button');
      resetDays.className = 'cart-reset-days';
      resetDays.type = 'button';
      resetDays.textContent = item.days ? '套用全體' : '全體預設';
      resetDays.disabled = !item.days;
      resetDays.addEventListener('click', () => setCartItem(product.id, { days: null }));
      dayLabel.append(resetDays);
      const quantityLabel = document.createElement('label');
      quantityLabel.textContent = '數量';
      quantityLabel.append(inputField('number', String(quantity), `${product.name} 數量`, (value) => setCartItem(product.id, { quantity: positiveInteger(value) }), { min: '1', max: '99', inputmode: 'numeric' }));
      const subtotal = document.createElement('div');
      subtotal.className = 'cart-subtotal';
      subtotal.innerHTML = `<span>基本日租小計</span><strong>${formatNumber(priceNumber(product.dailyRate) * days * quantity)} 元</strong>`;
      fields.append(dayLabel, quantityLabel, subtotal);
      const detail = document.createElement('p');
      detail.className = 'cart-row-pricing';
      detail.textContent = `每日 ${formatNumber(product.dailyRate)} 元 · 押金 ${formatNumber(product.deposit)} 元 · 本票 ${formatNumber(product.promissoryNote)} 元`;
      row.append(top, fields, detail);
      list.append(row);
    });
    content.append(list);
  }

  const noteLabel = document.createElement('label');
  noteLabel.className = 'cart-note';
  noteLabel.textContent = '清單備註（選填）';
  const note = document.createElement('textarea');
  note.rows = 3;
  note.placeholder = '例如：活動名稱、取件時間、需要再確認的器材…';
  note.value = state.cart.note;
  note.addEventListener('input', (event) => { state.cart.note = event.target.value; saveCart(); });
  noteLabel.append(note);
  content.append(noteLabel);

  const totals = cartTotals();
  const summary = document.createElement('section');
  summary.className = 'cart-summary';
  [['基本日租預估', `${formatNumber(totals.rental)} 元`], ['押金合計', `${formatNumber(totals.deposit)} 元`], ['本票金額合計', `${formatNumber(totals.promissoryNote)} 元`]].forEach(([labelText, value]) => {
    const line = document.createElement('div');
    const labelTextNode = document.createElement('span');
    const valueNode = document.createElement('strong');
    labelTextNode.textContent = labelText;
    valueNode.textContent = value;
    line.append(labelTextNode, valueNode);
    summary.append(line);
  });
  const warning = document.createElement('p');
  warning.className = 'cart-warning';
  warning.textContent = '預估依公開每日租金計算，未自動套用長租優惠、個案報價、運費、搭配限制或庫存狀態；最終以橙攝官方確認為準。';
  summary.append(warning);
  content.append(summary);

  const actions = document.createElement('footer');
  actions.className = 'cart-actions';
  const print = document.createElement('button');
  print.type = 'button';
  print.className = 'official-action';
  print.textContent = '列印／另存 PDF';
  print.disabled = !entries.length;
  print.addEventListener('click', () => window.print());
  const download = document.createElement('button');
  download.type = 'button';
  download.className = 'secondary-action';
  download.textContent = '下載文字清單';
  download.disabled = !entries.length;
  download.addEventListener('click', downloadCartText);
  actions.append(download, print);
  content.append(actions);
}

function openCart() {
  renderCart();
  if (!cartDialog.open) cartDialog.showModal();
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
  const addCart = document.createElement('button');
  addCart.className = 'cart-action';
  addCart.type = 'button';
  addCart.textContent = '＋ 加入租借清單';
  addCart.addEventListener('click', () => {
    addToCart(product.id);
    addCart.textContent = '✓ 已加入清單';
  });
  const official = document.createElement('a');
  official.className = 'official-action';
  official.href = product.sourceUrl;
  official.target = '_blank';
  official.rel = 'noopener noreferrer';
  official.textContent = '在橙攝官方頁面開啟 ↗';
  actions.append(favorite, addCart, official);
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
element('cartButton').addEventListener('click', openCart);
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
cartDialog.addEventListener('click', (event) => { if (event.target === cartDialog) cartDialog.close(); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js');
initialise();
