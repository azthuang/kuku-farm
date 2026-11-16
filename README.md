# 九九農場

給 7 歲小朋友練習九九乘法的種田遊戲。每出一題 a × b，田裡就長出 a 排、每排 b 個作物，答對就把整塊長方形作物收成，一級一級解鎖新作物。介面全是繁體中文，少字多圖示，專為手機和平板直向畫面設計。沒有廣告、沒有追蹤，也不會連到外部網站；進度只存在這台裝置的瀏覽器裡。

## 本機開發

```bash
npm ci
npm run dev    # 開發伺服器
npm test       # 執行測試
npm run build  # 建置到 dist/
```

## 部署到 GitHub Pages

1. 把專案推到 GitHub 儲存庫（名稱 `kuku-farm`）的 `main` 分支。
2. 到儲存庫 **Settings → Pages → Source**，選擇 **GitHub Actions**。
3. 之後每次 push 到 `main`，`.github/workflows/deploy.yml` 會自動測試、建置並發布。

存檔已升到 v3，舊版程式讀到會當成較新版本、改為唯讀；不要把 main 回退到這次合併之前，有問題請往前修（fix forward）。

注意：免費帳號的 GitHub Pages 需要儲存庫是公開（public）的。若有 GitHub Pro，也可以保留私有儲存庫、只公開網站。

網址格式：`https://<帳號>.github.io/kuku-farm/`
