import fetch from "node-fetch";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "15mb", // Allow base64 images
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { type } = req.body || {};
  const API_KEY = process.env.GOOGLE_API_KEY;

  if (!API_KEY) {
    console.error("Missing GOOGLE_API_KEY environment variable on the server.");
    return res.status(500).json({ error: "Server configuration error: Missing API key." });
  }

  // **FINAL FIX:** Using the latest stable and recommended model names.
  const TEXT_MODEL_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;
  const VISION_MODEL_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent?key=${API_KEY}`;
  const IMAGEN_API_URL = `https://imagegeneration.googleapis.com/v1beta/images:generate?key=${API_KEY}`;

  let url;
  let body;

  try {
    switch (type) {
      case "design":
        url = TEXT_MODEL_URL;
        const { prompt: designPrompt } = req.body;
        const designSystemPrompt = `You are a world-class interior designer for a luxury tile and bathware brand called GTSS. A customer will describe a room. Your task is to generate a concise, inspiring design concept based on their description.
\nRules:\n- The response MUST be in JSON format.\n- The JSON schema MUST be: { "title": "string", "description": "string", "tileSuggestion": "string", "bathwareSuggestion": "string" }\n- The suggestions MUST be general types of products (e.g., "Large format matte black porcelain tiles"), not specific GTSS product names.\n- The tone should be elegant, professional, and inspiring.\n- Crucially, write in simple, conversational English.\n- Keep the description to 2-3 sentences.`;
        body = {
          contents: [{ parts: [{ text: `User prompt: "${designPrompt}"` }] }],
          systemInstruction: { parts: [{ text: designSystemPrompt }] },
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
        break;
      
      case "style":
        url = VISION_MODEL_URL; // Vision requires a specific model
        const { base64Image } = req.body;
        const styleSystemPrompt = `You are a professional interior design analyst for a luxury brand, GTSS. Analyze the provided image of a room and deconstruct its style.\n\nRules:\n- The response MUST be in JSON format.\n- The JSON schema MUST be: { "primaryStyle": "string", "keyMood": "string", "colorPalette": "string", "materialProfile": "string", "guidance": "string" }\n- The tone should be expert, insightful, and helpful.\n- The guidance should be a general statement about how to achieve this look with types of tiles and bathware, without mentioning specific product names.\n- Write in simple, conversational English.`;
        body = {
            contents: [
              { role: "user", parts: [{ text: "Analyze this room's style." }, { inlineData: { mimeType: "image/jpeg", data: base64Image } }] }
            ],
            systemInstruction: { parts: [{ text: styleSystemPrompt }] },
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
        break;

      case "image":
        url = IMAGEN_API_URL;
        const { prompt: imagePrompt } = req.body;
        body = { prompt: { text: imagePrompt } };
        break;

      case "chat":
        url = TEXT_MODEL_URL;