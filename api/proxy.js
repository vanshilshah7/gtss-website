// This file must be placed in a folder named "api" in your project root.
// Vercel will automatically turn this into a serverless function.

export default async function handler(request, response) {
  // 1. Get the secret API key from Vercel's environment variables.
  const apiKey = process.env.GEMINI_API_KEY;
  
  // ADDED: A check to ensure the API key is configured on the server.
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not set in environment variables.");
    return response.status(500).json({ error: 'API key not configured by the administrator.' });
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type, prompt, history } = request.body;
    let payload;

    // 2. Construct the correct payload based on the request type from the website.
    if (type === 'design') {
        const systemPrompt = `You are a world-class interior designer for GTSS. A customer will describe a room. Your task is to generate a concise, inspiring design concept. The response MUST be a clean JSON object with this schema: { "title": "string", "description": "string", "tileSuggestion": "string", "bathwareSuggestion": "string" }. The suggestions MUST be general product types, not specific names. The language should be simple and conversational. Keep the description to 2-3 sentences.`;
        payload = {
            contents: [{ parts: [{ text: `User prompt: "${prompt}"` }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: { type: "OBJECT", properties: { title: { type: "STRING" }, description: { type: "STRING" }, tileSuggestion: { type: "STRING" }, bathwareSuggestion: { type: "STRING" } }, required: ["title", "description", "tileSuggestion", "bathwareSuggestion"] }
            }
        };
    } else if (type === 'story') {
        const systemPrompt = "You are an AI historian for GTSS, a 75-year-old tile and bathware company in Ahmedabad. Answer the user's question about the company's history in a warm, narrative, and brief (2-3 sentences) style.";
        payload = {
            contents: [{ parts: [{ text: prompt }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
        };
    } else if (type === 'chat') {
        const systemPrompt = "You are a friendly and professional AI Design Assistant for GTSS. Answer questions about product types and design trends. If a user wants to book a visit, ask for their name and phone number. If you see '[CONTACT INFO HIDDEN]', your response MUST be: 'Thank you for providing your details. Our team will contact you shortly.' Do not ask for the information again. Keep answers concise and use simple, conversational English.";
        payload = {
            contents: history,
            systemInstruction: { parts: [{ text: systemPrompt }] },
        };
    } else {
        return response.status(400).json({ error: 'Invalid request type' });
    }

    // 3. Forward the request to the Gemini API.
    const geminiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await geminiResponse.json();

    if (!geminiResponse.ok || data.error) {
      console.error('Gemini API Error:', data);
      return response.status(500).json({ error: 'Failed to get response from AI' });
    }
    
    // 4. Send the successful response back to our website.
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      response.status(200).json({ text });
    } else {
      console.error('Unexpected Gemini Response:', data);
      response.status(500).json({ error: 'Unexpected response format from AI' });
    }
    
  } catch (error) {
    console.error('Proxy Error:', error);
    response.status(500).json({ error: 'An internal error occurred' });
  }
}

