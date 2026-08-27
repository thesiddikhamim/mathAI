// OpenRouter helpers.
import { SYSTEM_PROMPT } from './config.js';
import { processStream } from './utils.js';

export async function callOpenRouterChat(base64, apiKey, model, onChunk, text = '') {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: [
      { type: 'text', text: text || 'Solve the mathematics problem shown in this image. Read every symbol carefully.' },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } },
    ] },
  ];
  return request(messages, apiKey, model, onChunk);
}

export async function callOpenRouterFollowUp(messages, apiKey, model, onChunk) {
  return request([{ role: 'system', content: SYSTEM_PROMPT }, ...messages], apiKey, model, onChunk);
}

async function request(messages, apiKey, model, onChunk) {
  if (!apiKey) throw new Error('Add your OpenRouter API key in Settings first.');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': window.location.href,
      'X-OpenRouter-Title': 'MathAI',
    },
    body: JSON.stringify({ model, messages, temperature: 0.15, max_tokens: 8192, stream: true }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `OpenRouter HTTP ${res.status}`);
  }
  return processStream(res, onChunk, (chunk) => chunk?.choices?.[0]?.delta?.content || '');
}
