import cors from "cors";
import express from "express";
import { query, testConnection } from "./db.js";
import {
  answerFromInternalFirst,
  deleteNoteEmbeddings,
  getChatConfigStatus,
  reindexAllNotes,
  syncNoteEmbeddings,
} from "./rag.js";
import { searchWeb } from "./web-search.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
const NOTE_TYPES = new Set(["code", "theory", "question"]);

function toNote(row) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    tags: row.tags || [],
    folder: row.folder || "Notes",
    type: row.note_type || "theory",
    starred: Boolean(row.starred),
    resources: Array.isArray(row.resources) ? row.resources : [],
    history: Array.isArray(row.history) ? row.history : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function parseId(rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

function parsePositiveInt(value, defaultValue, maxValue) {
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }
  return Math.min(parsed, maxValue);
}

function parseHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: typeof item.content === "string" ? item.content.trim() : "",
    }))
    .filter((item) => item.content)
    .slice(-12);
}

function queueEmbeddingSync(note) {
  Promise.resolve()
    .then(() => syncNoteEmbeddings(note))
    .then((result) => {
      if (!result?.ok) {
        console.warn(`[chat] Skipped embedding sync for note ${note?.id}: ${result?.reason || "unknown reason"}`);
      }
    })
    .catch((error) => {
      console.error(`[chat] Embedding sync failed for note ${note?.id}:`, error.message);
    });
}

function queueEmbeddingDelete(noteId) {
  Promise.resolve()
    .then(() => deleteNoteEmbeddings(noteId))
    .catch((error) => {
      console.error(`[chat] Embedding delete failed for note ${noteId}:`, error.message);
    });
}

function parseNoteFields(body, { partial = false } = {}) {
  const errors = [];
  const fields = {};

  if (!partial || hasOwn(body, "title")) {
    if (body.title === undefined) {
      if (partial) fields.title = null;
    } else if (typeof body.title !== "string") {
      errors.push("title must be a string.");
    } else {
      fields.title = body.title.trim();
    }
  }

  if (!partial || hasOwn(body, "content")) {
    if (body.content === undefined) {
      if (partial) fields.content = null;
    } else if (typeof body.content !== "string") {
      errors.push("content must be a string.");
    } else {
      fields.content = body.content;
    }
  }

  if (!partial || hasOwn(body, "tags")) {
    if (body.tags === undefined) {
      if (partial) fields.tags = null;
    } else if (!Array.isArray(body.tags) || !body.tags.every((tag) => typeof tag === "string")) {
      errors.push("tags must be an array of strings.");
    } else {
      fields.tags = body.tags;
    }
  }

  if (!partial || hasOwn(body, "folder")) {
    if (body.folder === undefined) {
      if (partial) fields.folder = null;
    } else if (typeof body.folder !== "string") {
      errors.push("folder must be a string.");
    } else {
      fields.folder = body.folder.trim() || "Notes";
    }
  }

  if (!partial || hasOwn(body, "type")) {
    if (body.type === undefined) {
      if (partial) fields.type = null;
    } else if (typeof body.type !== "string" || !NOTE_TYPES.has(body.type)) {
      errors.push("type must be one of: code, theory, question.");
    } else {
      fields.type = body.type;
    }
  }

  if (!partial || hasOwn(body, "starred") || hasOwn(body, "isPinned")) {
    const rawValue = hasOwn(body, "starred") ? body.starred : body.isPinned;
    if (rawValue === undefined) {
      if (partial) fields.starred = null;
    } else if (typeof rawValue !== "boolean") {
      errors.push("starred must be a boolean.");
    } else {
      fields.starred = rawValue;
    }
  }

  if (!partial || hasOwn(body, "resources")) {
    if (body.resources === undefined) {
      if (partial) fields.resources = null;
    } else if (!Array.isArray(body.resources) || !body.resources.every((item) => typeof item === "string")) {
      errors.push("resources must be an array of strings.");
    } else {
      fields.resources = body.resources;
    }
  }

  if (!partial || hasOwn(body, "history")) {
    if (body.history === undefined) {
      if (partial) fields.history = null;
    } else if (!Array.isArray(body.history)) {
      errors.push("history must be an array.");
    } else {
      fields.history = body.history;
    }
  }

  if (!partial) {
    if (!hasOwn(fields, "title")) fields.title = "";
    if (!hasOwn(fields, "content")) fields.content = "";
    if (!hasOwn(fields, "tags")) fields.tags = [];
    if (!hasOwn(fields, "folder")) fields.folder = "Notes";
    if (!hasOwn(fields, "type")) fields.type = "theory";
    if (!hasOwn(fields, "starred")) fields.starred = false;
    if (!hasOwn(fields, "resources")) fields.resources = [];
    if (!hasOwn(fields, "history")) fields.history = [];
  }

  return { errors, fields };
}

app.get("/api/health", async (_req, res, next) => {
  try {
    await testConnection();
    res.json({ ok: true, message: "Backend and database connection are healthy." });
  } catch (error) {
    next(error);
  }
});

app.get("/api/chat/config", (_req, res) => {
  res.json({ data: getChatConfigStatus() });
});

app.post("/api/chat/query", async (req, res, next) => {
  try {
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    const history = parseHistory(req.body?.history);
    const topK = parsePositiveInt(req.body?.topK, 6, 12);

    if (!message) {
      return res.status(400).json({ error: "message is required." });
    }
    if (topK === null || topK <= 0) {
      return res.status(400).json({ error: "topK must be a positive integer." });
    }

    const result = await answerFromInternalFirst({
      message,
      history,
      topK,
    });

    return res.json({ data: result });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/search/web", async (req, res, next) => {
  try {
    const searchQuery = typeof req.body?.query === "string" ? req.body.query.trim() : "";
    const limit = Math.min(Number(req.body?.limit) || 5, 10);

    if (!searchQuery) {
      return res.status(400).json({ error: "query is required." });
    }

    const searchResult = await searchWeb(searchQuery, limit);
    return res.json({ data: searchResult });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/chat/reindex", async (req, res, next) => {
  try {
    const expectedKey = process.env.CHAT_REINDEX_KEY?.trim();
    if (expectedKey) {
      const receivedKey = String(req.headers["x-admin-key"] || "").trim();
      if (receivedKey !== expectedKey) {
        return res.status(401).json({ error: "Invalid x-admin-key for reindex." });
      }
    }

    const stats = await reindexAllNotes();
    return res.json({ data: stats });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/notes", async (req, res, next) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const limit = parsePositiveInt(req.query.limit, 50, 200);
    const offset = parsePositiveInt(req.query.offset, 0, 1000000);

    if (limit === null || offset === null) {
      return res.status(400).json({ error: "limit/offset must be non-negative integers." });
    }

    const result = await query(
      `
      SELECT
        id, title, content, tags, folder, note_type,
        COALESCE(starred, is_pinned, FALSE) AS starred,
        resources, history, created_at, updated_at
      FROM notes
      WHERE ($1 = '' OR title ILIKE '%' || $1 || '%' OR content ILIKE '%' || $1 || '%')
      ORDER BY COALESCE(starred, is_pinned, FALSE) DESC, updated_at DESC
      LIMIT $2 OFFSET $3
      `,
      [search, limit, offset],
    );

    return res.json({
      data: result.rows.map(toNote),
      pagination: { limit, offset, count: result.rowCount },
    });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/notes/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "Invalid note id." });
    }

    const result = await query(
      `
      SELECT
        id, title, content, tags, folder, note_type,
        COALESCE(starred, is_pinned, FALSE) AS starred,
        resources, history, created_at, updated_at
      FROM notes
      WHERE id = $1
      `,
      [id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Note not found." });
    }

    return res.json({ data: toNote(result.rows[0]) });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/notes", async (req, res, next) => {
  try {
    const { errors, fields } = parseNoteFields(req.body || {});
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(" ") });
    }

    const result = await query(
      `
      INSERT INTO notes (
        title, content, tags, folder, note_type, starred, is_pinned, resources, history
      )
      VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8)
      RETURNING
        id, title, content, tags, folder, note_type,
        COALESCE(starred, is_pinned, FALSE) AS starred,
        resources, history, created_at, updated_at
      `,
      [
        fields.title,
        fields.content,
        fields.tags,
        fields.folder,
        fields.type,
        fields.starred,
        fields.resources,
        fields.history,
      ],
    );

    queueEmbeddingSync(result.rows[0]);
    return res.status(201).json({ data: toNote(result.rows[0]) });
  } catch (error) {
    return next(error);
  }
});

app.put("/api/notes/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "Invalid note id." });
    }

    const providedFields = ["title", "content", "tags", "folder", "type", "starred", "resources", "history", "isPinned"].filter((name) =>
      hasOwn(req.body || {}, name),
    );

    if (providedFields.length === 0) {
      return res.status(400).json({ error: "Provide at least one note field to update." });
    }

    const { errors, fields } = parseNoteFields(req.body || {}, { partial: true });
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(" ") });
    }

    const hasResources = hasOwn(req.body || {}, 'resources');
    
    const result = await query(
      `
      UPDATE notes
      SET
        title = COALESCE($2, title),
        content = COALESCE($3, content),
        tags = COALESCE($4, tags),
        folder = COALESCE($5, folder),
        note_type = COALESCE($6, note_type),
        starred = COALESCE($7, starred),
        is_pinned = COALESCE($7, is_pinned),
        resources = CASE WHEN $10::boolean THEN $8 ELSE resources END,
        history = COALESCE($9, history)
      WHERE id = $1
      RETURNING
        id, title, content, tags, folder, note_type,
        COALESCE(starred, is_pinned, FALSE) AS starred,
        resources, history, created_at, updated_at
      `,
      [
        id,
        fields.title ?? null,
        fields.content ?? null,
        fields.tags ?? null,
        fields.folder ?? null,
        fields.type ?? null,
        fields.starred ?? null,
        fields.resources ?? null,
        fields.history ?? null,
        hasResources,
      ],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Note not found." });
    }

    queueEmbeddingSync(result.rows[0]);
    return res.json({ data: toNote(result.rows[0]) });
  } catch (error) {
    return next(error);
  }
});

app.delete("/api/notes/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "Invalid note id." });
    }

    const result = await query("DELETE FROM notes WHERE id = $1 RETURNING id", [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Note not found." });
    }

    queueEmbeddingDelete(id);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

app.use((error, _req, res, _next) => {
  const message = error?.message || "Unexpected server error.";
  console.error("[api] Request failed:", error);
  res.status(500).json({ error: message });
});

export default app;
