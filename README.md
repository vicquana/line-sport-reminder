# LINE 45 分鐘活動提醒 Bot

這是一個部署在 Cloudflare Workers 的 LINE 群組 Bot，預設以台灣時間每天 09:00–18:00 運作。管理者啟用排程後，Bot 每 45 分鐘建立一個活動回合，提醒群組成員做 10 下深蹲、喝水，並追蹤參加者是否完成。

目前版本以台灣使用情境為主。時區與運作時段保存在每個群組的 D1 資料中，但尚未提供群組指令或設定頁調整。

## 使用流程

1. 將 LINE Official Account Bot 邀入群組。
2. 每位想收到後續標註提醒的成員輸入 `參加`。
3. 第一位輸入 `開始提醒` 的成員會成為該群組管理者並啟用排程。
4. 在台灣時間 09:00–18:00 內，下一次 Cron 檢查會建立第一輪；Cron 每 5 分鐘執行一次。
5. 想立即測試訊息與按鈕時，管理者可輸入 `立即提醒`。
6. 管理者輸入 `暫停提醒` 後，Bot 會停止新回合並關閉目前回合。

`參加`只會加入提醒名單，不會啟用排程；`OK`／`完成`只用來完成已經開始的回合。

## 已實作功能

### 群組與參加者

- 處理 Bot 加入／離開群組及成員加入／離開事件。
- 成員可自行加入、退出提醒名單。
- 讀取 LINE 群組成員顯示名稱；讀取失敗時使用匿名替代名稱。
- 第一位啟用排程的成員成為群組管理者。
- 只有管理者可以開始、暫停或立即發起提醒。

### 活動回合

- 預設每 45 分鐘建立一輪。
- 回合開始時發送 `@All` 文字與 Flex Message 活動卡片。
- 卡片提供 `✅ 完成` 與 `⏭ 本輪跳過` 兩個 Postback 按鈕。
- 第 5、10 分鐘使用 LINE `textV2` mention 尚未回覆的參加者。
- 預設第 15 分鐘關閉回合。
- `跳過`只影響目前回合，下一輪會恢復提醒。
- `狀態`可查看完成、跳過、未回覆與參加者人數。

### 安全與可靠性基礎

- 使用 HMAC-SHA256 驗證 LINE `x-line-signature`。
- 使用 `webhookEventId` 防止同一 webhook 重複處理。
- 處理失敗時釋放 webhook event claim，允許 LINE redelivery 再次處理。
- 使用 D1 保存群組、參加者、回合與回覆狀態。
- 使用條件式 D1 update claim 排程與後續提醒，降低重複 Cron 執行造成的重複送出。
- LINE Channel Secret 與 Channel Access Token 由 Cloudflare Secrets 提供，不寫入原始碼。
- 啟用 Cloudflare Workers observability，排程與錯誤使用結構化 JSON log。

## 群組指令

| 指令 | 可使用者 | 用途 |
|---|---|---|
| `參加`、`加入`、`join` | 所有成員 | 加入後續提醒名單 |
| `退出`、`離開`、`leave` | 所有成員 | 離開提醒名單 |
| `OK`、`完成`、`done` | 所有成員 | 完成目前回合 |
| `跳過`、`skip` | 所有成員 | 本輪不再提醒，下一輪恢復 |
| `狀態`、`status` | 所有成員 | 查看目前回合或排程狀態 |
| `說明`、`help`、`指令` | 所有成員 | 顯示指令說明 |
| `開始提醒`、`開始` | 管理者；首次使用者會成為管理者 | 啟用排程 |
| `暫停提醒`、`暫停` | 管理者 | 暫停排程並關閉目前回合 |
| `立即提醒`、`現在提醒` | 管理者 | 不等待定時排程，立即建立一輪 |

指令必須是整則訊息的內容；Bot 會忽略一般群組聊天。

## 預設排程

| 設定 | 預設值 | 實際行為 |
|---|---:|---|
| 時區 | `Asia/Taipei` | 活動時段判斷及卡片截止時間顯示 |
| 每日活動時段 | `09:00–18:00` | 只有此區間會建立定時新回合；結束時間不包含 18:00 |
| 回合間隔 | 45 分鐘 | 從上次成功 claim 排程的 Cron 時間往後計算 |
| 未回覆提醒間隔 | 5 分鐘 | 預設在第 5、10 分鐘提醒 |
| 最多後續提醒 | 2 次 | 第 15 分鐘關閉回合 |
| Cron Trigger | 每 5 分鐘 | 所有時間都以近似值執行，不保證整點或秒級準時 |

`wrangler.jsonc` 的 `DEFAULT_*` 只套用到第一次被 Bot 看見的新群組。既有群組會沿用 D1 已保存的設定；單純修改 `wrangler.jsonc` 不會更新既有資料。

若回合在 18:00 前開始，該回合的第 5、10 分鐘後續提醒仍可能在 18:00 之後送出。

## 訊息與資料流程

```text
LINE webhook
  → 驗證簽章
  → claim webhookEventId
  → 解析群組指令／Postback
  → 更新 D1
  → 使用 reply API 回覆

Cloudflare Cron（每 5 分鐘）
  → 查詢到期且已啟用的群組
  → 檢查群組時區與活動時段
  → claim 下一次執行時間
  → 建立回合並使用 LINE push API 發送
  → 處理開放回合的未回覆者提醒
```

## 技術架構

- Cloudflare Workers：Webhook、HTTP health check 與 scheduled handler。
- Cloudflare D1：群組、參加者、回合、回覆及 webhook 去重資料。
- Cloudflare Cron Triggers：每 5 分鐘喚醒排程，不使用無法正確表達每 45 分鐘間隔的 `*/45` cron。
- LINE Messaging API：Reply、Push、Flex Message、Postback 與 `textV2` Mention。
- TypeScript、Vitest、Wrangler 4、pnpm；Node.js 由 fnm 管理。

## 資料表

| 資料表 | 用途 |
|---|---|
| `groups` | 群組管理者、啟用狀態、時區、活動時段與排程參數 |
| `participants` | 群組參加者、顯示名稱與是否仍啟用 |
| `rounds` | 每一活動回合、截止時間與提醒階段 |
| `responses` | 參加者在各回合的完成／跳過紀錄 |
| `webhook_events` | LINE webhook event 去重 |

## 已知限制

### 使用與設定

- 只處理 `source.type === "group"` 的事件；一對一聊天室與舊式 multi-person room 不會回覆。
- 沒有群組內的間隔、活動時段或時區設定指令，也沒有 LIFF 設定頁；目前只能透過部署設定與 D1 管理。
- LINE webhook 與成員 profile 不提供可靠時區，因此目前不會自動偵測使用者時區。
- 卡片標題與部分回覆文字寫死為「45 分鐘」。直接在 D1 修改 `interval_minutes` 雖會改變排程，但顯示文字不會同步，尚不算完整支援自訂間隔。
- `開始提醒`在活動時段外仍會回覆「5 分鐘內開始第一輪」，但實際上會等到下一個台灣時間活動時段。這是目前的已知文案問題。
- `立即提醒`不會自動啟用已暫停的排程；若群組仍是暫停狀態，初始卡片雖可送出，該回合會在下一次 Cron 被關閉，不會有第 5、10 分鐘後續提醒。
- 初始活動訊息使用 `@All`，會通知並顯示給群組所有成員；只有第 5、10 分鐘的後續標註會依參加名單篩選。
- 一般未認證官方帳號無法使用完整群組成員 ID 清單 API，因此每位成員必須自行輸入 `參加`，或透過按鈕／完成指令被 Bot 識別。
- 參加者不是在回合開始時建立快照。回合進行中才加入的人，可能收到該輪後續標註；退出的人會從該輪統計移除。

### 管理與資料生命週期

- 每個群組只有一位管理者，沒有轉移、重設或多管理者功能。原管理者離開群組後，其他人目前無法接任。
- `webhook_events` 尚無清理機制，長期運作時資料會持續累積。
- 沒有使用者可查詢的歷史報表、每日統計或資料刪除指令。

### 排程與送達保證

- Cron 每 5 分鐘執行，因此「第 5 分鐘」與「每 45 分鐘」是最多受 Cron 粒度及平台排程延遲影響的近似時間，不是精準計時器。
- 建立新回合時會先更新下一次執行時間，再呼叫 LINE push API。若 LINE 暫時失敗，該回合會關閉，但下一次自動嘗試可能要等完整回合間隔。
- 後續提醒會先 claim 提醒階段，再呼叫 LINE push API。若該次 push 失敗，目前不會自動重送同一階段。
- 沒有針對 LINE `429`、`5xx`、網路錯誤或訊息額度不足做退避重試。
- 建立回合採先查詢再新增；排程與 `立即提醒` 高度並行時，資料庫尚無每群組僅一個開放回合的唯一約束，理論上可能建立重複回合。
- LINE 群組 push 訊息會顯示給整個群組，訊息用量按群組中可收到訊息的人數計算，不是只按參加者人數計算。

### 測試範圍

- 現有測試涵蓋指令解析、Postback、簽章、時間判斷與訊息產生。
- 尚未使用 `@cloudflare/vitest-pool-workers` 建立 D1、Webhook 與 scheduled handler 的整合測試。
- 排程 claim、推播失敗、並行建立回合及管理者離群等關鍵情境目前沒有自動化測試。

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

啟動 `pnpm run dev` 後，可手動觸發 scheduled handler：

```bash
curl "http://localhost:8787/cdn-cgi/handler/scheduled?format=json"
```

## 部署

完整步驟請見 [LINE 與 Cloudflare 設定文件](./docs/SETUP.md)。基本流程：

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

部署後必須在 LINE Developers Console：

- 將 Webhook URL 指向 Worker 的 `/webhook`。
- 啟用 `Use webhook`、`Webhook redelivery` 與 `Allow bot to join group chats`。
- 關閉 LINE Official Account Manager 的 Greeting messages 與 Auto-reply messages，避免重複回覆。

## 故障排除

### 已輸入「參加」，但沒有定時提醒

1. `參加`只加入名單；確認管理者另外輸入過 `開始提醒`。
2. 輸入 `狀態`，確認排程顯示「執行中」。
3. 確認目前是否為台灣時間 09:00–18:00。
4. 由管理者輸入 `立即提醒`，分辨是 Cron／時段問題，還是 LINE push 問題。
5. 在 Cloudflare 查看 Cron Events 與 Workers Logs；設定變更部署後可能需要一段時間傳播。

### `OK` 回覆「目前沒有進行中的活動回合」

`OK`是完成指令，不會建立活動。請先等待定時回合，或請管理者輸入 `立即提醒`。

### Webhook 正常回覆，但定時 push 沒有送出

- 確認部署環境有正確的 `LINE_CHANNEL_ACCESS_TOKEN`。
- 確認 Bot 仍在該群組。
- 使用 `pnpm wrangler tail` 或 Workers Logs 搜尋 `scheduled_group_failed`、`round_reminder_failed`。
- 檢查 LINE Official Account 訊息額度與 Messaging API 回應狀態。

### 某位成員沒有被後續標註

請該成員輸入 `參加`。Bot 不會把所有群組成員自動加入名單。

## 安全注意事項

- 不要把 Channel Secret 或 Channel Access Token 寫入 Git、README、`.env.example` 或 `wrangler.jsonc`。
- `.env`、`.env.*`、`.dev.vars` 與 `.dev.vars.*` 已加入 `.gitignore`；正式環境使用 Cloudflare Secrets。
- Webhook 必須先驗證 LINE 簽章，不能以來源 IP allowlist 取代。
- 管理者權限以 LINE `userId` 保存，不依賴可修改的顯示名稱。

## 官方文件

- [LINE：Receive messages (webhook)](https://developers.line.biz/en/docs/messaging-api/receiving-messages/)
- [LINE：Send messages](https://developers.line.biz/en/docs/messaging-api/sending-messages/)
- [LINE：Group chats](https://developers.line.biz/en/docs/messaging-api/group-chats/)
- [LINE：Messaging API reference](https://developers.line.biz/en/reference/messaging-api/nojs/)
- [Cloudflare：Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Cloudflare：D1 Worker API](https://developers.cloudflare.com/d1/worker-api/)
- [Cloudflare：Workers Best Practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
