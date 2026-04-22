import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const StoreContext = createContext(null);
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://notehive-backend-wi97.onrender.com';

const STORAGE_KEYS = {
  notes: 'nh_notes',
  folders: 'nh_folders',
  tags: 'nh_tags',
  collections: 'nh_collections',
  activeNoteId: 'nh_active_note_id',
};

const NOTE_TYPES = new Set(['code', 'theory', 'question']);
const DEFAULT_TAGS = ['JavaScript', 'optimization', 'DBMS', 'Algorithms', 'recursion', 'theory'];

const DEFAULT_FOLDERS = [
  { name: 'JS', color: '#f59e0b' },
  { name: 'Java', color: '#3b82f6' },
  { name: 'DBMS', color: '#8b5cf6' },
  { name: 'Algorithms', color: '#10b981' },
  { name: 'Notes', color: '#6366f1' },
  { name: 'Theory', color: '#f97316' },
  { name: 'Questions', color: '#ec4899' },
];

const genId = () => Math.random().toString(36).slice(2, 10);
const pickRandom = list => list[Math.floor(Math.random() * list.length)];

const defaultNotes = [];

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const payload = await response.json();
      if (payload?.error) message = payload.error;
    } catch {
      // ignore JSON parse failure
    }
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

function safeLoad(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    if (!value) return fallback;
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function parseLegacyDate(value, fallbackIso) {
  if (!value || typeof value !== 'string') return fallbackIso;
  const text = value.trim().toLowerCase();
  if (!text) return fallbackIso;
  if (text === 'just now') return fallbackIso;

  const hourMatch = text.match(/^(\d+)\s*(h|hr|hrs|hour|hours)\s*ago$/);
  if (hourMatch) {
    const hours = Number(hourMatch[1]) || 0;
    return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  }

  const dayMatch = text.match(/^(\d+)\s*(d|day|days)\s*ago$/);
  if (dayMatch) {
    const days = Number(dayMatch[1]) || 0;
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  }

  const directDate = new Date(value);
  if (!Number.isNaN(directDate.getTime())) return directDate.toISOString();
  return fallbackIso;
}

function toIsoDate(value, fallbackIso = new Date().toISOString()) {
  if (!value) return fallbackIso;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? fallbackIso : d.toISOString();
  }
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return parseLegacyDate(value, fallbackIso);
}

function formatAbsoluteDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatRelativeDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  const diff = Date.now() - date.getTime();
  if (diff < 60 * 1000) return 'Just now';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m ago`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}h ago`;
  if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / (24 * 60 * 60 * 1000))}d ago`;
  return formatAbsoluteDate(iso);
}

function formatDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function createPreview(content) {
  const text = String(content || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > 140 ? `${text.slice(0, 140)}...` : text;
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  const result = [];
  for (const tag of tags) {
    if (typeof tag !== 'string') continue;
    const clean = tag.trim();
    if (!clean) continue;
    if (!result.some(existing => existing.toLowerCase() === clean.toLowerCase())) {
      result.push(clean);
    }
  }
  return result;
}

function normalizeHistory(history, fallbackTitle, fallbackContent, fallbackDate) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(entry => entry && typeof entry === 'object')
    .map(entry => ({
      id: entry.id || genId(),
      title: typeof entry.title === 'string' ? entry.title : fallbackTitle,
      content: typeof entry.content === 'string' ? entry.content : fallbackContent,
      savedAtISO: toIsoDate(entry.savedAtISO || entry.savedAt, fallbackDate),
      savedAt: formatDateTime(toIsoDate(entry.savedAtISO || entry.savedAt, fallbackDate)),
    }))
    .slice(-20);
}

function normalizeNote(note) {
  const nowIso = new Date().toISOString();
  const createdAtISO = toIsoDate(note?.createdAtISO || note?.createdAt, nowIso);
  const updatedAtISO = toIsoDate(note?.updatedAtISO || note?.updatedAt, createdAtISO);
  const content = typeof note?.content === 'string' ? note.content : '';
  const preview = typeof note?.preview === 'string' && note.preview.trim()
    ? note.preview
    : createPreview(content);

  return {
    id: String(note?.id || genId()),
    title: typeof note?.title === 'string' && note.title.length ? note.title : 'Untitled Note',
    folder: typeof note?.folder === 'string' && note.folder.trim() ? note.folder.trim() : 'Notes',
    tags: normalizeTags(note?.tags),
    type: NOTE_TYPES.has(note?.type) ? note.type : 'theory',
    starred: Boolean(note?.starred),
    content,
    preview,
    resources: Array.isArray(note?.resources) ? note.resources.filter(Boolean) : [],
    createdAtISO,
    updatedAtISO,
    createdAt: formatAbsoluteDate(createdAtISO),
    updatedAt: formatRelativeDate(updatedAtISO),
    history: normalizeHistory(note?.history, note?.title, content, updatedAtISO),
  };
}


function normalizeFolder(folder) {
  if (!folder || typeof folder !== 'object') return null;
  if (typeof folder.name !== 'string' || !folder.name.trim()) return null;
  return {
    name: folder.name.trim(),
    color: typeof folder.color === 'string' && folder.color ? folder.color : '#6b7280',
  };
}

function normalizeCollection(collection) {
  if (!collection || typeof collection !== 'object') return null;
  const createdAtISO = toIsoDate(collection.createdAtISO || collection.createdAt, new Date().toISOString());
  return {
    id: collection.id || genId(),
    name: typeof collection.name === 'string' && collection.name.trim() ? collection.name.trim() : 'Untitled Collection',
    query: typeof collection.query === 'string' ? collection.query : '',
    filters: collection.filters && typeof collection.filters === 'object' ? collection.filters : {},
    createdAtISO,
    createdAt: formatDateTime(createdAtISO),
  };
}

function serializeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.map(item => ({
    id: item.id || genId(),
    title: item.title || 'Untitled Note',
    content: item.content || '',
    savedAtISO: toIsoDate(item.savedAtISO || item.savedAt, new Date().toISOString()),
  }));
}

function noteToApiPayload(note) {
  return {
    title: note.title,
    content: note.content,
    tags: normalizeTags(note.tags),
    folder: note.folder || 'Notes',
    type: NOTE_TYPES.has(note.type) ? note.type : 'theory',
    starred: Boolean(note.starred),
    resources: Array.isArray(note.resources) ? note.resources : [],
    history: serializeHistory(note.history),
  };
}

function normalizeFolderList(list) {
  if (!Array.isArray(list)) return DEFAULT_FOLDERS;
  const result = [];
  for (const folder of list) {
    const normalized = normalizeFolder(folder);
    if (!normalized) continue;
    if (!result.some(existing => existing.name.toLowerCase() === normalized.name.toLowerCase())) {
      result.push(normalized);
    }
  }
  return result.length ? result : DEFAULT_FOLDERS;
}

function normalizeTagList(list) {
  if (!Array.isArray(list)) return DEFAULT_TAGS;
  return normalizeTags(list).length ? normalizeTags(list) : DEFAULT_TAGS;
}

export function StoreProvider({ children }) {
  const [notes, setNotes] = useState(defaultNotes.map(normalizeNote));
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  const requestAdminAccess = (action = 'perform this action') => {
    if (isAdmin) return true;
    const email = window.prompt(`Admin Permission Required (${action})\nEnter Email:`);
    if (email === null) return false;
    if (email !== 'rohitmaurya1604@gmail.com') {
      alert("Access Denied: Invalid Admin Email.");
      return false;
    }
    const password = window.prompt(`Enter Password for ${email}:`);
    if (password === null) return false;
    if (password !== 'Zoology@07') {
      alert("Access Denied: Incorrect Password.");
      return false;
    }
    setIsAdmin(true);
    return true;
  };


  const [folderCatalog, setFolderCatalog] = useState(() => {
    const loaded = safeLoad(STORAGE_KEYS.folders, DEFAULT_FOLDERS);
    return normalizeFolderList(loaded);
  });

  const [tagCatalog, setTagCatalog] = useState(() => {
    const loaded = safeLoad(STORAGE_KEYS.tags, DEFAULT_TAGS);
    return normalizeTagList(loaded);
  });

  const [smartCollections, setSmartCollections] = useState(() => {
    const loaded = safeLoad(STORAGE_KEYS.collections, []);
    if (!Array.isArray(loaded)) return [];
    return loaded.map(normalizeCollection).filter(Boolean);
  });

  const [activeNoteId, setActiveNoteId] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.activeNoteId);
    } catch {
      return null;
    }
  });

  async function loadNotesFromApi() {
    try {
      setNotesLoading(true);
      setNotesError('');
      const payload = await apiRequest('/api/notes?limit=500&offset=0');
      const remoteNotes = Array.isArray(payload?.data) ? payload.data.map(normalizeNote) : [];
      setNotes(remoteNotes);
    } catch (error) {
      setNotesError(error.message || 'Failed to load notes from backend.');
      setNotes([]);
    } finally {
      setNotesLoading(false);
    }
  }

  useEffect(() => {
    loadNotesFromApi();
    localStorage.removeItem(STORAGE_KEYS.notes);
  }, []);

  const folders = useMemo(() => {
    const map = new Map();
    folderCatalog.forEach(folder => {
      map.set(folder.name.toLowerCase(), {
        name: folder.name,
        color: folder.color,
        count: 0,
      });
    });

    notes.forEach(note => {
      const key = note.folder.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          name: note.folder,
          color: '#6b7280',
          count: 0,
        });
      }
      map.get(key).count += 1;
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [folderCatalog, notes]);

  const availableTags = useMemo(() => {
    const combined = new Set(tagCatalog.map(tag => tag.toLowerCase()));
    const result = [...tagCatalog];

    notes.forEach(note => {
      note.tags.forEach(tag => {
        const key = tag.toLowerCase();
        if (!combined.has(key)) {
          combined.add(key);
          result.push(tag);
        }
      });
    });
    return result.sort((a, b) => a.localeCompare(b));
  }, [notes, tagCatalog]);

  const activeNote = useMemo(
    () => notes.find(note => note.id === activeNoteId) || null,
    [notes, activeNoteId],
  );


  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.folders, JSON.stringify(folderCatalog));
  }, [folderCatalog]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.tags, JSON.stringify(tagCatalog));
  }, [tagCatalog]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.collections, JSON.stringify(smartCollections));
  }, [smartCollections]);

  useEffect(() => {
    if (!activeNoteId) {
      localStorage.removeItem(STORAGE_KEYS.activeNoteId);
      return;
    }
    localStorage.setItem(STORAGE_KEYS.activeNoteId, activeNoteId);
  }, [activeNoteId]);

  function setActiveNote(noteOrId) {
    if (!noteOrId) {
      setActiveNoteId(null);
      return;
    }
    if (typeof noteOrId === 'string') {
      setActiveNoteId(noteOrId);
      return;
    }
    setActiveNoteId(noteOrId.id ? String(noteOrId.id) : null);
  }

  function addFolder(name, color = '#6b7280') {
    if (typeof name !== 'string' || !name.trim()) return null;
    const cleanName = name.trim();
    let created = null;
    setFolderCatalog(prev => {
      if (prev.some(folder => folder.name.toLowerCase() === cleanName.toLowerCase())) return prev;
      created = { name: cleanName, color };
      return [...prev, created];
    });
    return created;
  }

  function deleteFolder(name) {
    if (!name) return false;
    if (!requestAdminAccess(`delete folder "${name}"`)) return false;
    setFolderCatalog(prev => prev.filter(f => f.name.toLowerCase() !== name.toLowerCase()));
    return true;
  }

  function addTag(tagName) {
    if (typeof tagName !== 'string' || !tagName.trim()) return null;
    const clean = tagName.trim();
    let created = null;
    setTagCatalog(prev => {
      if (prev.some(tag => tag.toLowerCase() === clean.toLowerCase())) return prev;
      created = clean;
      return [...prev, clean];
    });
    return created;
  }

  function applyLocalNoteUpdate(note, data = {}, options = {}) {
    const { touchUpdatedAt = true, trackHistory = false } = options;
    const titleChanged = Object.hasOwn(data, 'title') && data.title !== note.title;
    const contentChanged = Object.hasOwn(data, 'content') && data.content !== note.content;
    const nowIso = new Date().toISOString();

    const history = trackHistory && (titleChanged || contentChanged)
      ? [...note.history, {
          id: genId(),
          title: note.title,
          content: note.content,
          savedAtISO: note.updatedAtISO,
          savedAt: formatDateTime(note.updatedAtISO),
        }].slice(-20)
      : note.history;

    return normalizeNote({
      ...note,
      ...data,
      history,
      preview: Object.hasOwn(data, 'preview')
        ? data.preview
        : (Object.hasOwn(data, 'content') ? createPreview(data.content) : note.preview),
      updatedAtISO: touchUpdatedAt
        ? toIsoDate(data.updatedAtISO || data.updatedAt, nowIso)
        : note.updatedAtISO,
    });
  }

  async function addNote(data = {}) {
    if (!requestAdminAccess('create note')) return null;
    const draft = normalizeNote({
      id: genId(),
      title: data.title || 'Untitled Note',
      folder: data.folder || 'Notes',
      tags: normalizeTags(data.tags || []),
      type: NOTE_TYPES.has(data.type) ? data.type : 'theory',
      starred: Boolean(data.starred),
      content: data.content || '',
      preview: data.preview || createPreview(data.content || ''),
      resources: data.resources || [],
      history: data.history || [],
      createdAtISO: toIsoDate(data.createdAtISO || data.createdAt, new Date().toISOString()),
      updatedAtISO: toIsoDate(data.updatedAtISO || data.updatedAt, new Date().toISOString()),
    });

    try {
      const payload = await apiRequest('/api/notes', {
        method: 'POST',
        body: JSON.stringify(noteToApiPayload(draft)),
      });
      const created = normalizeNote(payload?.data || {});
      setNotesError("");
      setNotes(prev => [created, ...prev]);
      setActiveNoteId(created.id);
      addFolder(created.folder);
      created.tags.forEach(tag => addTag(tag));
      return created;
    } catch (error) {
      setNotesError(error.message || 'Failed to create note.');
      return null;
    }
  }

  async function updateNote(id, data = {}, options = {}) {
    const { persist = true } = options;
    const noteId = String(id);
    let updatedNote = null;

    if (persist && !requestAdminAccess('update note')) return null;

    setNotes(prev => prev.map(note => {
      if (String(note.id) !== noteId) return note;
      const next = applyLocalNoteUpdate(note, data, options);
      updatedNote = next;
      return next;
    }));

    if (!updatedNote) return null;
    if (updatedNote.folder) addFolder(updatedNote.folder);
    if (updatedNote.tags) updatedNote.tags.forEach(tag => addTag(tag));

    if (!persist) return updatedNote;

    try {
      const payload = await apiRequest(`/api/notes/${encodeURIComponent(noteId)}`, {
        method: 'PUT',
        body: JSON.stringify(noteToApiPayload(updatedNote)),
      });
      const synced = normalizeNote(payload?.data || {});
      setNotesError("");
      setNotes(prev => prev.map(note => (String(note.id) === noteId ? synced : note)));
      return synced;
    } catch (error) {
      setNotesError(error.message || 'Failed to update note.');
      return updatedNote;
    }
  }

  async function deleteNote(id) {
    const noteId = String(id);
    if (!window.confirm("Are you sure you want to delete this note?")) return false;
    if (!requestAdminAccess('delete note')) return false;

    setNotes(prev => prev.filter(note => String(note.id) !== noteId));
    if (activeNoteId === noteId) setActiveNoteId(null);

    try {
      await apiRequest(`/api/notes/${encodeURIComponent(noteId)}`, { method: 'DELETE' });
      setNotesError("");
      return true;
    } catch (error) {
      setNotesError(error.message || 'Failed to delete note.');
      await loadNotesFromApi();
      return false;
    }
  }

  async function toggleStar(id) {
    const current = notes.find(note => String(note.id) === String(id));
    if (!current) return null;
    return updateNote(id, { starred: !current.starred }, { touchUpdatedAt: true, trackHistory: false, persist: true });
  }

  async function setNoteStarred(id, starred) {
    return updateNote(id, { starred: Boolean(starred) }, { touchUpdatedAt: true, trackHistory: false, persist: true });
  }

  async function duplicateNote(id) {
    const source = notes.find(note => String(note.id) === String(id));
    if (!source) return null;
    return addNote({
      ...source,
      id: undefined,
      title: `${source.title} (copy)`,
      history: [],
    });
  }

  async function importNotes(rawText) {
    if (!requestAdminAccess('import notes')) return { ok: false, added: 0, message: 'Unauthorized' };
    if (typeof rawText !== 'string' || !rawText.trim()) {
      return { ok: false, added: 0, message: 'Empty file.' };
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return { ok: false, added: 0, message: 'Invalid JSON file.' };
    }

    const incoming = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.notes) ? parsed.notes : []);
    if (!incoming.length) {
      return { ok: false, added: 0, message: 'No notes found in file.' };
    }

    let added = 0;
    for (const item of incoming) {
      const normalized = normalizeNote({ ...item, id: item.id || genId() });
      try {
        await apiRequest('/api/notes', {
          method: 'POST',
          body: JSON.stringify(noteToApiPayload(normalized)),
        });
        added += 1;
      } catch {
        // continue importing remaining notes
      }
    }

    await loadNotesFromApi();
    return {
      ok: added > 0,
      added,
      message: added > 0
        ? `Imported ${added} notes to Supabase.`
        : 'Could not import notes to backend.',
    };
  }


  function saveSmartCollection(name, query, filters = {}) {
    if (!requestAdminAccess('save collection')) return null;
    const collection = normalizeCollection({
      id: genId(),
      name,
      query,
      filters,
      createdAtISO: new Date().toISOString(),
    });
    setSmartCollections(prev => [collection, ...prev]);
    return collection;
  }

  function deleteSmartCollection(id) {
    if (!requestAdminAccess('delete collection')) return;
    setSmartCollections(prev => prev.filter(collection => collection.id !== id));
  }

  const value = {
    notes,
    notesLoading,
    notesError,
    folders,
    tags: availableTags,
    smartCollections,
    activeNote,
    setActiveNote,
    addFolder,
    deleteFolder,
    addTag,
    addNote,
    updateNote,
    deleteNote,
    toggleStar,
    setNoteStarred,
    duplicateNote,
    importNotes,
    saveSmartCollection,
    deleteSmartCollection,
    isAdmin,
    requestAdminAccess,
    logout: () => setIsAdmin(false),
    reloadNotes: loadNotesFromApi,
  };

  return (
    <StoreContext.Provider value={value}>
      {children}
    </StoreContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useStore = () => useContext(StoreContext);
