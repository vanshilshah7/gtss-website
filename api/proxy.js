// ==============================
// 1) Next.js API route (pages router)
// File: /pages/api/proxy.js
// ==============================

import fetch from "node-fetch";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "15mb", // allow base64 images
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { type } = req.body || {};
  const API_KEY = process.env.GOOGLE_API_KEY; // <-- set in your hosting env
  if (!API_KEY) return res.status(500).json({ error: "Missing GOOGLE_API_KEY env var" });

  try {
    if (type === "design") {
      const { prompt } = req.body;
      const systemPrompt = `You are a world-class interior designer for a luxury tile and bathware brand called GTSS. A customer will describe a room. Your task is to generate a concise, inspiring design concept based on their description.
\nRules:\n- The response MUST be in JSON format.\n- The JSON schema MUST be: { "title": "string", "description": "string", "tileSuggestion": "string", "bathwareSuggestion": "string" }\n- The suggestions MUST be general types of products (e.g., "Large format matte black porcelain tiles"), not specific GTSS product names.\n- The tone should be elegant, professional, and inspiring.\n- Crucially, write in simple, conversational English.\n- Keep the description to 2-3 sentences.`;

      const body = {
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
              bathwareSuggestion: { type: "STRING" },
            },
            required: ["title", "description", "tileSuggestion", "bathwareSuggestion"],
          },
        },
      };

      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      );
      const data = await r.json();
      // Pull the JSON text out of candidates
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      let parsed;
      try { parsed = JSON.parse(text); } catch (e) { parsed = { title: "Design Concept", description: text || "", tileSuggestion: "Porcelain tiles", bathwareSuggestion: "Modern fixtures" }; }
      return res.status(200).json(parsed);
    }

    if (type === "style") {
      const { base64Image } = req.body;
      const systemPrompt = `You are a professional interior design analyst for a luxury brand, GTSS. Analyze the provided image of a room and deconstruct its style.\n\nRules:\n- The response MUST be in JSON format.\n- The JSON schema MUST be: { "primaryStyle": "string", "keyMood": "string", "colorPalette": "string", "materialProfile": "string", "guidance": "string" }\n- The tone should be expert, insightful, and helpful.\n- The guidance should be a general statement about how to achieve this look with types of tiles and bathware, without mentioning specific product names.\n- Write in simple, conversational English.`;

      const body = {
        contents: [
          {
            role: "user",
            parts: [
              { text: "Analyze this room's style." },
              { inlineData: { mimeType: "image/jpeg", data: base64Image } },
            ],
          },
        ],
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
              guidance: { type: "STRING" },
            },
            required: ["primaryStyle", "keyMood", "colorPalette", "materialProfile", "guidance"],
          },
        },
      };

      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      );
      const data = await r.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      let parsed;
      try { parsed = JSON.parse(text); } catch (e) { parsed = { primaryStyle: "Modern", keyMood: "Calm", colorPalette: "Neutrals", materialProfile: "Porcelain + wood", guidance: text || "Use warm neutrals and clean lines." }; }
      return res.status(200).json(parsed);
    }

    if (type === "image") {
      const { prompt } = req.body;
      // Prefer Imagen 3 for text-to-image. Fallback to returning a placeholder.
      const body = {
        // Imagen style request
        // See Google AI Studio docs; if your project doesn't have Imagen access, this will fail.
        // In that case, we respond with 400 so the UI shows a friendly error.
        // Some regions/models may be gated.
        prompt: { text: prompt },
      };

      const r = await fetch(
        `https://imagegeneration.googleapis.com/v1beta/images:generate?key=${API_KEY}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      );

      if (!r.ok) {
        const err = await r.text();
        return res.status(400).json({ error: "Image generation not available in this project.", details: err });
      }
      const data = await r.json();
      const dataUrl = data?.images?.[0]?.image?.base64Data
        ? `data:image/png;base64,${data.images[0].image.base64Data}`
        : null;
      if (!dataUrl) return res.status(400).json({ error: "No image data returned" });
      return res.status(200).json({ dataUrl });
    }

    if (type === "chat") {
      const { history } = req.body; // array of { role, parts }
      const systemPrompt = `You are a friendly and professional AI Design Assistant for GTSS, a luxury tile and bathware company.\n\nTasks:\n1) Answer questions about product types, design trends, and company history.\n2) If a user wants to book a visit, ask for their name and phone number.\n3) If you see '[CONTACT INFO HIDDEN]' in the user's message, your response MUST be: 'Thank you for providing your details. I've passed them to our team securely, and an expert will contact you shortly.'\n4) Keep answers concise and helpful. Do NOT recommend specific product names.\n5) Write in simple, conversational English.`;

      const body = {
        contents: history,
        systemInstruction: { parts: [{ text: systemPrompt }] },
      };

      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      );
      const data = await r.json();
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "I'm here to help with tiles and bathware!";
      return res.status(200).json({ reply });
    }

    return res.status(400).json({ error: "Unknown type" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Server error" });
  }
}


// ==================================
// 2) Express.js alternative (server.js)
// ==================================
// If you're not on Next.js, use this basic Express server. Save as server.js
// and deploy to your Node host (Render, Railway, VPS). Point the front-end to /api/proxy

/*
import express from 'express';
import fetch from 'node-fetch';

const app = express();
app.use(express.json({ limit: '15mb' }));

const API_KEY = process.env.GOOGLE_API_KEY;

app.post('/api/proxy', async (req, res) => {
  // paste the same switch logic from the Next.js handler above
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Server running on ' + port));
*/


// ==================================
// 3) Front-end patches (apply in your HTML <script>)
// ==================================
// A) Remove UNUSED apiUrl constants to avoid confusion (they aren't used).
// B) Keep masking for the model, but store the raw message separately if you plan to send details to your CRM.
//    Example minimal tweak to handle raw + masked:
/*
function sanitizeInput(message) {
  const phoneRegex = /(?:\+?91)?[-\s]?[6-9]\d{9}|(?:\+?\d{1,4}[-.\s]?)?(?:\(?\d{1,4}\)?[-.\s]?)?[\d\s.-]{7,15}/g;
  const emailRegex = /[\w-\.]+@([\w-]+\.)+[\w-]{2,4}/g;
  let masked = message.replace(phoneRegex, '[CONTACT INFO HIDDEN]').replace(emailRegex, '[CONTACT INFO HIDDEN]');
  return { masked, hadPII: masked !== message };
}

async function handleChatSend() {
  const userMessageRaw = chatInput.value.trim();
  if (!userMessageRaw) return;
  addMessageToChat('user', userMessageRaw);
  chatInput.value = '';

  const { masked, hadPII } = sanitizeInput(userMessageRaw);
  // TODO: if (hadPII) send userMessageRaw securely to your backend CRM endpoint.

  const typingIndicator = document.createElement('div');
  typingIndicator.className = 'ai-message self-start p-3 rounded-lg animate-pulse';
  typingIndicator.textContent = '...';
  chatMessages.appendChild(typingIndicator);

  chatHistory.push({ role: 'user', parts: [{ text: masked }] });

  try {
    const { reply } = await fetchWithExponentialBackoff('/api/proxy', { type: 'chat', history: chatHistory });
    chatMessages.removeChild(typingIndicator);
    addMessageToChat('ai', reply);
    chatHistory.push({ role: 'model', parts: [{ text: reply }] });
  } catch (err) {
    chatMessages.removeChild(typingIndicator);
    addMessageToChat('ai', 'My apologies, I encountered an error. Could you please rephrase your question?');
  }
}
*/

// C) No other JS changes are required; your existing fetchWithExponentialBackoff('/api/proxy', ...) calls will work once the proxy is deployed and GOOGLE_API_KEY is set.

// ==================================
// 4) Deployment checklist
// ==================================
// - Set env var GOOGLE_API_KEY in your hosting provider (Vercel/Netlify/Render). Do NOT expose it on the client.
// - If using Vercel + Next.js: push /pages/api/proxy.js and redeploy. The endpoint will be available at /api/proxy.
// - Ensure your domain uses HTTPS. Mixed content will block some browser APIs.
// - Confirm your Google AI Studio project has access to: \n  * gemini-1.5-flash (text + vision) \n  * Imagen 3 (image generation). If not, the proxy will return a friendly 400 and your UI already shows a polite error.
// - If you host Express separately, allow CORS from your site origin.
