# 橙攝器材查價 PWA

這是個人使用、手機優先的橙攝公開器材價目查詢網站。它將公開的分類、品名、每日租金、押金、本票金額、公開詳情、內附配件與原始連結重新整理為容易在 Android 手機閱讀的介面。

> 價格、可租狀態、預約與租賃條件一律以橙攝官方網站為準。本工具不登入、不預約，也不儲存任何帳號或個資。

## 租借準備清單與預估

- 在器材卡片或詳情頁按「加入清單」，右上角的「清單」會顯示已加入的器材數量。
- 以「全體預設租期」統一估價，透過加減按鈕調整天數；同一器材在清單中固定為一件，基本日租預估為「每日租金 × 天數」。
- 押金與本票金額會分開合計，不混入日租預估；清單可加備註、下載為文字，或透過手機列印功能另存 PDF。
- 清單只保存在目前手機／瀏覽器，不會傳送到橙攝；請依每項的官方頁面完成實際預約。
- 長租優惠、個案報價、運費、搭配限制與庫存不會自動計算，最終仍以橙攝官方確認為準。

## 網站結構

- `app/`：GitHub Pages 實際發布的 PWA 網站。
- `app/catalog.html`：每日產生、可供各搜尋引擎直接讀取的靜態器材目錄。
- `sitemap.xml`：提交給搜尋引擎的網站地圖。
- `app/data/catalog.json`：目前完整的公開價目與品項詳情。
- `scripts/update-catalog.mjs`：低頻率取得公開分類與詳情頁，並建立資料檔。
- `scripts/generate-seo.mjs`：由價目資料產生靜態目錄與 Sitemap。
- `scripts/submit-indexnow.mjs`：價目更新後通知支援 IndexNow 的搜尋引擎。
- `.github/workflows/update-catalog.yml`：每天台灣時間約 11:17 執行更新；也可在 GitHub Actions 手動執行。

## 本機檢查

```bash
node scripts/check-catalog.mjs
node scripts/generate-seo.mjs
node scripts/check-seo.mjs
python3 -m http.server 4173 --directory app
```

開啟 `http://127.0.0.1:4173/` 後，可在桌面瀏覽器檢查版面。

## 日後資料維護

1. 日常不需要手動操作；GitHub Actions 每日會執行一次。
2. 若要立即更新：GitHub 儲存庫 → **Actions** → **每日更新橙攝價目資料** → **Run workflow**。
3. 更新程式先完成資料完整性檢查，才會覆蓋舊的 `catalog.json`。若官方網站暫時無法讀取，上一份可用資料會保留。
4. 若官方網站版面改變，先在本機執行 `node scripts/update-catalog.mjs` 檢視錯誤，再調整 `scripts/update-catalog.mjs` 的解析規則。

## Android 安裝

請見 [Android 安裝與測試](docs/Android安裝與測試.md)。
