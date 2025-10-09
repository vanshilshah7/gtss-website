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

  // Using the most stable and universally available model names.
  const TEXT_MODEL_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${API_KEY}`;
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
        const { history } = req.body;
        const chatSystemPrompt = `You are a friendly and professional AI Design Assistant for GTSS, a luxury tile and bathware company.\n\nTasks:\n1) Answer questions about product types, design trends, and company history.\n2) If a user wants to book a visit, ask for their name and phone number.\n3) If you see '[CONTACT INFO HIDDEN]' in the user's message, your response MUST be: 'Thank you for providing your details. I've passed them to our team securely, and an expert will contact you shortly.'\n4) Keep answers concise and helpful. Do NOT recommend specific product names.\n5) Write in simple, conversational English.`;
        body = {
            contents: history,
            systemInstruction: { parts: [{ text: chatSystemPrompt }] },
        };
        break;

      default:
        return res.status(400).json({ error: "Unknown type" });
    }

    const googleResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await googleResponse.json();

    if (!googleResponse.ok || data.error) {
      console.error("Error from Google API:", data);
      throw new Error(data.error?.message || `Google API responded with status ${googleResponse.status}`);
    }

    let finalResponse;
    if (type === 'image') {
        const dataUrl = data?.images?.[0]?.image?.base64Data ? `data:image/png;base64,${data.images[0].image.base64Data}` : null;
        if (!dataUrl) throw new Error("No image data returned from Google");
        finalResponse = { dataUrl };
    } else if (type === 'chat') {
        const reply = data?.candidates?.[0]?.content?.parts?[0]?.text;
        if (!reply) throw new Error("No chat reply returned from Google");
        finalResponse = { reply };
    } else { 
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("No content returned from Google");
        finalResponse = JSON.parse(text);
    }

    return res.status(200).json(finalResponse);

  } catch (e) {
    console.error("Error in /api/proxy:", e);
    return res.status(500).json({ error: e.message || "An unknown server error occurred." });
  }
}