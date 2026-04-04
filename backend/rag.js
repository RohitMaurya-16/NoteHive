import { query } from "./db.js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim() || "";
const OPENAI_API_BASE = (process.env.OPENAI_API_BASE?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
const OPENAI_EMBED_MODEL = process.env.OPENAI_EMBED_MODEL?.trim() || "text-embedding-3-small";
const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4o-mini";
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY?.trim()
  || process.env.GOOGLE_API_KEY?.trim()
  || "";
const GEMINI_API_BASE = (process.env.GEMINI_API_BASE?.trim() || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-1.5-flash";
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434").replace(/\/$/, "");
const OLLAMA_CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL?.trim() || "llama3.2:3b";
const DEFAULT_TOP_K = Number(process.env.CHAT_TOP_K || 6);
const DEFAULT_MIN_SIMILARITY = Number(process.env.CHAT_INTERNAL_MIN_SIMILARITY || 0.72);
const MAX_HISTORY_MESSAGES = Number(process.env.CHAT_MAX_HISTORY || 12);
const MAX_NOTE_CHUNKS = Number(process.env.CHAT_MAX_NOTE_CHUNKS || 16);
const NOTE_CHUNK_SIZE = Number(process.env.CHAT_NOTE_CHUNK_SIZE || 900);

function hasOpenAI() {
  return Boolean(OPENAI_API_KEY);
}

function hasGemini() {
  return Boolean(GEMINI_API_KEY);
}

function hasOllama() {
  return Boolean(OLLAMA_CHAT_MODEL);
}

function toSafeNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function normalizeWhitespace(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
}

function normalizeNote(note) {
  return {
    id: Number(note?.id),
    title: typeof note?.title === "string" ? note.title.trim() : "",
    content: typeof note?.content === "string" ? note.content : "",
    tags: normalizeList(note?.tags),
    folder: typeof note?.folder === "string" && note.folder.trim() ? note.folder.trim() : "Notes",
    updatedAt: note?.updated_at || note?.updatedAt || null,
  };
}

function splitTextByLength(text, chunkSize) {
  if (text.length <= chunkSize) return [text];
  const chunks = [];
  let cursor = 0;
  while (cursor < text.length) {
    chunks.push(text.slice(cursor, cursor + chunkSize));
    cursor += chunkSize;
  }
  return chunks;
}

function chunkText(text) {
  const clean = normalizeWhitespace(text);
  if (!clean) return [];

  const paragraphs = clean
    .split(/\n{2,}/)
    .flatMap((part) => splitTextByLength(part.trim(), NOTE_CHUNK_SIZE))
    .filter(Boolean);

  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (!current) {
      current = paragraph;
      continue;
    }
    const candidate = `${current}\n\n${paragraph}`;
    if (candidate.length <= NOTE_CHUNK_SIZE) {
      current = candidate;
      continue;
    }
    chunks.push(current);
    current = paragraph;
  }

  if (current) chunks.push(current);
  return chunks.slice(0, Math.max(1, MAX_NOTE_CHUNKS));
}

function buildNoteSourceText(note) {
  const sections = [
    `Title: ${note.title || "Untitled Note"}`,
    `Folder: ${note.folder || "Notes"}`,
    note.tags.length ? `Tags: ${note.tags.join(", ")}` : "",
    "",
    note.content || "",
  ];
  return normalizeWhitespace(sections.filter(Boolean).join("\n"));
}

function vectorLiteral(values) {
  return `[${values.map((value) => toSafeNumber(value, 0).toFixed(8)).join(",")}]`;
}

async function openAIRequest(path, payload) {
  if (!hasOpenAI()) {
    throw new Error("OPENAI_API_KEY is missing. Internal embeddings and AI fallback are disabled.");
  }

  const response = await fetch(`${OPENAI_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let details = "";
    try {
      const data = await response.json();
      details = data?.error?.message || JSON.stringify(data);
    } catch {
      details = await response.text();
    }
    throw new Error(`OpenAI request failed (${response.status}): ${String(details).slice(0, 280)}`);
  }

  return response.json();
}

async function geminiRequestGenerateContent(payload) {
  if (!hasGemini()) {
    throw new Error("GEMINI_API_KEY is missing.");
  }

  const endpoint = `${GEMINI_API_BASE}/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let details = "";
    try {
      const data = await response.json();
      details = data?.error?.message || JSON.stringify(data);
    } catch {
      details = await response.text();
    }
    throw new Error(`Gemini request failed (${response.status}): ${String(details).slice(0, 280)}`);
  }

  return response.json();
}

async function ollamaChatRequest(payload) {
  const endpoint = `${OLLAMA_BASE_URL}/api/chat`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let details = "";
    try {
      details = await response.text();
    } catch {
      details = "";
    }
    throw new Error(`Ollama request failed (${response.status}): ${String(details).slice(0, 280)}`);
  }

  return response.json();
}

function isQuotaOrRateError(errorMessage = "") {
  const lower = String(errorMessage || "").toLowerCase();
  return (
    lower.includes("429")
    || lower.includes("quota")
    || lower.includes("insufficient_quota")
    || lower.includes("rate limit")
  );
}

async function embedTexts(texts) {
  if (!texts.length) return [];
  const payload = await openAIRequest("/embeddings", {
    model: OPENAI_EMBED_MODEL,
    input: texts,
  });

  if (!Array.isArray(payload?.data)) {
    throw new Error("OpenAI embeddings response format is invalid.");
  }

  return payload.data.map((item) => item.embedding);
}

function extractSnippet(text, queryText, maxLength = 220) {
  const clean = normalizeWhitespace(text);
  if (!clean) return "";
  if (!queryText) return clean.slice(0, maxLength);

  const words = normalizeWhitespace(queryText)
    .toLowerCase()
    .split(" ")
    .filter((word) => word.length > 2);

  let hitIndex = -1;
  for (const word of words) {
    const index = clean.toLowerCase().indexOf(word);
    if (index >= 0) {
      hitIndex = index;
      break;
    }
  }

  if (hitIndex < 0) return clean.slice(0, maxLength);

  const start = Math.max(0, hitIndex - Math.floor(maxLength * 0.35));
  const snippet = clean.slice(start, start + maxLength);
  return start > 0 ? `...${snippet}` : snippet;
}

function normalizeHistory(history = []) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: typeof item.content === "string" ? item.content.trim() : "",
    }))
    .filter((item) => item.content)
    .slice(-Math.max(1, MAX_HISTORY_MESSAGES));
}

function toSearchTerms(queryText) {
  const terms = String(queryText || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3)
    .slice(0, 8);
  return [...new Set(terms)];
}

function buildSearchQuery(message, history = []) {
  const normalizedHistory = normalizeHistory(history);
  const previousUserTurns = normalizedHistory
    .filter((item) => item.role === "user")
    .slice(-2)
    .map((item) => item.content);

  const combined = [...previousUserTurns, String(message || "").trim()]
    .filter(Boolean)
    .join(" ");

  return normalizeWhitespace(combined);
}

function dedupeMatches(rows, queryText, topK) {
  const byNote = new Map();
  for (const row of rows) {
    const noteId = Number(row.id || row.note_id);
    if (!noteId) continue;
    const similarity = toSafeNumber(row.similarity, 0);
    const existing = byNote.get(noteId);
    const candidate = {
      id: noteId,
      title: row.title || "Untitled Note",
      folder: row.folder || "Notes",
      updatedAt: row.updated_at || null,
      similarity,
      snippet: extractSnippet(row.chunk_text || row.content || "", queryText),
    };
    if (!existing || similarity > existing.similarity) {
      byNote.set(noteId, candidate);
    }
  }

  return [...byNote.values()]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, Math.max(1, topK));
}

async function lexicalRetrieve(queryText, topK) {
  if (!queryText) return { mode: "lexical", matches: [] };
  const searchTerms = toSearchTerms(queryText);

  const result = await query(
    `
      WITH ranked AS (
        SELECT
        id,
        title,
        folder,
        updated_at,
        content,
        (
          CASE WHEN title ILIKE '%' || $1 || '%' THEN 4 ELSE 0 END
          + CASE WHEN content ILIKE '%' || $1 || '%' THEN 2 ELSE 0 END
          + CASE WHEN folder ILIKE '%' || $1 || '%' THEN 1 ELSE 0 END
          + CASE WHEN tags::text ILIKE '%' || $1 || '%' THEN 1 ELSE 0 END
          + COALESCE((SELECT COUNT(*) FROM unnest($2::text[]) term WHERE title ILIKE '%' || term || '%'), 0) * 2
          + COALESCE((SELECT COUNT(*) FROM unnest($2::text[]) term WHERE content ILIKE '%' || term || '%'), 0)
          + COALESCE((SELECT COUNT(*) FROM unnest($2::text[]) term WHERE folder ILIKE '%' || term || '%'), 0)
          + COALESCE((SELECT COUNT(*) FROM unnest($2::text[]) term WHERE tags::text ILIKE '%' || term || '%'), 0)
        ) AS lexical_score
        FROM notes
        WHERE
          title ILIKE '%' || $1 || '%'
          OR content ILIKE '%' || $1 || '%'
          OR folder ILIKE '%' || $1 || '%'
          OR tags::text ILIKE '%' || $1 || '%'
          OR EXISTS (
            SELECT 1
            FROM unnest($2::text[]) term
            WHERE
              title ILIKE '%' || term || '%'
              OR content ILIKE '%' || term || '%'
              OR folder ILIKE '%' || term || '%'
              OR tags::text ILIKE '%' || term || '%'
          )
      )
      SELECT id, title, folder, updated_at, content, lexical_score
      FROM ranked
      WHERE lexical_score > 0
      ORDER BY lexical_score DESC, updated_at DESC
      LIMIT $3
    `,
    [queryText, searchTerms, Math.max(topK, 6)],
  );

  const matches = result.rows
    .map((row) => ({
      id: Number(row.id),
      title: row.title || "Untitled Note",
      folder: row.folder || "Notes",
      updatedAt: row.updated_at || null,
      similarity: Math.min(0.92, toSafeNumber(row.lexical_score, 0) / 10),
      snippet: extractSnippet(row.content || "", queryText),
    }))
    .filter((row) => row.id > 0)
    .slice(0, topK);

  return { mode: "lexical", matches };
}

async function vectorRetrieve(queryText, topK) {
  const embedding = await embedTexts([queryText]);
  const queryVector = vectorLiteral(embedding[0] || []);

  const result = await query(
    `
      SELECT
        n.id,
        n.title,
        n.folder,
        n.updated_at,
        ne.chunk_text,
        1 - (ne.embedding <=> $1::vector) AS similarity
      FROM note_embeddings ne
      JOIN notes n ON n.id = ne.note_id
      ORDER BY ne.embedding <=> $1::vector
      LIMIT $2
    `,
    [queryVector, Math.max(topK * 3, 12)],
  );

  return {
    mode: "vector",
    matches: dedupeMatches(result.rows, queryText, topK),
  };
}

async function fallbackLLMAnswer(message, history = []) {
  const normalizedHistory = normalizeHistory(history);
  const compactHistory = normalizedHistory.slice(-4).map((item) => ({
    role: item.role,
    content: item.content,
  }));

  const systemPrompt =
    "You are a concise study assistant. Internal notes had no strong match. " +
    "Give a short, practical answer and suggest what the user should search/create in their notes next. Keep it under 120 words.";

  if (hasOpenAI()) {
    try {
      const completion = await openAIRequest("/chat/completions", {
        model: OPENAI_CHAT_MODEL,
        temperature: 0.35,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          ...compactHistory,
          { role: "user", content: message },
        ],
      });

      const answer = completion?.choices?.[0]?.message?.content;
      if (typeof answer === "string" && answer.trim()) {
        return answer.trim();
      }
    } catch (error) {
      const openAIError = error?.message || "";
      if (!hasGemini() || !isQuotaOrRateError(openAIError)) {
        throw error;
      }
      console.warn("[chat] OpenAI fallback failed due to quota/rate limit. Trying Gemini fallback.");
    }
  }

  if (hasGemini()) {
    const geminiMessages = [
      {
        role: "user",
        parts: [{ text: systemPrompt }],
      },
      ...compactHistory.map((item) => ({
        role: item.role === "assistant" ? "model" : "user",
        parts: [{ text: item.content }],
      })),
      {
        role: "user",
        parts: [{ text: message }],
      },
    ];

    const geminiPayload = await geminiRequestGenerateContent({
      contents: geminiMessages,
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 260,
      },
    });

    const answer = (geminiPayload?.candidates || [])
      .flatMap((candidate) => candidate?.content?.parts || [])
      .map((part) => part?.text || "")
      .join("\n")
      .trim();

    if (answer) return answer;
  }

  if (hasOllama()) {
    const ollamaMessages = [
      {
        role: "system",
        content: systemPrompt,
      },
      ...compactHistory,
      {
        role: "user",
        content: message,
      },
    ];

    const ollamaPayload = await ollamaChatRequest({
      model: OLLAMA_CHAT_MODEL,
      stream: false,
      messages: ollamaMessages,
      options: {
        temperature: 0.35,
        num_predict: 260,
      },
    });

    const ollamaAnswer = String(ollamaPayload?.message?.content || "").trim();
    if (ollamaAnswer) return ollamaAnswer;
  }

  return "I could not find a strong internal note match. Try a different keyword or add a note on this topic.";
}

function createLocalFallbackAnswer(errorMessage = "") {
  const lower = String(errorMessage || "").toLowerCase();
  const quotaOrRate =
    lower.includes("429")
    || lower.includes("quota")
    || lower.includes("rate limit")
    || lower.includes("insufficient_quota");

  if (quotaOrRate) {
    return "I could not find a strong internal note match, and external AI is temporarily unavailable due to OpenAI quota/rate limits. Try a more specific keyword from your notes (for example a folder name, note title, or tag), or add a note on this topic first.";
  }

  if (!hasOpenAI() && !hasGemini() && !hasOllama()) {
    return "I could not find a strong internal note match. External AI fallback is not configured. Add OPENAI_API_KEY, GEMINI_API_KEY, or run a local Ollama model.";
  }

  return "I could not find a strong internal note match, and external AI is currently unavailable. Try rephrasing with a note title, folder, or tag.";
}

function formatInternalAnswer(message, matches) {
  if (matches.length === 0) return "";
  if (matches.length === 1) {
    return `From your note "${matches[0].title}": ${matches[0].snippet}`;
  }

  const lines = matches.slice(0, 3).map((item, index) => `${index + 1}. ${item.title}: ${item.snippet}`);
  return `I found ${matches.length} relevant notes for "${message}".\n${lines.join("\n")}`;
}

function buildActions(matches) {
  if (matches.length === 0) return [];
  const top = matches[0];
  const actions = [
    {
      type: "open_note",
      label: `Open "${top.title}"`,
      noteId: top.id,
      path: "/editor",
    },
  ];

  if (top.folder) {
    actions.push({
      type: "view_related",
      label: `View related in ${top.folder}`,
      path: `/explorer?q=${encodeURIComponent(top.folder)}`,
    });
  }

  return actions;
}

export async function syncNoteEmbeddings(noteInput) {
  const note = normalizeNote(noteInput);
  if (!note.id) return { ok: false, reason: "invalid_note" };
  if (!hasOpenAI()) return { ok: false, reason: "openai_not_configured" };

  const sourceText = buildNoteSourceText(note);
  const chunks = chunkText(sourceText);

  await query("DELETE FROM note_embeddings WHERE note_id = $1", [note.id]);
  if (chunks.length === 0) return { ok: true, chunks: 0 };

  let vectors;
  try {
    vectors = await embedTexts(chunks);
  } catch (error) {
    throw new Error(`Embedding generation failed: ${error.message}`);
  }

  try {
    for (let index = 0; index < chunks.length; index += 1) {
      await query(
        `
          INSERT INTO note_embeddings (note_id, chunk_index, chunk_text, embedding)
          VALUES ($1, $2, $3, $4::vector)
        `,
        [note.id, index, chunks[index], vectorLiteral(vectors[index] || [])],
      );
    }
  } catch (error) {
    if (error?.code === "42P01" || /note_embeddings/.test(error?.message || "")) {
      throw new Error("note_embeddings table is missing. Run backend/sql/init_notes.sql in Supabase SQL Editor.");
    }
    throw error;
  }

  return { ok: true, chunks: chunks.length };
}

export async function deleteNoteEmbeddings(noteId) {
  const parsed = Number(noteId);
  if (!Number.isInteger(parsed) || parsed <= 0) return { ok: false, reason: "invalid_id" };
  await query("DELETE FROM note_embeddings WHERE note_id = $1", [parsed]);
  return { ok: true };
}

export async function reindexAllNotes() {
  const result = await query(
    `
      SELECT id, title, content, tags, folder, updated_at
      FROM notes
      ORDER BY updated_at DESC
    `,
  );

  const rows = result.rows || [];
  const stats = {
    total: rows.length,
    processed: 0,
    embedded: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  for (const row of rows) {
    stats.processed += 1;
    try {
      const sync = await syncNoteEmbeddings(row);
      if (sync.ok) {
        stats.embedded += 1;
      } else {
        stats.skipped += 1;
      }
    } catch (error) {
      stats.errors += 1;
      stats.details.push({ noteId: row.id, error: error.message });
    }
  }

  return stats;
}

export async function answerFromInternalFirst({
  message,
  history = [],
  topK = DEFAULT_TOP_K,
  minSimilarity = DEFAULT_MIN_SIMILARITY,
} = {}) {
  const userMessage = String(message || "").trim();
  if (!userMessage) {
    throw new Error("message is required.");
  }

  const queryText = buildSearchQuery(userMessage, history);
  let retrievalMode = "none";
  let matches = [];
  let openAIErrorMessage = "";

  if (hasOpenAI()) {
    try {
      const vectorResult = await vectorRetrieve(queryText, topK);
      retrievalMode = vectorResult.mode;
      matches = vectorResult.matches.filter((item) => item.similarity >= minSimilarity);
    } catch (error) {
      retrievalMode = "vector_error";
      openAIErrorMessage = error?.message || "";
      if (!/note_embeddings/.test(error?.message || "")) {
        console.error("[chat] Vector retrieval failed, falling back to lexical search:", error.message);
      }
    }
  }

  if (matches.length === 0) {
    const lexical = await lexicalRetrieve(queryText, topK);
    retrievalMode = matches.length ? retrievalMode : lexical.mode;
    matches = lexical.matches.filter((item) => item.similarity >= Math.min(minSimilarity, 0.45));
  }

  const references = matches.slice(0, topK).map((item) => ({
    id: item.id,
    title: item.title,
    folder: item.folder,
    updatedAt: item.updatedAt,
    similarity: Number(item.similarity.toFixed(4)),
    snippet: item.snippet,
  }));

  if (references.length > 0) {
    return {
      source: "internal",
      retrievalMode,
      answer: formatInternalAnswer(userMessage, references),
      references,
      related: references.slice(1, 4),
      actions: buildActions(references),
      confidence: references[0].similarity,
    };
  }

  let fallback = "";
  if (!hasOpenAI() && !hasGemini()) {
    fallback = createLocalFallbackAnswer(openAIErrorMessage);
  } else {
    try {
      fallback = await fallbackLLMAnswer(userMessage, history);
    } catch (error) {
      const fallbackErrorMessage = error?.message || openAIErrorMessage || "";
      console.error("[chat] Fallback LLM failed, returning local fallback:", fallbackErrorMessage);
      fallback = createLocalFallbackAnswer(fallbackErrorMessage);
    }
  }

  const recentNotes = await query(
    `
      SELECT id, title, folder, updated_at
      FROM notes
      ORDER BY updated_at DESC
      LIMIT 3
    `,
  );

  const related = (recentNotes.rows || []).map((row) => ({
    id: Number(row.id),
    title: row.title || "Untitled Note",
    folder: row.folder || "Notes",
    updatedAt: row.updated_at,
    similarity: 0,
    snippet: "Recent note",
  }));

  return {
    source: "fallback",
    retrievalMode,
    answer: fallback,
    references: [],
    related,
    actions: related.length
      ? [
          {
            type: "view_recent",
            label: "Open recent notes",
            path: "/explorer",
          },
        ]
      : [],
    confidence: 0,
  };
}

export function getChatConfigStatus() {
  return {
    hasOpenAI: hasOpenAI(),
    hasGemini: hasGemini(),
    hasOllama: hasOllama(),
    embedModel: OPENAI_EMBED_MODEL,
    chatModel: OPENAI_CHAT_MODEL,
    geminiModel: GEMINI_MODEL,
    ollamaModel: OLLAMA_CHAT_MODEL,
    topK: DEFAULT_TOP_K,
    minSimilarity: DEFAULT_MIN_SIMILARITY,
  };
}
