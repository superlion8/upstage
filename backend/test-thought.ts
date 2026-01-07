import { GoogleGenAI } from '@google/genai';

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function test() {
  const response = await client.models.generateContent({
    model: 'gemini-2.5-flash-preview-05-20',
    contents: [{ role: 'user', parts: [{ text: 'Say hello' }] }],
    config: {
      thinkingConfig: { thinkingBudget: 1024, includeThoughts: true }
    }
  });
  
  console.log('Full response structure:');
  console.log(JSON.stringify(response.candidates?.[0]?.content, null, 2));
}

test().catch(console.error);
