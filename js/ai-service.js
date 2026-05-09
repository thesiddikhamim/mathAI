import { SYSTEM_PROMPT } from './config.js';
import { processStream } from './utils.js';

/**
 * Multi-turn Gemini API call
 */
export async function callGeminiChat(contents, apiKey, model, onChunk) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: contents,
    generationConfig: {
      temperature: 0.15,
      topP: 0.95,
      maxOutputTokens: 8192,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }

  return processStream(res, onChunk, (chunk) => {
    return chunk?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  });
}

/**
 * Groq vision/text call — sends image as base64 in the content
 */
export async function callGroqChat(base64, apiKey, model, onChunk) {
  const url = "https://api.groq.com/openai/v1/chat/completions";

  // Determine if this model likely supports vision
  const visionModels = [
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "meta-llama/llama-4-maverick-17b-128e-instruct",
  ];
  const supportsVision = visionModels.includes(model);

  let messages;
  if (supportsVision) {
    messages = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:image/png;base64,${base64}` },
          },
        ],
      },
    ];
  } else {
    messages = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "[Image context provided as base64 but model has no vision]",
          },
          {
            type: "image_url",
            image_url: { url: `data:image/png;base64,${base64}` },
          },
        ],
      },
    ];
  }

  const body = {
    model,
    messages,
    temperature: 0.25,
    max_tokens: 8192,
    stream: true,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq HTTP ${res.status}`);
  }

  return processStream(res, onChunk, (chunk) => {
    return chunk?.choices?.[0]?.delta?.content || "";
  });
}

/**
 * Groq follow-up (text-only conversation)
 */
export async function callGroqFollowUp(messages, apiKey, model, onChunk) {
  const url = "https://api.groq.com/openai/v1/chat/completions";
  const fullMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages,
  ];
  const body = {
    model,
    messages: fullMessages,
    temperature: 0.15,
    max_tokens: 8192,
    stream: true,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq HTTP ${res.status}`);
  }
  return processStream(res, onChunk, (chunk) => {
    return chunk?.choices?.[0]?.delta?.content || "";
  });
}

/**
 * Mistral vision call — Pixtral models support vision
 */
export async function callMistralChat(base64, apiKey, model, onChunk) {
  const url = "https://api.mistral.ai/v1/chat/completions";

  // Pixtral models support vision
  const visionModels = ["pixtral-large-latest", "pixtral-12b-2409"];
  const supportsVision = visionModels.includes(model);

  let content;
  if (supportsVision) {
    content = [
      { type: "text", text: SYSTEM_PROMPT },
      { type: "image_url", image_url: `data:image/png;base64,${base64}` },
    ];
  } else {
    // For text-only Mistral models, we can still pass image_url format
    // (Mistral API handles it gracefully or ignores non-vision-capable parts)
    content = [
      { type: "text", text: SYSTEM_PROMPT },
      { type: "image_url", image_url: `data:image/png;base64,${base64}` },
    ];
  }

  const body = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content },
    ],
    temperature: 0.15,
    max_tokens: 8192,
    stream: true,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Mistral HTTP ${res.status}`);
  }

  return processStream(res, onChunk, (chunk) => {
    return chunk?.choices?.[0]?.delta?.content || "";
  });
}

/**
 * Mistral follow-up (text conversation)
 */
export async function callMistralFollowUp(messages, apiKey, model, onChunk) {
  const url = "https://api.mistral.ai/v1/chat/completions";
  // Convert content arrays to strings for follow-up
  const cleanMessages = messages.map((m) => ({
    role: m.role,
    content: Array.isArray(m.content)
      ? m.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join(" ")
      : m.content,
  }));
  const body = {
    model,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...cleanMessages],
    temperature: 0.15,
    max_tokens: 8192,
    stream: true,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Mistral HTTP ${res.status}`);
  }
  return processStream(res, onChunk, (chunk) => {
    return chunk?.choices?.[0]?.delta?.content || "";
  });
}

/**
 * Ollama generic OpenAPI call logic
 */
export async function callOllamaChat(base64, apiKey, model, onChunk) {
  const url = `/api/ollama`;
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: "Please solve the question in this image.",
      images: [base64],
    },
  ];

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const body = {
    model,
    messages,
    stream: true,
    options: { temperature: 0.25 },
  };
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Ollama Cloud HTTP ${res.status}`);
  }

  return processStream(res, onChunk, (chunk) => {
    return chunk?.message?.content || "";
  });
}

export async function callOllamaFollowUp(messages, apiKey, model, onChunk) {
  const url = `/api/ollama`;
  const cleanMessages = messages.map((m) => ({
    role: m.role,
    content: Array.isArray(m.content)
      ? m.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join(" ")
      : m.content,
  }));
  const fullMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...cleanMessages,
  ];
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const body = {
    model,
    messages: fullMessages,
    stream: true,
    options: { temperature: 0.15 },
  };
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Ollama Cloud HTTP ${res.status}`);
  }
  return processStream(res, onChunk, (chunk) => {
    return chunk?.message?.content || "";
  });
}
