import fs from "fs";
import Parser from "rss-parser";

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "Mozilla/5.0 Economic News Digest Bot"
  }
});

const feeds = [
  {
    name: "NYTimes Business",
    url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml"
  },
  {
    name: "BBC Business",
    url: "https://feeds.bbci.co.uk/news/business/rss.xml"
  },
  {
    name: "CNBC Top News",
    url: "https://www.cnbc.com/id/100003114/device/rss/rss.html"
  },
  {
    name: "MarketWatch Top Stories",
    url: "https://feeds.marketwatch.com/marketwatch/topstories/"
  }
];

function escapeHTML(value = "") {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function fetchWithTimeout(feed, timeoutMs = 10000) {
  return Promise.race([
    parser.parseURL(feed.url),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), timeoutMs)
    )
  ]);
}

async function fetchNews() {
  const allItems = [];

  for (const feed of feeds) {
    try {
      console.log(`Fetching: ${feed.name}`);

      const data = await fetchWithTimeout(feed);

      const items = data.items.slice(0, 8).map((item) => ({
        title: item.title || "ללא כותרת",
        link: item.link || "#",
        pubDate: item.pubDate || item.isoDate || "",
        source: feed.name
      }));

      allItems.push(...items);
      console.log(`Success: ${feed.name} - ${items.length} items`);
    } catch (error) {
      console.log(`Feed failed: ${feed.name} - ${error.message}`);
    }
  }

  return allItems;
}

function generateHTML(news) {
  const now = new Date().toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem"
  });

  const articles =
    news.length > 0
      ? news
          .map(
            (item) => `
      <article class="card">
        <div class="source">${escapeHTML(item.source)}</div>
        <h2>${escapeHTML(item.title)}</h2>
        <p class="date">${escapeHTML(item.pubDate)}</p>
        <a href="${escapeHTML(item.link)}" target="_blank" rel="noopener noreferrer">
          לקריאת הפרסום המקורי
        </a>
      </article>
    `
          )
          .join("")
      : `
      <article class="card">
        <h2>לא נמצאו פרסומים להצגה</h2>
        <p>המערכת רצה בהצלחה, אך לא הצליחה למשוך כתבות מהמקורות שהוגדרו.</p>
      </article>
    `;

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>סקירת חדשות כלכליות יומית</title>
  <style>
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #f3f4f6;
      color: #111827;
      direction: rtl;
    }

    .container {
      max-width: 980px;
      margin: 0 auto;
      padding: 32px 20px;
    }

    header {
      background: #111827;
      color: white;
      padding: 28px 20px;
      border-radius: 18px;
      margin-bottom: 24px;
    }

    h1 {
      margin: 0 0 10px 0;
      font-size: 30px;
    }

    .subtitle {
      margin: 0;
      color: #d1d5db;
      line-height: 1.6;
    }

    .updated {
      margin-top: 14px;
      font-size: 14px;
      color: #e5e7eb;
    }

    .card {
      background: white;
      border-radius: 16px;
      padding: 22px;
      margin-bottom: 18px;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
      border: 1px solid #e5e7eb;
    }

    .source {
      display: inline-block;
      font-size: 13px;
      font-weight: bold;
      color: #2563eb;
      background: #eff6ff;
      padding: 5px 10px;
      border-radius: 999px;
      margin-bottom: 10px;
    }

    h2 {
      font-size: 21px;
      margin: 8px 0 10px 0;
      line-height: 1.45;
    }

    .date {
      color: #6b7280;
      font-size: 14px;
      margin: 0 0 12px 0;
    }

    a {
      color: #1d4ed8;
      font-weight: bold;
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    footer {
      margin-top: 32px;
      color: #6b7280;
      font-size: 13px;
      text-align: center;
    }
  </style>
</head>
<body>
  <main class="container">
    <header>
      <h1>סקירת חדשות כלכליות יומית</h1>
      <p class="subtitle">
        גרסת בסיס אוטומטית: איסוף כותרות כלכליות ממקורות RSS בינלאומיים.
        בשלבים הבאים נוסיף סינון 24 שעות, מניעת כפילויות, ניתוח AI ומשמעויות לישראל.
      </p>
      <div class="updated">עודכן: ${escapeHTML(now)}</div>
    </header>

    ${articles}

    <footer>
      נוצר אוטומטית באמצעות GitHub Actions
    </footer>
  </main>
</body>
</html>`;
}

async function main() {
  console.log("Starting economic news digest generation");

  const news = await fetchNews();

  console.log(`Total items collected: ${news.length}`);

  const html = generateHTML(news);

  fs.mkdirSync("docs", { recursive: true });
  fs.writeFileSync("docs/index.html", html, "utf8");

  console.log("HTML generated successfully: docs/index.html");
}

main().catch((error) => {
  console.error("Generation failed:", error);
  process.exit(1);
});
