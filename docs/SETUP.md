# LINE 與 Cloudflare 設定步驟

以下分成 Cloudflare 部署與 LINE 後台設定。請依順序操作；完成後不需要保持電腦開機。

## 一、準備條件

你需要：

- Cloudflare 帳號。
- LINE Official Account 管理權限。
- 已為該官方帳號啟用 Messaging API。
- LINE Developers Console 中對應的 Messaging API Channel。
- 本機已安裝 `fnm` 與 `pnpm`。

如果尚未啟用 Messaging API，請先進入 [LINE Official Account Manager](https://manager.line.biz/)，選擇官方帳號，從設定中的 Messaging API 啟用。現在不能直接在 LINE Developers Console 新建 Messaging API Channel；啟用官方帳號的 Messaging API 時會建立 Channel。

## 二、下載 Node 套件

在專案目錄執行：

```bash
fnm use 24
pnpm install
```

確認 Wrangler 版本：

```bash
pnpm wrangler --version
```

應為 Wrangler 4.x 或更新版本。

## 三、登入 Cloudflare

```bash
pnpm wrangler login
```

瀏覽器會開啟 Cloudflare 授權頁。登入並允許 Wrangler 存取帳號。

確認登入：

```bash
pnpm wrangler whoami
```

## 四、建立 D1 資料庫

```bash
pnpm wrangler d1 create line-sport-reminder-db
```

命令會輸出類似：

```text
database_name = "line-sport-reminder-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

開啟 `wrangler.jsonc`，將：

```json
"database_id": "REPLACE_WITH_YOUR_D1_DATABASE_ID"
```

換成剛才取得的 `database_id`。

套用正式資料庫 Migration：

```bash
pnpm wrangler d1 migrations apply line-sport-reminder-db --remote
```

看到詢問是否套用時選擇 `Yes`。

## 五、從 LINE 取得兩個密鑰

進入 [LINE Developers Console](https://developers.line.biz/console/)：

1. 選擇正確的 Provider。
2. 選擇官方帳號對應的 Messaging API Channel。
3. 在 `Basic settings` 找到 `Channel secret`。
4. 在 `Messaging API` 頁籤發行 Channel access token。

第一版可使用 Console 提供的長期 Channel Access Token；正式長期營運可再改用 LINE 建議的 Channel Access Token v2.1。

不要將這兩個值貼到 `.dev.vars.example` 或 `wrangler.jsonc`。

## 六、把 LINE 密鑰存入 Cloudflare

依序執行：

```bash
pnpm wrangler secret put LINE_CHANNEL_SECRET
pnpm wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
```

每個命令會等待你貼上密鑰。貼上後按 Enter；密鑰不會寫進 Git。

## 七、部署 Worker

先做完整檢查：

```bash
pnpm run check
pnpm run deploy:dry
```

部署：

```bash
pnpm wrangler deploy
```

部署完成後會顯示網址，例如：

```text
https://line-sport-reminder.<你的-subdomain>.workers.dev
```

先在瀏覽器開啟：

```text
https://line-sport-reminder.<你的-subdomain>.workers.dev/health
```

正確結果：

```json
{"status":"ok","service":"line-sport-reminder"}
```

## 八、設定 LINE Webhook

回到 LINE Developers Console 的 Messaging API Channel：

1. 找到 `Webhook URL`。
2. 填入 Worker 網址加 `/webhook`：

   ```text
   https://line-sport-reminder.<你的-subdomain>.workers.dev/webhook
   ```

3. 按 `Verify`，應顯示成功。
4. 開啟 `Use webhook`。
5. 建議開啟 `Webhook redelivery`。
6. 開啟 `Allow bot to join group chats`。

注意：同一個 LINE 群組同時只能有一個官方帳號 Bot。

## 九、關閉重複自動回覆

進入 [LINE Official Account Manager](https://manager.line.biz/)：

1. 選擇這個官方帳號。
2. 進入回應設定。
3. 關閉 `Auto-reply messages／自動回應訊息`。
4. 建議先關閉 `Greeting messages／加入好友歡迎訊息`，避免測試時混淆。
5. 保持 Messaging API／Webhook 模式啟用。

## 十、建立 LINE 群組並開始使用

1. 用一般 LINE 個人帳號建立群組。
2. 先將官方帳號加為好友，方便從好友清單邀請。
3. 將官方帳號邀請進群組。
4. Bot 應立即發送加入說明。
5. 每位參加者輸入：

   ```text
   參加
   ```

6. 由你輸入：

   ```text
   開始提醒
   ```

   第一位成功輸入這個指令的人會成為本群提醒管理者。

7. 想立刻測試按鈕時輸入：

   ```text
   立即提醒
   ```

8. 群組會收到 `@All` 與活動卡片：
   - `✅ 完成`
   - `⏭ 本輪跳過`

## 十一、預設排程

預設設定在 `wrangler.jsonc`：

```json
"DEFAULT_TIMEZONE": "Asia/Taipei",
"DEFAULT_ACTIVE_START": "09:00",
"DEFAULT_ACTIVE_END": "18:00"
```

行為如下：

- 台北時間每日 09:00–18:00 運作。
- 每 45 分鐘一輪。
- 第 5 分鐘提醒尚未回覆者。
- 第 10 分鐘最後提醒。
- 第 15 分鐘關閉該輪。
- `本輪跳過` 只影響目前回合，下一輪自動恢復。

修改 `wrangler.jsonc` 的預設值只影響之後首次加入的新群組。已存在群組的設定保存在 D1。

## 十二、驗收清單

逐項確認：

- [ ] `/health` 回傳 `status: ok`。
- [ ] LINE Webhook Verify 成功。
- [ ] `Use webhook` 已開啟。
- [ ] `Webhook redelivery` 已開啟。
- [ ] `Allow bot to join group chats` 已開啟。
- [ ] 官方帳號可以加入群組。
- [ ] 成員輸入「參加」會收到確認。
- [ ] 管理者輸入「立即提醒」會出現兩按鈕卡片。
- [ ] 點「完成」後狀態顯示完成。
- [ ] 點「本輪跳過」後本輪不再標註該成員。
- [ ] 輸入「狀態」會顯示正確人數。
- [ ] 輸入「暫停提醒」後不再建立新回合。

## 十三、常見問題

### Verify 顯示失敗

依序檢查：

- URL 結尾是否為 `/webhook`。
- Worker 是否已成功部署。
- `LINE_CHANNEL_SECRET` 是否屬於同一個 Messaging API Channel。
- 使用 `pnpm wrangler tail` 查看即時錯誤日誌。

### 群組收不到定時訊息

- 檢查是否有人輸入「開始提醒」。
- 輸入「狀態」確認排程不是暫停。
- 確認目前時間是否在台北時間 09:00–18:00。
- 使用「立即提醒」排除時段因素。
- Cron Trigger 部署後可能需要幾分鐘才會在全球生效。

### 某位成員沒有被後續標註

請該成員先輸入「參加」。一般未認證官方帳號不能主動列出所有既有群組成員，因此 Bot 只能追蹤曾透過 Webhook 被識別且已登記的成員。

### 為什麼群組沒有 Rich Menu？

Rich Menu 顯示在使用者與官方帳號的一對一聊天室，不是群組的固定選單。因此本專案在群組提醒訊息內使用 Flex Message 的兩個持久按鈕。未來若加入「今天休息／個人紀錄」，可另外建立一對一 Rich Menu。

## 官方參考文件

- [LINE：Build a bot](https://developers.line.biz/en/docs/messaging-api/building-bot/)
- [LINE：Group chats](https://developers.line.biz/en/docs/messaging-api/group-chats/)
- [LINE：Webhook](https://developers.line.biz/en/docs/messaging-api/receiving-messages/)
- [LINE：Messaging API reference](https://developers.line.biz/en/reference/messaging-api/nojs/)
- [Cloudflare：Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Cloudflare：D1 Worker API](https://developers.cloudflare.com/d1/worker-api/)
