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
  { name: "NYTimes Business", url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml" },
  { name: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { name: "CNBC", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html" },
  { name: "MarketWatch", url: "https://feeds.marketwatch.com/marketwatch/topstories/" },
  { name: "Yahoo Finance", url: "https://finance.yahoo.com/rss/topstories" },
  { name: "Reuters via Google News", url: "https://news.google.com/rss/search?q=site%3Areuters.com%20business%20OR%20markets%20OR%20economy&hl=en-US&gl=US&ceid=US%3Aen" },
  { name: "Globes", url: "https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=1225" },
  { name: "Calcalist via Google News", url: "https://news.google.com/rss/search?q=site%3Acalcalist.co.il%20%D7%9B%D7%9C%D7%9B%D7%9C%D7%94&hl=he&gl=IL&ceid=IL%3Ahe" },
  { name: "TheMarker via Google News", url: "https://news.google.com/rss/search?q=site%3Athemarker.com%20%D7%9B%D7%9C%D7%9B%D7%9C%D7%94&hl=he&gl=IL&ceid=IL%3Ahe" }
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
  if (!pubDate) return false;
  const published = new Date(pubDate);
  if (Number.isNaN(published.getTime())) return false;
  const ageMs = Date.now() - published.getTime();
  return ageMs >= 0 && ageMs <= 24 * 60 * 60 * 1000;
}

async function parseFeedWithTimeout(feed, timeoutMs = 10000) {
  return Promise.race([
    parser.parseURL(feed.url),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeoutMs))
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
      feedStatus.push({ name: feed.name, status: "success", count: items.length });
      console.log(`Success: ${feed.name} - ${items.length} items`);
    } catch (error) {
      feedStatus.push({ name: feed.name, status: "failed", error: error.message });
      console.log(`Failed: ${feed.name} - ${error.message}`);
    }
  }

  return {
    articles: allArticles.map((article, index) => ({ ...article, id: index + 1 })),
    feedStatus
  };
}

async function analyzeWithGemini(articles) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "models/gemini-2.5-flash" });

  const prompt = `
אתה עורך חדשות כלכליות בכיר עבור קוראים בישראל.

קיבלת רשימת כותרות ותקצירי RSS כלכליים מ-24 השעות האחרונות.
בחר 5 עד 7 אירועים כלכליים חשובים בלבד.

הנחיות:
1. אל תחזור על אותו אירוע פעמיים.
2. תן עדיפות להשפעה על שווקים, ריבית, אינפלציה, מט"ח, אנרגיה, טכנולוגיה, רגולציה, סחר גלובלי או ישראל.
3. אל תמציא עובדות מעבר לכותרות ולתקצירים.
4. אם המידע חלקי, כתוב "על בסיס המידע הזמין".
5. כתוב בעברית מקצועית וברורה.
6. החזר JSON תקין בלבד.

פורמט:
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
  const cleaned = result.response.text()
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  return JSON.parse(cleaned);
}

function isLocalItem(item, sourceArticles) {
  const category = String(item.category || "").toLowerCase();
  const sources = sourceArticles.map((a) => a.source.toLowerCase()).join(" ");
  return category.includes("ישראל") ||
    sources.includes("globes") ||
    sources.includes("calcalist") ||
    sources.includes("themarker");
}

function buildCard(item, articles) {
  const sourceArticles = (item.sourceIds || [])
    .map((id) => articles.find((a) => a.id === id))
    .filter(Boolean);

  const mainArticle = sourceArticles[0];
  const title = mainArticle
    ? `<a class="title-link" href="${escapeHTML(mainArticle.link)}" target="_blank" rel="noopener noreferrer">${escapeHTML(item.title)}</a>`
    : escapeHTML(item.title);

  const links = sourceArticles
    .map((article) => `<a href="${escapeHTML(article.link)}" target="_blank" rel="noopener noreferrer">${escapeHTML(article.source)}</a>`)
    .join(" | ");

  return `
    <article class="news-card">
      <div class="card-top">
        <div class="badges">
          <span class="badge blue">${escapeHTML(item.category || "כללי")}</span>
          <span class="badge red">חשיבות: ${escapeHTML(item.importance || "לא דורג")}</span>
        </div>
      </div>

      <h2>${title}</h2>

      <p class="summary">${escapeHTML(item.eventSummary)}</p>

      <div class="bottom-line">
        <strong>💡 השורה התחתונה והמשמעות:</strong>
        <p>${escapeHTML(item.globalImpact)}</p>
        <p>${escapeHTML(item.israelImpact)}</p>
      </div>

      <div class="links">מקורות: ${links || "לא זמין"}</div>
    </article>
  `;
}

function generateHTML(digest, articles, feedStatus) {
  const now = new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });

  const globalCards = [];
  const localCards = [];

  for (const item of digest) {
    const sourceArticles = (item.sourceIds || [])
      .map((id) => articles.find((a) => a.id === id))
      .filter(Boolean);

    if (isLocalItem(item, sourceArticles)) {
      localCards.push(buildCard(item, articles));
    } else {
      globalCards.push(buildCard(item, articles));
    }
  }

  const statusRows = feedStatus.map((feed) => {
    const label = feed.status === "success"
      ? `עבד — ${feed.count} כתבות`
      : `נכשל — ${feed.error}`;

    return `<li>${escapeHTML(feed.name)}: ${escapeHTML(label)}</li>`;
  }).join("");

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>הבוקר הכלכלי</title>
  <style>
    :root {
      --navy: #0f172a;
      --blue: #2563eb;
      --blue-soft: #eff6ff;
      --red: #ef4444;
      --red-soft: #fef2f2;
      --green: #059669;
      --green-soft: #ecfdf5;
      --teal: #0f766e;
      --bg: #f4f6f8;
      --text: #111827;
      --muted: #64748b;
      --border: #dbe3ee;
      --card: #ffffff;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: Arial, "Helvetica Neue", sans-serif;
      background: var(--bg);
      color: var(--text);
      direction: rtl;
    }

    .top-hero {
      background: var(--navy);
      color: white;
      text-align: center;
      padding: 34px 20px 30px;
      border-bottom: 5px solid var(--blue);
    }

    .top-hero h1 {
      margin: 0 0 12px;
      font-size: 34px;
      font-weight: 800;
    }

    .top-hero p {
      margin: 0;
      color: #cbd5e1;
      font-size: 15px;
    }

    .system-bar {
      background: white;
      border-bottom: 1px solid var(--border);
      padding: 13px 20px;
      font-size: 14px;
      color: var(--muted);
    }

    .system-inner {
      max-width: 1040px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    .ok {
      color: #16a34a;
      font-weight: 700;
    }

    main {
      max-width: 1040px;
      margin: 0 auto;
      padding: 34px 20px 56px;
    }

    .section-title {
      display: flex;
      align-items: center;
      gap: 14px;
      margin: 32px 0 20px;
      font-size: 22px;
      font-weight: 800;
    }

    .section-title::before {
      content: "";
      flex: 1;
      height: 2px;
      background: var(--border);
    }

    .section-title::after {
      content: "";
      width: 70px;
      height: 4px;
      background: var(--blue);
      border-radius: 999px;
    }

    .section-title.local::after {
      background: var(--teal);
    }

    .news-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 24px;
      margin-bottom: 26px;
      box-shadow: 0 3px 12px rgba(15, 23, 42, 0.06);
    }

    .card-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 14px;
    }

    .badges {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .badge {
      display: inline-block;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 700;
    }

    .badge.blue {
      background: var(--blue-soft);
      color: var(--blue);
    }

    .badge.red {
      background: var(--red-soft);
      color: var(--red);
    }

    .news-card h2 {
      margin: 0 0 14px;
      font-size: 23px;
      line-height: 1.45;
      font-weight: 800;
    }

    .title-link {
      color: var(--text);
      text-decoration: none;
    }

    .title-link:hover {
      color: var(--blue);
      text-decoration: underline;
    }

    .summary {
      color: #475569;
      line-height: 1.85;
      margin: 0 0 18px;
      font-size: 15px;
    }

    .bottom-line {
      background: var(--green-soft);
      border-right: 4px solid #86efac;
      padding: 16px 18px;
      border-radius: 8px 0 0 8px;
      margin-top: 18px;
      color: #064e3b;
    }

    .bottom-line strong {
      color: #047857;
    }

    .bottom-line p {
      margin: 8px 0 0;
      line-height: 1.75;
    }

    .links {
      margin-top: 18px;
      font-size: 14px;
      color: var(--muted);
    }

    a {
      color: var(--blue);
      font-weight: 700;
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    .status {
      background: white;
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 20px 24px;
      margin-top: 36px;
      color: var(--muted);
      font-size: 14px;
    }

    .status h2 {
      color: var(--text);
      margin: 0 0 12px;
      font-size: 18px;
    }

    .status ul {
      margin: 0;
      padding-right: 20px;
      line-height: 1.9;
    }

    .disclaimer {
      text-align: center;
      color: #94a3b8;
      margin-top: 26px;
      font-size: 13px;
      line-height: 1.6;
    }

    @media (max-width: 700px) {
      .top-hero h1 { font-size: 28px; }
      main { padding: 24px 14px 44px; }
      .news-card { padding: 20px; }
      .news-card h2 { font-size: 20px; }
      .system-inner { display: block; line-height: 1.9; }
    }
  </style>
</head>
<body>
  <header class="top-hero">
    <h1>הבוקר הכלכלי</h1>
    <p>תקציר מנהלים ומשמעויות שוק ממוקדות בהתאמה אישית</p>
  </header>

  <div class="system-bar">
    <div class="system-inner">
      <div>עודכן לאחרונה: <strong>${escapeHTML(now)}</strong></div>
      <div>מצב מערכת: <span class="ok">● סריקה הופקה בהצלחה</span></div>
    </div>
  </div>

  <main>
    ${globalCards.length ? `<div class="section-title">זירה גלובלית</div>${globalCards.join("")}` : ""}
    ${localCards.length ? `<div class="section-title local">זירה מקומית (ישראל)</div>${localCards.join("")}` : ""}

    <section class="status">
      <h2>סטטוס מקורות</h2>
      <ul>${statusRows}</ul>
    </section>

    <p class="disclaimer">
      הסיכום מבוסס על כותרות ותקצירי RSS, ולכן אינו מחליף קריאה מלאה של הכתבות המקוריות.
    </p>
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
