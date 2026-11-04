
const express = require("express");
const cheerio = require("cheerio");
const RSS = require("rss");

const app = express();
const PORT = process.env.PORT || 10000;

const SOURCE_URL =
  "https://wwwc.moex.gov.tw/main/news/wfrmNewsRSSdetail.aspx?Kind=3";

const FEED_URL =
  "https://moex-latest-news-rss.onrender.com/rss.xml";

let cachedXml = "";
let lastUpdated = null;
let lastError = null;
let updating = false;

async function fetchItems() {
  const response = await fetch(SOURCE_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; MoexRSS/1.0)",
      Accept: "application/rss+xml, application/xml, text/xml, */*"
    },
    signal: AbortSignal.timeout(45000)
  });

  if (!response.ok) {
    throw new Error(`官方 RSS 回應錯誤：HTTP ${response.status}`);
  }

  const xml = await response.text();
  const $ = cheerio.load(xml, { xmlMode: true });

  const items = [];

  $("item").each((_, element) => {
    const item = $(element);

    const title = item.find("title").first().text().trim();
    const link = item.find("link").first().text().trim();
    const guid = item.find("guid").first().text().trim();
    const description = item.find("description").first().text().trim();

    const dateText =
      item.find("pubDate").first().text().trim() ||
      item.find("dc\\:date").first().text().trim() ||
      item.find("date").first().text().trim();

    if (!title || !link) return;

    const parsedDate = dateText ? new Date(dateText) : new Date();

    items.push({
      title,
      link,
      guid: guid || link,
      description,
      date: Number.isNaN(parsedDate.getTime())
        ? new Date()
        : parsedDate
    });
  });

  if (items.length === 0) {
    throw new Error("官方 RSS 已連線，但沒有解析到任何 item。");
  }

  return items.slice(0, 50);
}

async function updateRSS() {
  if (updating) return;

  updating = true;

  try {
    const items = await fetchItems();

    const feed = new RSS({
      title: "考選部－最新消息",
      description: "考選部官方最新消息",
      feed_url: FEED_URL,
      site_url: "https://wwwc.moex.gov.tw/",
      language: "zh-TW"
    });

    for (const item of items) {
      feed.item({
        title: item.title,
        description: item.description,
        url: item.link,
        guid: item.guid,
        date: item.date
      });
    }

    cachedXml = feed.xml({ indent: true });
    lastUpdated = new Date().toISOString();
    lastError = null;

    console.log(`[RSS] 更新成功，共 ${items.length} 則消息`);
  } catch (error) {
    lastError = error.cause?.code
      ? `${error.message} (${error.cause.code})`
      : error.message;

    console.error("[RSS] 更新失敗：", lastError);
  } finally {
    updating = false;
  }
}

app.get("/", (req, res) => {
  res.send("考選部最新消息 RSS 服務運作中");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    lastUpdated,
    lastError,
    updating,
    hasFeed: Boolean(cachedXml)
  });
});

app.get("/rss.xml", async (req, res) => {
  if (!cachedXml && !updating) {
    updateRSS();
  }

  if (!cachedXml) {
    return res.status(503).send(
      `RSS 暫時沒有資料：${lastError || "正在取得官方資料，請稍後再試"}`
    );
  }

  res.type("application/rss+xml").send(cachedXml);
});

app.listen(PORT, () => {
  console.log(`MOEX RSS server listening on port ${PORT}`);

  updateRSS();
  setInterval(updateRSS, 15 * 60 * 1000);
});
