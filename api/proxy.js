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

  // Essential check to ensure the API key is configured on the server
  if (!API_KEY) {
    console.error("Missing GO_API_KEY environment variable on the server.");
    return res.status(500).json({ error: "Server configuration error: Missing API key." });
  }

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