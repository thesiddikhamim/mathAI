export const maxDuration = 60; // Max allowed for Vercel free tier

export default async function handler(req, res) {
  // 1. Handle CORS checks
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST is supported' });
  }

  try {
    const authHeader = req.headers.authorization || '';

    // Route to Ollama directly with a standard backend Fetch
    const targetResponse = await fetch('https://ollama.com/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body),
    });

    const data = await targetResponse.json();

    return res.status(targetResponse.status).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Could not reach server' });
  }
}
