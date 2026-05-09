export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let diagramSource = '';
  
  if (typeof req.body === 'string') {
    diagramSource = req.body;
  } else if (req.body && typeof req.body === 'object') {
    diagramSource = JSON.stringify(req.body);
  } else {
    const buffers = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }
    diagramSource = Buffer.concat(buffers).toString();
  }

  if (!diagramSource || diagramSource.trim().length === 0) {
    return res.status(400).json({ error: 'Empty diagram source' });
  }

  // Use a longer timeout for the fetch call (Hobby plan is 10s, but we'll try to push it)
  // Actually, Vercel Hobby is strictly 10s. Pro is 60s.
  // We'll add an AbortController to the fetch itself.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000); // slightly over 10s to let Vercel handle it if needed

  try {
    const krokiResponse = await fetch('https://kroki.io/tikz/svg', {
      method: 'POST',
      headers: { 
        'Content-Type': 'text/plain',
        'Accept': 'image/svg+xml'
      },
      body: diagramSource,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!krokiResponse.ok) {
      const errorText = await krokiResponse.text();
      return res.status(krokiResponse.status).send(errorText || `Kroki error ${krokiResponse.status}`);
    }

    const svg = await krokiResponse.text();
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 's-maxage=86400');
    return res.status(200).send(svg);
  } catch (err) {
    clearTimeout(timeoutId);
    console.error('Kroki Proxy error:', err);
    
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Kroki request timed out (service is slow or code is complex)' });
    }
    
    return res.status(500).json({ error: 'Failed to communicate with Kroki', details: err.message });
  }
}
