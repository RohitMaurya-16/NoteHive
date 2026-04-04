# NoteHive Supabase Backend Setup

This project now includes a backend API at `backend/` to store notes in your Supabase PostgreSQL database.
Frontend note pages are now wired to this backend (`VITE_API_URL`) so notes are saved directly in Supabase.

## 1. Backend files added

- `backend/server.js` - starts the API server
- `backend/app.js` - notes CRUD endpoints
- `backend/db.js` - PostgreSQL pool connection
- `backend/sql/init_notes.sql` - SQL schema to create `notes` table
- `.env` - your local database credentials (already filled)
- `.env.example` - template for sharing safely

## 2. SQL you need to run in Supabase

1. Open your Supabase project dashboard.
2. Go to **SQL Editor**.
3. Click **New query**.
4. Open local file `backend/sql/init_notes.sql`.
5. Copy all content from that file and paste into Supabase SQL Editor.
6. Click **Run**.

Important: run this script even if you created `notes` table earlier. It now adds required columns (`folder`, `note_type`, `starred`, `resources`, `history`) and chatbot vector-search objects (`note_embeddings`, `pgvector` extension).

After running, you should have:
- `public.notes` table
- `public.note_embeddings` table
- `trg_notes_updated_at` trigger
- `trg_note_embeddings_updated_at` trigger
- indexes for faster reading

## 3. Verify table creation (run in SQL Editor)

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('notes', 'note_embeddings');
```

If this returns both tables, setup is successful.

## 4. Configure `.env` connection

Use **one** of these options:

### Option A (recommended): `DATABASE_URL` with Supabase Session Pooler

1. In Supabase dashboard, go to **Connect -> ORMs -> Node.js**.
2. Copy the **Session Pooler** connection URI.
3. Put it in `.env` as:

```env
DATABASE_URL=postgresql://postgres.<project-ref>:<url-encoded-password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

Notes:
- If password has `@`, encode it as `%40` (your password example: `NoteHive%40Zoology%4007`).
- When using `DATABASE_URL`, backend will use it automatically.

### Option B: direct host fields (may fail on IPv4-only environments)

Keep:
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`

Direct host often resolves only IPv6 for many Supabase projects.

## 5. Start backend server

From project root:

```bash
npm run server
```

For auto-reload while coding:

```bash
npm run server:dev
```

Expected startup logs:
- `Note backend listening on http://localhost:4000`
- `Database connection successful.`

## 6. Frontend connection

Set frontend API URL in `.env`:

```env
VITE_API_URL=http://localhost:4000
```

Run frontend:

```bash
npm run dev
```

When you create/edit/delete notes in UI, they now sync with Supabase through backend API.

## 6.1 Chatbot AI env (required for embeddings + fallback AI)

Add to `.env`:

```env
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
OPENAI_EMBED_MODEL=text-embedding-3-small
OPENAI_CHAT_MODEL=gpt-4o-mini
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
GEMINI_MODEL=gemini-1.5-flash
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_CHAT_MODEL=llama3.2:3b
CHAT_TOP_K=6
CHAT_INTERNAL_MIN_SIMILARITY=0.72
```

Optional security for reindex endpoint:

```env
CHAT_REINDEX_KEY=your-secret-admin-key
```

## 7. API endpoints

Base URL: `http://localhost:4000`

- `GET /api/health` - health + DB check
- `GET /api/notes?search=&limit=50&offset=0` - list notes
- `GET /api/notes/:id` - get one note
- `POST /api/notes` - create note
- `PUT /api/notes/:id` - update note (partial update allowed)
- `DELETE /api/notes/:id` - delete note
- `POST /api/chat/query` - internal-first chatbot response
- `POST /api/chat/reindex` - regenerate embeddings for all notes
- `GET /api/chat/config` - chatbot runtime status (models, thresholds, key presence)

## 7.1 Build or rebuild embeddings

After adding OpenAI key or importing many notes, run reindex once:

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:4000/api/chat/reindex"
```

If `CHAT_REINDEX_KEY` is set:

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:4000/api/chat/reindex" `
  -Headers @{ "x-admin-key" = "your-secret-admin-key" }
```

## 8. Test API quickly (PowerShell)

Create a note:

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:4000/api/notes" `
  -ContentType "application/json" `
  -Body '{"title":"Biology Notes","content":"Cell theory summary","tags":["biology","class-11"],"folder":"Notes","type":"theory","starred":true}'
```

List notes:

```powershell
Invoke-RestMethod -Method Get -Uri "http://localhost:4000/api/notes"
```

Update a note (example ID = 1):

```powershell
Invoke-RestMethod -Method Put -Uri "http://localhost:4000/api/notes/1" `
  -ContentType "application/json" `
  -Body '{"title":"Updated Biology Notes","starred":false}'
```

Delete a note:

```powershell
Invoke-RestMethod -Method Delete -Uri "http://localhost:4000/api/notes/1"
```

## 9. Direct SQL examples you can paste in Supabase SQL Editor

Insert note:

```sql
INSERT INTO public.notes (title, content, tags, folder, note_type, starred)
VALUES ('Physics Revision', 'Newton laws + derivations', ARRAY['physics', 'revision'], 'Notes', 'theory', FALSE);
```

Read latest notes:

```sql
SELECT id, title, content, tags, folder, note_type, starred, created_at, updated_at
FROM public.notes
ORDER BY starred DESC, updated_at DESC
LIMIT 50;
```

Search notes:

```sql
SELECT *
FROM public.notes
WHERE title ILIKE '%biology%' OR content ILIKE '%biology%';
```

Update note:

```sql
UPDATE public.notes
SET title = 'Physics Final Revision'
WHERE id = 1;
```

Delete note:

```sql
DELETE FROM public.notes
WHERE id = 1;
```

## 10. About your connection string

You shared this connection template:

`postgresql://postgres:[YOUR-PASSWORD]@db.ezugicfagendzmhgclzw.supabase.co:5432/postgres`

If you use URL format directly in tools, your password must be URL-encoded:

`NoteHive%40Zoology%4007`

Encoded full URI:

`postgresql://postgres:NoteHive%40Zoology%4007@db.ezugicfagendzmhgclzw.supabase.co:5432/postgres`

In this backend we avoid encoding issues by using separate env fields (`DB_HOST`, `DB_PASSWORD`, etc.).

## 11. Troubleshooting `ENOTFOUND db.<project-ref>.supabase.co`

If you see:

`Database connection failed: getaddrinfo ENOTFOUND db....supabase.co`

It usually means your runtime cannot use that direct IPv6 host.

Fix:
1. Switch to **Session Pooler** URI in `DATABASE_URL` (Option A above).
2. Restart backend: `npm run server`
3. Test health: `Invoke-RestMethod http://localhost:4000/api/health`
