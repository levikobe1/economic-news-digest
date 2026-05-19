import fs from "fs";
import Parser from "rss-parser";
import { GoogleGenerativeAI } from "@google/generative-ai";

const parser = new Parser();

const feedUrl = "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml";

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function getArticles() {
  const feed = await parser.parseURL(feedUrl);

  return feed.items.slice(0, 12).map((item, index) => ({
    id: index + 1,
    title: item.title || "",
    summary: item.contentSnippet || item.summary || "",
    source: "New York Times",
    link: item.link || "#",
    pubDate: item.pubDate || ""
  }));
}

async function analyzeWithGemini(articles) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash"
  });

  const prompt = `
אתה עורך חדשות כלכליות בכיר.

קיבלת רשימת כתבות RSS כלכליות מהיממה האחרונה.
בחר 5 עד 7 נושאים כלכליים חשובים בלבד.
אל תחזור על אותו נושא פעמיים.
אל תמציא מידע מעבר למה שניתן בכותרות ובתקצירים.
אם אין מספיק מידע, כתוב בזהירות: "על בסיס המידע הזמין".

החזר JSON תקין בלבד, ללא טקסט נוסף, בפורמט:
[
  {
    "title": "כותרת בעברית",
    "eventSummary": "מה קרה ב-2-3 משפטים",
    "globalImpact": "משמעות גלובלית אפשרית",
    "israelImpact": "משמעות אפשרית לישראל",
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

function generateHTML(digest, articles) {
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
      max-width: 980px;
      margin: auto;
    }
    header {
      background: #111827;
      color: white;
      padding: 28px;
      border-radius: 18px;
      margin-bottom: 24px;
    }
    .card {
      background: white;
      padding: 24px;
      border-radius: 16px;
      margin-bottom: 20px;
      border: 1px solid #e5e7eb;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
    }
    h1 { margin: 0 0 10px; }
    h2 { margin-top: 0; font-size: 23px; }
    h3 { margin-bottom: 6px; color: #374151; }
    p { line-height: 1.7; }
    a { color: #1d4ed8; font-weight: bold; }
    .links {
      margin-top: 18px;
      font-size: 14px;
      color: #374151;
    }
  </style>
</head>
<body>
  <main class="container">
    <header>
      <h1>סקירת חדשות כלכליות יומית</h1>
      <p>סיכום AI אוטומטי על בסיס מקורות RSS כלכליים.</p>
      <p>עודכן: ${escapeHTML(now)}</p>
    </header>
    ${cards}
  </main>
</body>
</html>`;
}

async function main() {
  console.log("Fetching RSS articles...");
  const articles = await getArticles();

  console.log(`Collected ${articles.length} articles`);

  console.log("Analyzing with Gemini...");
  const digest = await analyzeWithGemini(articles);

  fs.mkdirSync("docs", { recursive: true });
  fs.writeFileSync("docs/index.html", generateHTML(digest, articles), "utf8");

  console.log("HTML generated successfully");
}

main().catch((error) => {
  console.error("Generation failed:", error);
  process.exit(1);
});
