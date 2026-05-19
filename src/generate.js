import fs from "fs";

const articles = [
  {
    title: "בדיקת מערכת — כותרת כלכלית לדוגמה",
    source: "System Test",
    link: "https://www.themarker.com/misc/rss",
    pubDate: new Date().toISOString()
  },
  {
    title: "המערכת הצליחה לייצר עמוד HTML דרך GitHub Actions",
    source: "GitHub Actions",
    link: "https://github.com",
    pubDate: new Date().toISOString()
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

function generateHTML(news) {
  const now = new Date().toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem"
  });

  const cards = news.map(item => `
    <article class="card">
      <div class="source">${escapeHTML(item.source)}</div>
      <h2>${escapeHTML(item.title)}</h2>
      <p>${escapeHTML(item.pubDate)}</p>
      <a href="${escapeHTML(item.link)}" target="_blank">קישור למקור</a>
    </article>
  `).join("");

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
      max-width: 900px;
      margin: auto;
    }
    header {
      background: #111827;
      color: white;
      padding: 24px;
      border-radius: 16px;
      margin-bottom: 20px;
    }
    .card {
      background: white;
      padding: 20px;
      border-radius: 14px;
      margin-bottom: 16px;
      border: 1px solid #e5e7eb;
    }
    .source {
      color: #2563eb;
      font-weight: bold;
      margin-bottom: 8px;
    }
    a {
      color: #1d4ed8;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <main class="container">
    <header>
      <h1>סקירת חדשות כלכליות יומית</h1>
      <p>גרסת בדיקה ראשונה — ללא RSS, כדי לוודא שהפרסום עובד.</p>
      <p>עודכן: ${escapeHTML(now)}</p>
    </header>
    ${cards}
  </main>
</body>
</html>`;
}

fs.mkdirSync("docs", { recursive: true });
fs.writeFileSync("docs/index.html", generateHTML(articles), "utf8");

console.log("HTML generated successfully");
