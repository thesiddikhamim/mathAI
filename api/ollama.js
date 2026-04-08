export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const targetUrl = 'https://ollama.com/api/chat';
  const { model, messages, stream, options } = req.body;
  const authHeader = req.headers['authorization'];

  try {
    const ollamaResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { 'Authorization': authHeader } : {}),
      },
      body: JSON.stringify({
        model,
        messages,
        stream: stream || false,
        options: options || {}
      }),
    });

    if (!ollamaResponse.ok) {
      const errorData = await ollamaResponse.json().catch(() => ({}));
      return res.status(ollamaResponse.status).json({
        error: errorData.error || `Ollama API error: ${ollamaResponse.statusText}`
      });
    }

    const data = await ollamaResponse.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: 'Failed to communicate with Ollama Cloud' });
  }
}
