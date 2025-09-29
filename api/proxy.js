// Using CommonJS require syntax for Vercel Serverless Functions
const axios = require('axios');

// This function will be the main handler for all incoming requests to /api/proxy
module.exports = async (req, res) => {
    // Ensure this is a POST request
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { type, prompt, imageData, history } = req.body;
    const API_KEY = process.env.API_KEY;

    if (!API_KEY) {
        console.error("FATAL ERROR: API_KEY is not defined in environment variables.");
        return res.status(500).json({ error: 'Server configuration error.' });
    }

    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${API_KEY}`;
    const IMAGEN_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${API_KEY}`;

    console.log(`Received request of type: ${type}`);

    try {
        let responseData;
        switch (type) {
            case 'design':
                responseData = await handleDesignRequest(prompt, GEMINI_API_URL);
                break;
            case 'image':
                responseData = await handleImageRequest(prompt, IMAGEN_API_URL);
                break;
            case 'style':
                responseData = await handleStyleRequest(imageData, GEMINI_API_URL);
                break;
            case 'chat':
                responseData = await handleChatRequest(history, GEMINI_API_URL);
                break;
            default:
                return res.status(400).json({ error: 'Invalid request type' });
        }
        res.status(200).json(responseData);
    } catch (error) {
        console.error(`Error processing ${type} request:`, error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        res.status(500).json({ error: `Failed to process ${type} request.` });
    }
};

// --- Request Handler Functions ---

async function handleDesignRequest(prompt, apiUrl) {
    const systemPrompt = `You are a world-class interior designer for a luxury tile and bathware brand called GTSS. A customer will describe a room. Your task is to generate a concise, inspiring design concept based on their description.
    **Rules:**
    - The response MUST be in JSON format.
    - The JSON schema MUST be: { "title": "string", "description": "string", "tileSuggestion": "string", "bathwareSuggestion": "string" }
    - The tone should be elegant, professional, and inspiring.
    - **Crucially, write in simple, conversational English.** The language should be very easy for a non-native English speaker to understand.`;

    const payload = {
        contents: [{ parts: [{ text: `User prompt: "${prompt}"` }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { responseMimeType: "application/json" }
    };

    const { data } = await axios.post(apiUrl, payload);
    const jsonText = data.candidates[0].content.parts[0].text;
    return JSON.parse(jsonText);
}

async function handleImageRequest(prompt, apiUrl) {
    const fullPrompt = `Photorealistic, high-end interior design photo of the following concept: ${prompt}. Show a clean, luxurious space. Professional lighting, 8k resolution.`;
    const payload = {
        instances: [{ prompt: fullPrompt }],
        parameters: { "sampleCount": 1 }
    };

    const { data } = await axios.post(apiUrl, payload);
    const base64Data = data.predictions[0].bytesBase64Encoded;
    return { dataUrl: `data:image/png;base64,${base64Data}` };
}

async function handleStyleRequest(imageData, apiUrl) {
    const systemPrompt = `You are a professional interior design analyst for a luxury brand, GTSS. Analyze the provided image of a room and deconstruct its style.
    **Rules:**
    - The response MUST be in JSON format.
    - The JSON schema MUST be: { "primaryStyle": "string", "keyMood": "string", "colorPalette": "string", "materialProfile": "string", "guidance": "string" }
    - The tone should be expert, insightful, and helpful.
    - **Crucially, write in simple, conversational English.** The language should be very easy for a non-native English speaker to understand.`;

    const payload = {
        contents: [{ parts: [
            { text: "Analyze this room's style." },
            { inlineData: { mimeType: "image/jpeg", data: imageData } }
        ] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { responseMimeType: "application/json" }
    };
    
    const { data } = await axios.post(apiUrl, payload);
    const jsonText = data.candidates[0].content.parts[0].text;
    return JSON.parse(jsonText);
}

async function handleChatRequest(history, apiUrl) {
    const systemPrompt = `You are a friendly and professional AI Design Assistant for GTSS, a luxury tile and bathware company.
    **Rules:**
    1. Answer questions about product types, design trends, and company history.
    2. If a user wants to book a visit, ask for their name and contact details.
    3. If you see '[CONTACT INFO HIDDEN]', it means they provided contact info. Your response MUST be: 'Thank you! Our team will contact you shortly to confirm your visit.' Do NOT ask again.
    4. Keep answers concise. Write in **simple, conversational English** suitable for non-native speakers.
    5. Politely decline any questions unrelated to interior design, tiles, bathware, or GTSS.`;
    
    const payload = {
      contents: history,
      systemInstruction: { parts: [{ text: systemPrompt }] },
    };

    const { data } = await axios.post(apiUrl, payload);
    const reply = data.candidates[0].content.parts[0].text;
    return { reply };
}
