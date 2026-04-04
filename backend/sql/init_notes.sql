-- NoteHive notes table schema for Supabase PostgreSQL
-- Paste this entire file into Supabase SQL Editor and run it.

CREATE TABLE IF NOT EXISTS public.notes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  folder TEXT NOT NULL DEFAULT 'Notes',
  note_type TEXT NOT NULL DEFAULT 'theory',
  starred BOOLEAN NOT NULL DEFAULT FALSE,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  resources JSONB NOT NULL DEFAULT '[]'::jsonb,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS folder TEXT NOT NULL DEFAULT 'Notes';
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS note_type TEXT NOT NULL DEFAULT 'theory';
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS starred BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS resources JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS history JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.notes
SET starred = COALESCE(starred, is_pinned, FALSE),
    is_pinned = COALESCE(starred, is_pinned, FALSE);

CREATE INDEX IF NOT EXISTS notes_updated_at_idx ON public.notes (updated_at DESC);
CREATE INDEX IF NOT EXISTS notes_is_pinned_idx ON public.notes (is_pinned DESC);
CREATE INDEX IF NOT EXISTS notes_starred_idx ON public.notes (starred DESC);

CREATE OR REPLACE FUNCTION public.set_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.is_pinned = COALESCE(NEW.starred, NEW.is_pinned, FALSE);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notes_updated_at ON public.notes;

CREATE TRIGGER trg_notes_updated_at
BEFORE UPDATE ON public.notes
FOR EACH ROW
EXECUTE FUNCTION public.set_notes_updated_at();

-- =========================
-- Chatbot / RAG extensions
-- =========================
-- Required for vector similarity search:
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.note_embeddings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  note_id BIGINT NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (note_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS note_embeddings_note_id_idx ON public.note_embeddings (note_id);
CREATE INDEX IF NOT EXISTS note_embeddings_embedding_idx
ON public.note_embeddings
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE OR REPLACE FUNCTION public.set_note_embeddings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_note_embeddings_updated_at ON public.note_embeddings;

CREATE TRIGGER trg_note_embeddings_updated_at
BEFORE UPDATE ON public.note_embeddings
FOR EACH ROW
EXECUTE FUNCTION public.set_note_embeddings_updated_at();

-- Optional helper function for direct SQL vector search:
CREATE OR REPLACE FUNCTION public.match_note_embeddings(
  query_embedding VECTOR(1536),
  match_count INTEGER DEFAULT 8
)
RETURNS TABLE (
  note_id BIGINT,
  chunk_text TEXT,
  similarity DOUBLE PRECISION
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    ne.note_id,
    ne.chunk_text,
    1 - (ne.embedding <=> query_embedding) AS similarity
  FROM public.note_embeddings ne
  ORDER BY ne.embedding <=> query_embedding
  LIMIT GREATEST(match_count, 1);
$$;

-- Optional after large imports:
-- ANALYZE public.note_embeddings;

-- Optional sample row:
-- INSERT INTO public.notes (title, content, tags, folder, note_type, starred)
-- VALUES ('Welcome to NoteHive', 'Your first Supabase note.', ARRAY['welcome', 'setup'], 'Notes', 'theory', TRUE);
