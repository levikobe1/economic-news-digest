import fs from "fs";
import Parser from "rss-parser";
import { GoogleGenerativeAI } from "@google/generative-ai";

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
    name: "CNBC",
    url: "https://www.cnbc.com/id/100003114/device/rss/rss.html"
  },
  {
    name: "MarketWatch",
    url: "https://feeds.marketwatch.com/marketwatch/topstories/"
  },
  {
    name: "Yahoo Finance",
    url: "https://finance.yahoo.com/rss/topstories"
  },
  {
    name: "Reuters via Google News",
    url: "https://news.google.com/rss/search?q=site%3Areuters.com%20business%20OR%20markets%20OR%20economy&hl=en-US&gl=US&ceid=US%3Aen"
  },
  {
    name: "Globes",
    url: "https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=1225"
  },
  {
    name: "Calcalist via Google News",
    url: "https://news.google.com/rss/search?q=site%3Acalcalist.co.il%20%D7%9B%D7%9C%D7%9B%D7%9C%D7%94&hl=he&gl=IL&ceid=IL%3Ahe"
  }
  {
  name: "TheMarker via Google News",
  url: "https://news.google.com/rss/search?q=site%3Athemarker.com%20%D7%9B%D7%9C%D7%9B%D7%9C%D7%94&hl=he&gl=IL&ceid=IL%3Ahe"
  }  
];

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isWithinLast24Hours(pubDate) {
  if (!pubDate) return true;

  const published = new Date(pubDate);
  if (Number.isNaN(published.getTime())) return true;

  const now = Date.now();
  const ageMs = now - published.getTime();

  return ageMs >= 0 && ageMs <= 24 * 60 * 60 * 1000;
}

async function parseFeedWithTimeout(feed, timeoutMs = 10000) {
  return Promise.race([
    parser.parseURL(feed.url),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), timeoutMs)
    )
  ]);
}

async function getArticles() {
  const allArticles = [];
  const feedStatus = [];

  for (const feed of feeds) {
    try {
      console.log(`Fetching feed: ${feed.name}`);

      const parsed = await parseFeedWithTimeout(feed);

      const items = parsed.items
        .filter((item) => isWithinLast24Hours(item.pubDate || item.isoDate))
        .slice(0, 8)
        .map((item) => ({
          id: allArticles.length + 1,
          title: item.title || "",
          summary: item.contentSnippet || item.summary || item.content || "",
          source: feed.name,
          link: item.link || "#",
          pubDate: item.pubDate || item.isoDate || ""
        }));

      allArticles.push(...items);

      feedStatus.push({
        name: feed.name,
        status: "success",
        count: items.length
      });

      console.log(`Success: ${feed.name} - ${items.length} items`);
    } catch (error) {
      feedStatus.push({
        name: feed.name,
        status: "failed",
        error: error.message
      });

      console.log(`Failed: ${feed.name} - ${error.message}`);
    }
  }

  return {
    articles: allArticles.map((article, index) => ({
      ...article,
      id: index + 1
    })),
    feedStatus
  };
}

async function analyzeWithGemini(articles) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  const model = genAI.getGenerativeModel({
    model: "models/gemini-2.5-flash"
  });

  const prompt = `
אתה עורך חדשות כלכליות בכיר עבור קוראים בישראל.

קיבלת רשימת כותרות ותקצירי RSS כלכליים מ-24 השעות האחרונות.
בחר 5 עד 7 אירועים כלכליים חשובים בלבד.

הנחיות מחייבות:
1. אל תחזור על אותו אירוע פעמיים גם אם הוא הופיע בכמה מקורות.
2. תן עדיפות לאירועים בעלי השפעה על שווקים, ריבית, אינפלציה, מט"ח, אנרגיה, טכנולוגיה, רגולציה, סחר גלובלי או ישראל.
3. אל תמציא עובדות שלא קיימות בכותרות או בתקצירים.
4. אם המידע חלקי, כתוב "על בסיס המידע הזמין".
5. כתוב בעברית מקצועית וברורה.
6. החזר JSON תקין בלבד, ללא Markdown וללא טקסט נוסף.

פורמט חובה:
[
  {
    "title": "כותרת קצרה בעברית",
    "eventSummary": "מה קרה ב-2-3 משפטים",
    "globalImpact": "המשמעות הגלובלית האפשרית",
    "israelImpact": "המשמעות האפשרית לישראל",
    "importance": "גבוהה / בינונית / נמוכה",
    "category": "שווקים / ריבית / אינפלציה / אנרגיה / טכנולוגיה / ישראל / רגולציה / אחר",
    "sourceIds": [1,2]
  }
]

הכתבות:
${JSON.stringify(articles, null, 2)}
`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  const cleaned = text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  return JSON.parse(cleaned);
}

function generateHTML(digest, articles, feedStatus) {
  const now = new Date().toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem"
  });

  const cards = digest.map((item) => {
    const links = (item.sourceIds || [])
      .map((id) => articles.find((a) => a.id === id))
      .filter(Boolean)
      .map(
        (article) =>
          `<a href="${escapeHTML(article.link)}" target="_blank" rel="noopener noreferrer">${escapeHTML(article.source)}</a>`
      )
      .join(" | ");

    return `
      <article class="card">
        <div class="meta">
          <span>${escapeHTML(item.category || "כלכלה")}</span>
          <span>חשיבות: ${escapeHTML(item.importance || "לא דורג")}</span>
        </div>
        <h2>${escapeHTML(item.title)}</h2>

        <h3>תמצית האירוע</h3>
        <p>${escapeHTML(item.eventSummary)}</p>

        <h3>משמעות גלובלית</h3>
        <p>${escapeHTML(item.globalImpact)}</p>

        <h3>משמעות אפשרית לישראל</h3>
        <p>${escapeHTML(item.israelImpact)}</p>

        <div class="links">מקורות: ${links || "לא זמין"}</div>
      </article>
    `;
  }).join("");

  const statusRows = feedStatus.map((feed) => {
    const label =
      feed.status === "success"
        ? `עבד — ${feed.count} כתבות`
        : `נכשל — ${feed.error}`;

    return `<li>${escapeHTML(feed.name)}: ${escapeHTML(label)}</li>`;
  }).join("");

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>סקירת חדשות כלכליות יומית</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: #f3f4f6;
      color: #111827;
      direction: rtl;
      margin: 0;
      padding: 40px;
    }
    .container {
      max-width: 1040px;
      margin: auto;
    }
    header {
      background: #111827;
      color: white;
      padding: 28px;
      border-radius: 18px;
      margin-bottom: 24px;
    }
    h1 {
      margin: 0 0 10px 0;
    }
    .subtitle {
      color: #d1d5db;
      line-height: 1.7;
    }
    .card, .status {
      background: white;
      padding: 24px;
      border-radius: 16px;
      margin-bottom: 20px;
      border: 1px solid #e5e7eb;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
    }
    .meta {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }
    .meta span {
      background: #eff6ff;
      color: #1d4ed8;
      padding: 5px 10px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: bold;
    }
    h2 {
      margin-top: 0;
      font-size: 23px;
      line-height: 1.45;
    }
    h3 {
      margin-bottom: 6px;
      color: #374151;
    }
    p {
      line-height: 1.7;
    }
    a {
      color: #1d4ed8;
      font-weight: bold;
    }
    .links {
      margin-top: 18px;
      font-size: 14px;
      color: #374151;
    }
    .status {
      font-size: 14px;
      color: #374151;
    }
    .status h2 {
      font-size: 18px;
    }
    .status ul {
      margin-bottom: 0;
    }
  </style>
</head>
<body>
  <main class="container">
    <header>
      <h1>סקירת חדשות כלכליות יומית</h1>
      <p class="subtitle">
        סיכום AI אוטומטי של 5-7 אירועים כלכליים מרכזיים מתוך מקורות RSS כלכליים.
        הסיכום מבוסס על כותרות ותקצירי RSS, ולכן אינו מחליף קריאה מלאה של הכתבות המקוריות.
      </p>
      <p>עודכן: ${escapeHTML(now)}</p>
    </header>

    ${cards}

    <section class="status">
      <h2>סטטוס מקורות</h2>
      <ul>${statusRows}</ul>
    </section>
  </main>
</body>
</html>`;
}

async function main() {
  console.log("Fetching RSS articles...");
  const { articles, feedStatus } = await getArticles();

  console.log(`Collected ${articles.length} articles`);
  console.log("Feed status:", JSON.stringify(feedStatus, null, 2));

  if (articles.length === 0) {
    throw new Error("No articles collected from any feed");
  }

  console.log("Analyzing with Gemini...");
  const digest = await analyzeWithGemini(articles);

  fs.mkdirSync("docs", { recursive: true });
  fs.writeFileSync("docs/index.html", generateHTML(digest, articles, feedStatus), "utf8");

  console.log("HTML generated successfully");
}

main().catch((error) => {
  console.error("Generation failed:", error);
  process.exit(1);
});
