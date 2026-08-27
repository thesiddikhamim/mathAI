import { SYSTEM_PROMPT } from './config.js';
import { processStream } from './utils.js';

export async function callGeminiChat(contents, apiKey, model, onChunk) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const body = { system_instruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents, generationConfig: { temperature: 0.15, topP: 0.95, maxOutputTokens: 8192 } };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error?.message || `HTTP ${res.status}`); }
  return processStream(res, onChunk, (chunk) => chunk?.candidates?.[0]?.content?.parts?.[0]?.text || "");
}

export async function callGroqChat(base64, apiKey, model, onChunk) {
  const url = "https://api.groq.com/openai/v1/chat/completions";
  const visionModels = ["meta-llama/llama-4-scout-17b-16e-instruct", "meta-llama/llama-4-maverick-17b-128e-instruct"];
  const messages = [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: [{ type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } }] }];
  if (!visionModels.includes(model)) messages[1].content.unshift({ type: "text", text: "[Image provided]" });
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, messages, temperature: 0.25, max_tokens: 8192, stream: true }) });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error?.message || `Groq HTTP ${res.status}`); }
  return processStream(res, onChunk, (chunk) => chunk?.choices?.[0]?.delta?.content || "");
}

export async function callGroqFollowUp(messages, apiKey, model, onChunk) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages], temperature: 0.15, max_tokens: 8192, stream: true }) });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error?.message || `Groq HTTP ${res.status}`); }
  return processStream(res, onChunk, (chunk) => chunk?.choices?.[0]?.delta?.content || "");
}

export async function callMistralChat(base64, apiKey, model, onChunk) {
  const content = [{ type: "text", text: "Please solve the question in this image." }, { type: "image_url", image_url: `data:image/png;base64,${base64}` }];
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content }], temperature: 0.15, max_tokens: 8192, stream: true }) });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error?.message || `Mistral HTTP ${res.status}`); }
  return processStream(res, onChunk, (chunk) => chunk?.choices?.[0]?.delta?.content || "");
}

export async function callMistralFollowUp(messages, apiKey, model, onChunk) {
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages], temperature: 0.15, max_tokens: 8192, stream: true }) });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error?.message || `Mistral HTTP ${res.status}`); }
  return processStream(res, onChunk, (chunk) => chunk?.choices?.[0]?.delta?.content || "");
}

export async function callOllamaChat(base64, apiKey, model, onChunk) {
  const messages = [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: "Please solve the question in this image.", images: [base64] }];
  const headers = { "Content-Type": "application/json" }; if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(`/api/ollama`, { method: "POST", headers, body: JSON.stringify({ model, messages, stream: true, options: { temperature: 0.25 } }) });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error || `Ollama Cloud HTTP ${res.status}`); }
  return processStream(res, onChunk, (chunk) => chunk?.message?.content || "");
}

export async function callOllamaFollowUp(messages, apiKey, model, onChunk) {
  const cleanMessages = messages.map((m) => {
    const msg = { role: m.role, content: Array.isArray(m.content) ? m.content.filter(c => c.type === "text").map(c => c.text).join(" ") : m.content };
    if (m.images) msg.images = m.images;
    return msg;
  });
  const headers = { "Content-Type": "application/json" }; if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(`/api/ollama`, { method: "POST", headers, body: JSON.stringify({ model, messages: [{ role: "system", content: SYSTEM_PROMPT }, ...cleanMessages], stream: true, options: { temperature: 0.15 } }) });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error || `Ollama Cloud HTTP ${res.status}`); }
  return processStream(res, onChunk, (chunk) => chunk?.message?.content || "");
}

function openRouterHeaders(apiKey) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "HTTP-Referer": window.location.href, "X-OpenRouter-Title": "MathAI" };
}

export async function callOpenRouterChat(base64, apiKey, model, onChunk) {
  const messages = [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: [{ type: "text", text: "Solve the mathematics problem shown in this image. Read every symbol carefully." }, { type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } }] }];
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: openRouterHeaders(apiKey), body: JSON.stringify({ model, messages, temperature: 0.15, max_tokens: 8192, stream: true }) });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error?.message || `OpenRouter HTTP ${res.status}`); }
  return processStream(res, onChunk, (chunk) => chunk?.choices?.[0]?.delta?.content || "");
}

export async function callOpenRouterFollowUp(messages, apiKey, model, onChunk) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: openRouterHeaders(apiKey), body: JSON.stringify({ model, messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages], temperature: 0.15, max_tokens: 8192, stream: true }) });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error?.message || `OpenRouter HTTP ${res.status}`); }
  return processStream(res, onChunk, (chunk) => chunk?.choices?.[0]?.delta?.content || "");
}
