export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let diagramSource = '';
  
  // Vercel might have already parsed the body if the client sent it correctly
  if (typeof req.body === 'string') {
    diagramSource = req.body;
  } else if (req.body && typeof req.body === 'object') {
    // If it was somehow parsed as JSON or something else
    diagramSource = JSON.stringify(req.body);
  } else {
    // Read from stream
    const buffers = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }
    diagramSource = Buffer.concat(buffers).toString();
  }

  if (!diagramSource || diagramSource.trim().length === 0) {
    return res.status(400).json({ error: 'Empty diagram source' });
  }

  try {
    const krokiResponse = await fetch('https://kroki.io/tikz/svg', {
      method: 'POST',
      headers: { 
        'Content-Type': 'text/plain',
        'Accept': 'image/svg+xml'
      },
      body: diagramSource,
    });

    if (!krokiResponse.ok) {
      const errorText = await krokiResponse.text();
      return res.status(krokiResponse.status).send(errorText || `Kroki error ${krokiResponse.status}`);
    }

    const svg = await krokiResponse.text();
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 's-maxage=86400');
    return res.status(200).send(svg);
  } catch (err) {
    console.error('Kroki Proxy error:', err);
    return res.status(500).json({ error: 'Failed to communicate with Kroki', details: err.message });
  }
}
