import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("Missing GEMINI_API_KEY");
}

const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
);

const data = await response.json();

console.log(
  data.models
    .filter(model => model.supportedGenerationMethods?.includes("generateContent"))
    .map(model => model.name)
    .join("\n")
);
