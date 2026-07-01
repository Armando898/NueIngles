import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");
const FRONTEND_DIR = resolve(__dirname, "../frontend");
const PORT = Number(process.env.PORT || 5173);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/translate") {
      const body = await readJson(req);
      const translation = await translateSpanishToEnglish(body.text || "", body.provider || "", body.apiKey || "");
      return sendJson(res, { translation });
    }

    if (req.method === "GET" || req.method === "HEAD") {
      return serveStatic(req, res);
    }

    sendJson(res, { error: "Método no permitido" }, 405);
  } catch (error) {
    console.error(error);
    sendJson(res, { error: error.message || "Error interno" }, 500);
  }
}).listen(PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
});

const FREE_PROVIDERS = {
  gemini: {
    key: () => process.env.GEMINI_API_KEY,
    translate: (text, key) => translateWithGemini(text, key)
  },
  groq: {
    key: () => process.env.GROQ_API_KEY,
    translate: (text, key) => translateWithOpenAICompatible(text, key, "https://api.groq.com/openai/v1", "llama-3.3-70b-versatile")
  },
  openai: {
    key: () => process.env.OPENAI_API_KEY,
    translate: (text, key) => translateWithOpenAICompatible(text, key, "https://api.openai.com/v1", "gpt-4o-mini")
  },
  deepseek: {
    key: () => process.env.DEEPSEEK_API_KEY,
    translate: (text, key) => translateWithOpenAICompatible(text, key, "https://api.deepseek.com/v1", "deepseek-chat")
  },
  moonshot: {
    key: () => process.env.MOONSHOT_API_KEY,
    translate: (text, key) => translateWithOpenAICompatible(text, key, "https://api.moonshot.cn/v1", "moonshot-v1-8k")
  }
};

async function translateSpanishToEnglish(text, providerOpt, apiKeyOpt) {
  if (!text.trim()) return "";

  const provider = providerOpt || process.env.AI_PROVIDER || "mock";

  const freeProvider = FREE_PROVIDERS[provider];
  if (freeProvider) {
    const key = apiKeyOpt || freeProvider.key() || "";
    if (!key) {
      const providerNames = Object.keys(FREE_PROVIDERS).map((p) => `"${p}"`).join(", ");
      throw new Error(`Falta API key para "${provider}". Consíguela gratis y configúrala en backend/.env, o selecciona "mock" para modo demo. Proveedores disponibles: ${providerNames}.`);
    }
    return freeProvider.translate(text, key);
  }

  if (provider === "openai-compatible") {
    return translateWithOpenAICompatible(
      text,
      process.env.OPENAI_COMPATIBLE_API_KEY || "",
      process.env.OPENAI_COMPATIBLE_BASE_URL || "",
      process.env.OPENAI_COMPATIBLE_MODEL || ""
    );
  }

  if (provider === "generic-rest") {
    return translateWithGenericRest(text);
  }

  return translateWithMockProvider(text);
}

async function translateWithOpenAICompatible(text, apiKey, baseUrl, model) {
  if (!baseUrl || !apiKey || !model) {
    throw new Error("Faltan credenciales del proveedor OpenAI-compatible.");
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "Translate from Spanish to natural English. Preserve the structure as much as possible. Return only the translation."
        },
        { role: "user", content: text }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Proveedor OpenAI-compatible respondió ${response.status}: ${errorText.slice(0, 300)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function translateWithGenericRest(text) {
  const endpoint = process.env.GENERIC_AI_TRANSLATE_ENDPOINT;
  const apiKey = process.env.GENERIC_AI_API_KEY;
  if (!endpoint) throw new Error("Falta GENERIC_AI_TRANSLATE_ENDPOINT.");

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ task: "translate_es_en", input: text })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Proveedor REST genérico respondió ${response.status}: ${errorText.slice(0, 300)}`);
  }

  const data = await response.json();
  return data.translation || data.output || data.text || "";
}

function translateWithMockProvider(text) {
  const normalized = text.toLowerCase();
  if (normalized.includes("quiero aprender inglés") || normalized.includes("quiero aprender ingles")) {
    return "I want to learn English because I need to speak with more confidence in my job and when I travel.";
  }
  if (normalized.includes("hola")) {
    return "Hello, my name is Ana. I want to practice English pronunciation.";
  }
  return "This is a demo translation. Connect an AI provider in the backend to get a real translation.";
}

async function translateWithGemini(text, apiKey) {
  if (!apiKey) {
    throw new Error("Falta GEMINI_API_KEY. Consigue una gratis en https://aistudio.google.com/apikey");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Traduce del español al inglés conservando la estructura. Devuelve solo la traducción:\n\n${text}`
              }
            ]
          }
        ]
      })
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini respondió ${response.status}: ${err.slice(0, 300)}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, payload, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function serveStatic(req, res) {
  const requestedPath = decodeURIComponent(new URL(req.url, `http://localhost:${PORT}`).pathname);
  const safePath = requestedPath === "/" ? "/index.html" : requestedPath;
  const filePath = resolve(join(FRONTEND_DIR, safePath));

  if (!filePath.startsWith(FRONTEND_DIR) || !existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("No encontrado");
    return;
  }

  const mime = MIME_TYPES[extname(filePath)] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": mime });
  createReadStream(filePath).pipe(res);
}
