const express = require("express");
const cheerio = require("cheerio");
const RSS = require("rss");

const app = express();
const PORT = process.env.PORT || 10000;

const SOURCE_URL =
  "https://wwwc.moex.gov.tw/main/news/wfrmNewsRSSdetail.aspx?Kind=3";

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

    const feed =
