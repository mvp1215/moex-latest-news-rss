const express = require("express");
const cheerio = require("cheerio");
const RSS = require("rss");

const app = express();
const PORT = process.env.PORT || 3000;
const SOURCE_URL = "https://wwwc.moex.gov.tw/main/news/wfrmNews.aspx?kind=3&menu_id=42";

let cachedFeed = "";
let lastUpdated = 0;
let refreshPromise = null;

function rocDateToDate(value) {
  const m = String(value || "").match(/(\d{2,3})\s*[\/.-]\s*(\d{1,2})\s*[\/.-]\s*(\d{1,2})/);
  if (!m) return new Date();
  return new Date(Date.UTC(Number(m[1]) + 1911, Number(m[2]) - 1, Number(m[3])));
}

async function fetchItems() {
  const response = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MOEX-RSS/1.0)", "Accept": "text/html" },
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`考選部網站回應 HTTP ${response.status}`);

  const $ = cheerio.load(await response.text());
  const items = [];
  const seen = new Set();

  $('a[href*="news_id="]').each((_, el) => {
    const a = $(el);
    const title = a.text().replace(/\s+/g, " ").trim();
    const href = a.attr("href");
    if (!title || !href || seen.has(href)) return;

    const row = a.closest("tr");
    const text = (row.length ? row.text() : a.parent().text()).replace(/\s+/g, " ");
    const match = text.match(/\d{2,3}\s*[\/.-]\s*\d{1,2}\s*[\/.-]\s*\d{1,2}/);
    const link = new URL(href, SOURCE_URL).toString();
    if (!link.includes("news_id=")) return;

    seen.add(href);
    items.push({ title, link, dateText: match ? match[0] : "", date: match ? rocDateToDate(match[0]) : new Date() });
  });

  if (!items.length) throw new Error("沒有抓到消息項目，官方網頁版型可能已變更。");
  return items.slice(0, 50);
}

function buildFeed(items) {
  const feed = new RSS({
    title: "考選部｜最新消息",
    description: "自動整理考選部官方網站「最新消息」。",
    feed_url: `${process.env.PUBLIC_URL || ""}/rss.xml`,
    site_url: SOURCE_URL,
    language: "zh-tw",
    pubDate: new Date()
  });
  for (const item of items) {
    feed.item({
      title: item.title,
      url: item.link,
      guid: item.link,
      date: item.date,
      description: item.dateText ? `發布日期：${item.dateText}` : "考選部最新消息"
    });
  }
  return feed.xml({ indent: true });
}

async function refreshFeed() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const items = await fetchItems();
    cachedFeed = buildFeed(items);
    lastUpdated = Date.now();
    console.log(`[RSS] 更新成功，共 ${items.length} 則最新消息`);
    return cachedFeed;
  })();
  try { return await refreshPromise; }
  finally { refreshPromise = null; }
}

app.get("/", (_req, res) => res.type("text").send("考選部最新消息 RSS 服務運作中。訂閱網址：/rss.xml；狀態：/health"));
app.get("/health", (_req, res) => res.json({
  status: "ok", feed: "/rss.xml", source: SOURCE_URL,
  lastUpdated: lastUpdated ? new Date(lastUpdated).toISOString() : null
}));
app.get("/rss.xml", async (_req, res) => {
  try {
    if (!cachedFeed || Date.now() - lastUpdated > 15 * 60 * 1000) await refreshFeed();
    res.set("Content-Type", "application/rss+xml; charset=utf-8").send(cachedFeed);
  } catch (error) {
    console.error("[RSS] 更新失敗：", error.message);
    if (cachedFeed) return res.set("Content-Type", "application/rss+xml; charset=utf-8").set("X-RSS-Stale", "true").send(cachedFeed);
    res.status(502).type("text").send(`RSS 產生失敗：${error.message}`);
  }
});
app.listen(PORT, () => console.log(`MOEX RSS server listening on port ${PORT}`));