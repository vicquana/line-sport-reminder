# LINE 45 分鐘活動提醒 Bot

這是一個部署在 Cloudflare Workers 的 LINE 群組 Bot。它會在指定時段內每 45 分鐘提醒參加者做 10 下深蹲與喝水，並在 5、10 分鐘後只標註尚未回覆的成員。

提醒卡片提供兩個不會因群組新訊息而消失的 Flex Message 按鈕：

- `✅ 完成`：記為完成，停止本輪提醒。
- `⏭ 本輪跳過`：本輪停止提醒，下一輪自動恢復。

## 已實作功能

- LINE Webhook HMAC-SHA256 簽章驗證。
- `webhookEventId` 防重複處理；失敗事件可由 LINE 重新傳送。
- Bot 加入／離開群組與成員離開事件處理。
- 成員自行輸入「參加」或按下完成按鈕後登記。
- 第一位輸入「開始提醒」的成員成為群組管理者。
- 每 45 分鐘建立回合；預設只在台北時間 09:00–18:00 執行。
- 第 5、10 分鐘使用 LINE `textV2` mention 尚未回覆者。
- 完成、本輪跳過、過期回合與重複操作處理。
- D1 資料保存、Cron 排程、結構化錯誤日誌。

## 群組指令

| 指令         | 用途                           |
| ------------ | ------------------------------ |
| `參加`       | 加入提醒名單                   |
| `退出`       | 離開提醒名單                   |
| `OK`、`完成` | 完成目前回合                   |
| `跳過`       | 跳過目前回合                   |
| `狀態`       | 查看目前回合統計               |
| `說明`       | 顯示指令                       |
| `開始提醒`   | 啟用排程；首次使用者成為管理者 |
| `暫停提醒`   | 管理者暫停排程                 |
| `立即提醒`   | 管理者立刻建立一輪             |

## 技術架構

- Cloudflare Workers：Webhook 與排程邏輯。
- Cloudflare D1：群組、成員、回合與回覆狀態。
- Cron Trigger：每 5 分鐘檢查 `next_run_at`，不使用不正確的 `*/45` cron。
- LINE Messaging API：群組 Push、Reply、Flex Message、Postback、Mention。

## 開始部署

請完整依照 [LINE 與 Cloudflare 設定步驟](./docs/SETUP.md) 操作。

開發指令：

```bash
pnpm install
pnpm run check
pnpm run dev
```

本機測試 Webhook 需要有效簽章；排程可在 `wrangler dev --test-scheduled` 啟動後呼叫：

```bash
curl "http://localhost:8787/cdn-cgi/handler/scheduled?format=json"
```

## 安全注意事項

- 不要把 Channel Secret 或 Channel Access Token 寫進 Git。
- `.env`、`.env.*`、`.dev.vars` 與 `.dev.vars.*` 已列入 `.gitignore`；真正密鑰只能放在本機或 Cloudflare Secrets。
- 正式環境使用 `wrangler secret put` 保存密鑰。
- Webhook 只接受簽章正確的 LINE 請求。
- 管理員權限以 LINE `userId` 保存，不依賴可變更的顯示名稱。
