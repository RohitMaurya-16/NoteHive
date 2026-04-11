# NoteHive

NoteHive is a notes workspace built with React and Vite. It combines a note explorer, rich note editor, sticky notes board, knowledge base search, and a document viewer into one app.

## 🚀 Deployment Status
**Frontend (Static):** Deployed to GitHub Pages - https://notehive-notes.netlify.app/

**Backend (API):** Deploy to Render/Heroku + your Supabase project. See Backend Deployment below.

## Features

- Dashboard with recent notes, study plan checklist, pinned topics, and quick note import/create actions.
- Notes Explorer with folder and tag filtering, URL-synced search, sorting, grid/list toggle, and multi-select bulk actions (star, duplicate, delete).
- Note Editor with quick formatting helpers, version history, related notes, resource links, preview mode, and starred notes.
- Sticky Board for quick notes with labels, archive flow, inline editing, search, and one-click sticky-to-note conversion.
- Knowledge Base page with scoped search, filter pills, internal-first RAG chatbot, note citations, fallback AI answers, and smart collection saving.
- Profile page with dataset stats, JSON backup export, and notes import.
- PDF Notes page for uploading, storing, and viewing PDFs directly in-browser (with full-page mode).
- Supabase-backed note persistence through a Node/Express API.

## Tech Stack

- React 19
- Vite 8
- React Router DOM 7
- Recharts
- React Icons
- ESLint 9

## Local Setup

### Prerequisites

- Node.js 20+ (recommended)
- npm

### Install and Run

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173`  
Backend: `npm run server` → `http://localhost:4000`

## Available Scripts

- `npm run dev`: Start frontend dev server.
- `npm run server`: Start backend API.
- `npm run server:dev`: Backend with watch mode.
- `npm run build`: Frontend production build (`dist/`).
- `npm run preview`: Preview static build.
- `npm run lint`: ESLint checks.

## Deployment Guide

### Frontend (GitHub Pages)

1. `npm run build`
2. `gh repo deploy [YOUR_USERNAME]/NoteHive-deploy --dir dist`

Live at `https://YOUR_USERNAME.github.io/NoteHive-deploy`

Update `VITE_API_URL` in production env via Pages settings or replace in src/ before build.

### Backend (Render.com - Free)

1. Fork/push to GitHub.
2. New Web Service → Connect GitHub repo.
3. Settings:
   - Build: `npm install`
   - Start: `npm start` (add `"start": "node backend/server.js"` to package.json scripts)
   - Env vars: Copy from `.env.example` (DATABASE_URL, OPENAI_API_KEY, etc.)
4. Deploy → API URL: `https://notehive-api.onrender.com`

### Supabase Setup

1. Create Supabase project.
2. Run `backend/sql/init_notes.sql` in SQL Editor.
3. Copy Session Pooler DATABASE_URL to backend env.

## Routes

| Route | Page |
| --- | --- |
| `/` | Dashboard |
| `/explorer` | Notes Explorer |
| `/editor` | Note Editor |
| `/sticky` | Sticky Board |
| `/kb` | Knowledge Base |
| `/pdf-notes` | PDF Notes |
| `/ml-solution` | Redirects to `/pdf-notes` |
| `/profile` | Profile |

## Data Persistence

- Notes: Supabase PostgreSQL via backend API.
- Chatbot: pgvector embeddings (`note_embeddings`).
- UI state: localStorage.

## Project Structure

```text
src/             # React frontend
backend/         # Node/Express API
public/          # Static assets
```

## Import/Backup

Import/export JSON via Dashboard/Profile.

## Original Repo
https://github.com/RohitMaurya-16/NoteHive.git

## Supabase Backend Details
See `SUPABASE_BACKEND_SETUP.md` for API endpoints/SQL.

---

*Deployed by BLACKBOXAI*

