# 考選部「最新消息」RSS

只讀取考選部「最新消息」，不包含「最新考試公告」。

- 官方來源：https://wwwc.moex.gov.tw/main/news/wfrmNews.aspx?kind=3&menu_id=42
- RSS 路徑：`/rss.xml`
- 健康檢查：`/health`
- 快取更新：每次請求最多每 15 分鐘更新一次

## Render 部署
1. 將本資料夾內容上傳到 GitHub Repository。
2. Render 選 **New → Web Service**，連接該 Repository。
3. Runtime 選 **Docker**，再建立服務。
4. 等狀態顯示 Live。
5. RSS 網址為 `https://你的服務名稱.onrender.com/rss.xml`。

本程式使用一般 HTTP 與 HTML 解析，不使用 Playwright/Chromium。若官方調整網頁結構，需更新解析規則。