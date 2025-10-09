import fetch from "node-fetch";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "15mb", // Allow base64 images
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { type } = req.body || {};
  const API_KEY = process.env.GOOGLE_API_KEY;

  if (!API_KEY) {
    console.error("Missing GOOGLE_API_KEY environment variable on the server.");
    return res.status(500).json({ error: "Server configuration error: Missing API key." });
  }

  // Using the models you confirmed were working
  const TEXT_MODEL_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${API_KEY}`;
  const VISION_MODEL_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent?key=${API_KEY}`;
  const IMAGE_GEN_MODEL_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${API_KEY}`;

  let url;
  let body;

  try {
    switch (type) {
      case "design":
        url = TEXT_MODEL_URL;
        const { prompt: designPrompt } = req.body;
        const designSystemPrompt = `You are a world-class interior designer...`; // Your full prompt here
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
        url = VISION_MODEL_URL;
        const { base64Image } = req.body;
        const styleSystemPrompt = `You are a professional interior design analyst...`; // Your full prompt here
        body = {
            contents: [
              { role: "user", parts: [{ text: "Analyze this room's style." }, { inlineData: { mimeType: "image/jpeg", data: base64Image } }] }
            ],
            systemInstruction: { parts: [{ text: styleSystemPrompt }] },
            generationConfig: { 
                responseMimeType: "application/json",
                // **FIX:** Fully defined schema for the 'style' case
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
        url = IMAGE_GEN_MODEL_URL;
        const { prompt: imagePrompt } = req.body;
        body = {
          contents: [{
            parts: [{ text: imagePrompt }]
          }]
        };
        break;

      case "chat":
        url = TEXT_MODEL_URL;
        const { history } = req.body;
        const chatSystemPrompt = `You are a friendly and professional AI Design Assistant...`; // Your full prompt here
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
      const imagePart = data.candidates[0].content.parts.find(part => part.inlineData);
      if (!imagePart) {
        console.error("No image data found in Google's response. Full response:", JSON.stringify(data, null, 2));
        throw new Error("No image data returned from Google");
      }
      const base64Data = imagePart.inlineData.data;
      const dataUrl = `data:image/png;base64,${base64Data}`;
      finalResponse = { dataUrl };
    } else if (type === 'chat') {
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
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