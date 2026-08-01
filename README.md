# QueueCast

以手機 QR code 連接播放端的 YouTube 即時點播器。每個播放端使用 UUID 建立獨立房間，操控端可加入、排序、移除播放清單並操作播放、暫停、上一首、下一首、進度與音量。清單播完後會自動從播放紀錄接續。

## 本機執行

```bash
npm install
npx convex dev
npm run dev
```

## GitHub Pages

1. 在 Convex Dashboard 建立 Production Deploy Key。
2. 到 GitHub repo 的 Settings → Secrets and variables → Actions，新增 `CONVEX_DEPLOY_KEY`。
3. Settings → Pages 的 Source 選擇 GitHub Actions。
4. Push 到 `main`，workflow 會先部署 Convex，再建置並發布 Pages。
