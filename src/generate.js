import fs from "fs";
import Parser from "rss-parser";

const parser = new Parser();

const feeds = [
  "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml",
  "https://feeds.bbci.co.uk/news/business/rss.xml",
  "https://www.cnbc.com/id/10001147/device/rss/rss.html"
];

async function fetchNews() {
  let allItems = [];

  for (const feed of feeds) {
    try {
      const data = await Promise.race([
      parser.parseURL(feed),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 10000)
        )
      ]);

      const items = data.items.slice(0, 5).map(item => ({
        title: item.title,
        link: item.link,
        pubDate: item.pubDate || "",
        source: data.title
      }));

      allItems.push(...items);

    } catch (err) {
      console.log("Feed failed:", feed);
    }
  }

  return allItems;
}

function generateHTML(news) {
  const now = new Date().toLocaleString("he-IL");

  const articles = news.map(item => `
    <div class="card">
      <h2>${item.title}</h2>
      <p><strong>מקור:</strong> ${item.source}</p>
      <a href="${item.link}" target="_blank">
        לקריאת הכתבה
      </a>
    </div>
  `).join("");

  return `
<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>סקירת חדשות כלכליות</title>

  <style>
    body{
      font-family: Arial;
      background:#f4f4f4;
      padding:40px;
      direction:rtl;
    }

    h1{
      color:#222;
    }

    .card{
      background:white;
      padding:20px;
      margin-bottom:20px;
      border-radius:10px;
      box-shadow:0 2px 5px rgba(0,0,0,0.1);
    }

    a{
      color:#0066cc;
    }
  </style>
</head>

<body>

<h1>סקירת חדשות כלכליות יומית</h1>

<p>עודכן: ${now}</p>

${articles}

</body>
</html>
`;
}

async function main() {
  const news = await fetchNews();

  const html = generateHTML(news);

  fs.mkdirSync("docs", { recursive: true });

  fs.writeFileSync("docs/index.html", html);

  console.log("HTML generated");
}

main();
