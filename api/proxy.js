// api/proxy.js  (Vercel serverless function)
// Node 18+ / ESM-friendly (export default)

const TXT_MODEL = "gemini-1.5-flash"; // stable text+vision
const IMG_MODEL = "gemini-2.5-flash-image-preview"; // image gen preview

export default async function handler(req, res) {
  // --- CORS (allow same-site; change origin below if needed) ---
  const ORIGIN = req.headers.origin || "";
  // For testing from anywhere, use "*". For production, lock to your domain.
  res.setHeader("Access-Control-Allow-Origin", ORIGIN || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Basic rate limit (per IP, very simple)
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0]?.trim() || "anon";
  if (!rateLimit(ip)) {
    return res.status(429).json({ error: "Too many requests" });
  }

  // Parse body (bump limit if style -> base64 image)
  let body = {};
  try {
    // Peek small chunk to discover type without reading twice:
    body = await readJson(req, 5 * 1024 * 1024); // up to ~5MB to be safe
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
  }

  try {
    const { type } = body;

    if (type === "design") {
      const { prompt } = body;
      if (!prompt || typeof prompt !== "string") {
        return res.status(400).json({ error: "Missing prompt" });
      }

      const systemPrompt = `You are a world-class interior designer for GTSS.
Return JSON with keys: title, description, tileSuggestion, bathwareSuggestion.
Write in simple, conversational English.`;

      const payload = {
        contents: [{ parts: [{ text: `User prompt: "${prompt}"` }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING" },
              description: { type: "STRING" },
              tileSuggestion: { type: "STRING" },
              bathwareSuggestion: { type: "STRING" }
            },
            required: ["title", "description", "tileSuggestion", "bathwareSuggestion"]
          }
        }
      };

      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${TXT_MODEL}:generateContent?key=${apiKey}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
      );
      const data = await resp.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) return res.status(502).json({ error: "No response from model", details: data?.error?.message });

      let parsed;
      try { parsed = JSON.parse(text); } 
      catch { return res.status(502).json({ error: "Bad JSON from model" }); }

      return res.status(200).json(parsed);
    }

    if (type === "style") {
      const { base64Image } = body;
      if (!base64Image || typeof base64Image !== "string") {
        return res.status(400).json({ error: "Missing base64Image" });
      }

      const systemPrompt = `You are a professional interior design analyst for GTSS.
Return JSON: primaryStyle, keyMood, colorPalette, materialProfile, guidance.
Use simple, conversational English.`;

      const payload = {
        contents: [{
          role: "user",
          parts: [
            { text: "Analyze this room's style." },
            { inlineData: { mimeType: "image/jpeg", data: base64Image } }
          ]
        }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              primaryStyle: { type: "STRING" },
              keyMood: { type: "STRING" },
              colorPalette: { type: "STRING" },
              materialProfile: { type: "STRING" },
              guidance: { type: "STRING" }
            },
            required: ["primaryStyle", "keyMood", "colorPalette", "materialProfile", "guidance"]
          }
        }
      };

      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${TXT_MODEL}:generateContent?key=${apiKey}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
      );
      const data = await resp.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) return res.status(502).json({ error: "No response from model", details: data?.error?.message });

      let parsed;
      try { parsed = JSON.parse(text); } 
      catch { return res.status(502).json({ error: "Bad JSON from model" }); }

      return res.status(200).json(parsed);
    }

    if (type === "image") {
      const { prompt } = body;
      if (!prompt || typeof prompt !== "string") {
        return res.status(400).json({ error: "Missing prompt" });
      }

      const payload = {
        contents: [{ parts: [{ text: `Generate a photorealistic, elegant interior design image of: ${prompt}.` }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] }
      };

      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${IMG_MODEL}:generateContent?key=${apiKey}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
      );
      const data = await resp.json();
      const base64 = data?.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
      if (!base64) return res.status(502).json({ error: "No image data in response", details: data?.error?.message });

      return res.status(200).json({ dataUrl: `data:image/png;base64,${base64}` });
    }

    if (type === "chat") {
      const { history } = body;
      if (!Array.isArray(history)) {
        return res.status(400).json({ error: "Invalid history" });
      }

      const systemPrompt = `You are a friendly and professional AI Design Assistant for GTSS.
Keep answers concise, simple English, no specific SKUs.`;

      const payload = { contents: history, systemInstruction: { parts: [{ text: systemPrompt }] } };

      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${TXT_MODEL}:generateContent?key=${apiKey}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
      );
      const data = await resp.json();
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!reply) return res.status(502).json({ error: "No response from model", details: data?.error?.message });

      return res.status(200).json({ reply });
    }

    return res.status(400).json({ error: "Unknown type" });

  } catch (e) {
    return res.status(500).json({ error: "Server error", details: e?.message || String(e) });
  }
}

// ---- tiny helpers ----
async function readJson(req, limit = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("Payload too large");
    chunks.push(chunk);
  }
  const str = Buffer.concat(chunks).toString("utf8") || "{}";
  return JSON.parse(str);
}

const buckets = new Map();
function rateLimit(key, windowMs = 60_000, max = 30) {
  const now = Date.now();
  const arr = buckets.get(key) || [];
  while (arr.length && now - arr[0] > windowMs) arr.shift();
  arr.push(now);
  buckets.set(key, arr);
  return arr.length <= max;
}
