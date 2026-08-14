# LINE 45 分鐘活動提醒 Bot

這是一個部署在 Cloudflare Workers 的 LINE 群組 Bot。它以台灣使用情境為主，預設在台灣時間每日 09:00–18:00 運作；啟用後每 45 分鐘發送一則活動提醒，請大家做 10 下深蹲並喝水。

目前只保留每 45 分鐘一次的主提醒。舊版第 5、10 分鐘針對未回覆者的追催提醒已停用。

## 使用流程

1. 將 LINE Official Account Bot 邀入群組。
2. 想參與紀錄的成員輸入 `參加`。
3. 第一位輸入 `開始提醒` 的成員會成為本群管理者並啟用排程。
4. 台灣時間 09:00–18:00 內，Bot 會在下一次 Cron 檢查時開始第一輪，之後約每 45 分鐘提醒一次。
5. 管理者可輸入 `立即提醒` 測試訊息；排程暫停時必須先輸入 `開始提醒`。
6. 管理者輸入 `暫停提醒` 後，Bot 會停止新回合並關閉目前回合。

`參加`只會加入活動與統計名單，不會啟用排程；`OK`／`完成`只會完成已經開始的回合。

## 功能

### 提醒與回覆

- 台灣時間每日 09:00–18:00 運作。
- 每 45 分鐘建立一輪，只發送一則主提醒，不發第 5、10 分鐘追催訊息。
- 主提醒包含 `@All` 文字及 Flex Message 活動卡片。
- 卡片提供 `✅ 完成` 與 `⏭ 本輪跳過` 兩個 Postback 按鈕。
- 回合維持約 45 分鐘，下一輪開始時結束上一輪。
- `狀態`可查看完成、跳過、尚未回覆與參加者人數。

### 群組與權限

- 成員可以加入或退出活動名單。
- 第一位啟用排程的成員成為群組管理者。
- 只有管理者可以開始、暫停或立即發起提醒。
- 管理者離開群組時會自動暫停排程並釋放管理權，其他成員之後可輸入 `開始提醒` 接任。
- Bot 離開群組時會停用群組並清除管理者。
- 暫停狀態下拒絕 `立即提醒`，避免送出無法正常維持的回合。

### 可靠性與安全

- 使用 HMAC-SHA256 驗證 LINE `x-line-signature`。
- 使用 `webhookEventId` 防止同一 webhook 重複處理；處理失敗會釋放 claim 供 LINE redelivery 重試。
- 排程使用條件式 D1 update claim，降低重複 Cron 執行。
- D1 partial unique index 保證每個群組最多只有一個開放回合。
- LINE push 遇到網路錯誤或 5xx 時最多嘗試三次，所有嘗試使用同一個 `X-Line-Retry-Key`；409 代表先前相同請求已被接受。
- 三次 push 都失敗時會關閉未送達回合，將下一次排程改為約 5 分鐘後重試，不會再等完整 45 分鐘。
- LINE Channel Secret 與 Access Token 使用 Cloudflare Secrets，不寫入原始碼。

## 群組指令

| 指令 | 可使用者 | 用途 |
|---|---|---|
| `參加`、`加入`、`join` | 所有成員 | 加入活動與統計名單 |
| `退出`、`離開`、`leave` | 所有成員 | 離開活動與統計名單 |
| `OK`、`完成`、`done` | 所有成員 | 完成目前回合 |
| `跳過`、`skip` | 所有成員 | 記錄本輪跳過；不影響下一輪 |
| `狀態`、`status` | 所有成員 | 查看目前回合或排程狀態 |
| `說明`、`help`、`指令` | 所有成員 | 顯示指令說明 |
| `開始提醒`、`開始` | 管理者；首次使用者會成為管理者 | 啟用排程 |
| `暫停提醒`、`暫停` | 管理者 | 暫停排程並關閉目前回合 |
| `立即提醒`、`現在提醒` | 已啟用排程的管理者 | 立即建立一輪 |

指令必須是整則訊息的內容；Bot 會忽略一般群組聊天。

## 排程與時區

| 設定 | 值 | 行為 |
|---|---:|---|
| 時區 | `Asia/Taipei` | 判斷活動時段及顯示截止時間 |
| 每日活動時段 | `09:00–18:00` | 只有此區間會建立定時新回合；18:00 不包含在內 |
| 主提醒間隔 | 45 分鐘 | 固定值，暫不提供群組內調整 |
| 後續追催提醒 | 關閉 | 不再發送第 5、10 分鐘訊息 |
| Cron Trigger | 每 5 分鐘 | 用來檢查是否到期，因此實際送出可能有數分鐘誤差 |

LINE webhook 與群組成員 profile 不提供可靠的使用者時區，因此 Bot 無法自動知道每位成員的時區。這個版本明確以台灣時間運作，不需要使用者另外設定時區。

`wrangler.jsonc` 的 `DEFAULT_TIMEZONE`、`DEFAULT_ACTIVE_START`、`DEFAULT_ACTIVE_END` 只套用到第一次被 Bot 看見的新群組；既有群組沿用 D1 內的資料。

## 資料與訊息流程

```text
LINE webhook
  → 驗證簽章與 webhookEventId 去重
  → 解析群組指令／Postback
  → 更新 D1
  → 使用 reply API 回覆

Cloudflare Cron（每 5 分鐘）
  → 關閉過期或已停用群組的回合
  → 查詢到期且已啟用的群組
  → 依 Asia/Taipei 檢查 09:00–18:00
  → 原子 claim 下一次執行時間
  → 建立唯一開放回合
  → 使用 retry key 呼叫 LINE push API
```

## 技術架構

- Cloudflare Workers：Webhook、health check 與 scheduled handler。
- Cloudflare D1：群組、參加者、回合、回覆及 webhook 去重資料。
- Cloudflare Cron Triggers：每 5 分鐘喚醒排程。
- LINE Messaging API：Reply、Push、Flex Message、Postback 與 `textV2` `@All`。
- TypeScript、Vitest、Wrangler、pnpm；Node.js 由 fnm 管理。

## 資料表

| 資料表 | 用途 |
|---|---|
| `groups` | 管理者、啟用狀態、時區、活動時段與下次執行時間 |
| `participants` | 群組參加者、顯示名稱與是否啟用 |
| `rounds` | 活動回合、開始／截止時間與狀態 |
| `responses` | 各回合的完成／跳過紀錄 |
| `webhook_events` | LINE webhook event 去重 |

`migrations/0002_single_45_minute_reminders.sql` 會把既有群組統一調整為 45 分鐘、關閉後續提醒設定、清理重複開放回合，並加入每群組唯一開放回合的 partial unique index。

## 限制

- 只處理 LINE `source.type === "group"`；一對一聊天室及舊式 multi-person room 不回覆。
- 沒有群組內的時區、活動時段或間隔設定指令，也沒有 LIFF 設定頁。
- 無法自動偵測成員時區；目前固定服務台灣使用者。
- 主訊息使用 `@All`，會顯示並通知群組內所有可收訊息的成員；`參加`名單主要用於是否建立回合及完成統計。
- LINE 群組 push 用量依群組中可收到訊息的人數計算，不只依參加名單人數計算。
- 一般未認證官方帳號不能完整列出既有群組成員，因此成員仍需自行輸入 `參加` 或透過按鈕讓 Bot 識別。
- 參加者不是在回合開始時建立快照；回合中加入或退出會影響本輪統計。
- 每個群組只有一位管理者，尚無手動轉移或多管理者功能；自動接任依賴 LINE 成功送達 `memberLeft` webhook。
- Cron 是近似排程，不保證秒級或剛好每 45:00 送出。
- Push 只自動重試網路錯誤與 5xx；權限、訊息額度、無效 payload、429 等 4xx 必須先修正原因。
- 所有安全重試都失敗且網路狀態不明時，無法提供端到端 exactly-once 保證，但 retry key 已降低重複送出的風險。
- `webhook_events` 尚無定期清理機制，長期運作資料會持續增加。
- 沒有歷史報表、每日統計或使用者資料刪除指令。
- 目前單元測試涵蓋指令、簽章、推送重試、時間、開始文案與訊息；尚未加入使用真實 D1／scheduled handler 的 Workers 整合測試。

## 本機開發

需求：fnm、Node.js 24、pnpm。

```bash
fnm use 24
pnpm install
pnpm run check
pnpm run dev
```

本機密鑰放在不提交 Git 的 `.dev.vars`：

```dotenv
LINE_CHANNEL_SECRET=你的-channel-secret
LINE_CHANNEL_ACCESS_TOKEN=你的-channel-access-token
```

手動觸發本機 scheduled handler：

```bash
curl "http://localhost:8787/cdn-cgi/handler/scheduled?format=json"
```

## 部署

完整步驟請見 [LINE 與 Cloudflare 設定文件](./docs/SETUP.md)。

```bash
fnm use 24
pnpm install
pnpm run check
pnpm run deploy:dry
pnpm wrangler d1 migrations apply line-sport-reminder-db --remote
pnpm wrangler secret put LINE_CHANNEL_SECRET
pnpm wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
pnpm wrangler deploy
```

既有環境必須套用最新 D1 migration，否則重複回合防護不會生效。

## 故障排除

### 已經超過 45 分鐘，但沒有提醒

1. `參加`只加入名單；確認管理者另外輸入過 `開始提醒`。
2. 輸入 `狀態`，確認排程顯示「執行中」。
3. 確認目前是台灣時間 09:00–18:00。
4. 確認已部署 Cron Trigger 並套用最新 D1 migration。
5. 管理者輸入 `立即提醒`，判斷是排程／時段問題或 LINE push 問題。
6. 在 Workers Logs 搜尋 `scheduled_group_failed` 或 `line_push_retry`。
7. 檢查 Access Token、Bot 是否仍在群組，以及 LINE Official Account 訊息額度。

### `OK` 顯示沒有進行中的回合

`OK`不會建立活動。請等待定時回合，或由已啟用排程的管理者輸入 `立即提醒`。

### `立即提醒`要求先開始提醒

這代表排程目前暫停。由管理者輸入 `開始提醒` 後即可再次使用。

## 安全注意事項

- 不要把 Channel Secret 或 Access Token 寫入 Git、README、`.env.example` 或 `wrangler.jsonc`。
- 本機使用 `.dev.vars`；正式環境使用 Cloudflare Secrets。
- Webhook 必須驗證 LINE 簽章，不能用來源 IP allowlist 取代。
- 管理者權限以 LINE `userId` 保存，不依賴可修改的顯示名稱。

## 官方文件

- [LINE：Retrying failed API requests](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/)
- [LINE：Receive messages](https://developers.line.biz/en/docs/messaging-api/receiving-messages/)
- [LINE：Send messages](https://developers.line.biz/en/docs/messaging-api/sending-messages/)
- [LINE：Group chats](https://developers.line.biz/en/docs/messaging-api/group-chats/)
- [Cloudflare：Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Cloudflare：D1 Worker API](https://developers.cloudflare.com/d1/worker-api/)
- [Cloudflare：Workers Best Practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
