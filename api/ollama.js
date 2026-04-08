export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  // 1. Handle CORS Preflight checks for the browser
  if (req.method === 'OPTIONS') {
    return new Response('OK', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Only POST is supported', { status: 405 });
  }

  try {
    const body = await req.json();

    // The key that is forwarded from your frontend script.js
    const authHeader = req.headers.get('Authorization') || '';

    // 2. We securely route exactly what you sent us to Ollama
    const targetResponse = await fetch('https://ollama.com/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader, // forward the API key
      },
      body: JSON.stringify(body),
    });

    const data = await targetResponse.json();

    // 3. Return the response back to your frontend WITH cors headers!
    return new Response(JSON.stringify(data), {
      status: targetResponse.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
    });
  }
}
