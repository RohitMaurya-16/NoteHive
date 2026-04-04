import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FiFilter, FiGrid, FiList, FiChevronDown, FiSearch,
} from 'react-icons/fi';
import NoteCard from '../components/NoteCard';
import { useStore } from '../store/useStore';

const tagColors = {
  javascript: 'tag-blue',
  optimization: 'tag-green',
  complexity: 'tag-orange',
  recursion: 'tag-purple',
  dbms: 'tag-purple',
  algorithms: 'tag-green',
  theory: 'tag-orange',
};

export default function NotesExplorer() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    notes,
    notesLoading,
    notesError,
    folders,
    tags,
    addFolder,
    addTag,
    deleteNote,
    duplicateNote,
    setNoteStarred,
  } = useStore();

  const urlQuery = searchParams.get('q') || '';
  const [activeFolder, setActiveFolder] = useState(null);
  const [search, setSearch] = useState(urlQuery);
  const [sort, setSort] = useState('Last Edited');
  const [view, setView] = useState('grid');
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [activeTags, setActiveTags] = useState([]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    setSearch(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    if (!multiSelect) setSelectedIds([]);
  }, [multiSelect]);

  function updateSearchUrl(nextValue) {
    const trimmed = nextValue.trim();
    const nextParams = new URLSearchParams(searchParams);
    if (trimmed) nextParams.set('q', trimmed);
    else nextParams.delete('q');
    setSearchParams(nextParams, { replace: true });
  }

  function handleSearchChange(value) {
    setSearch(value);
    updateSearchUrl(value);
  }

  const filtered = useMemo(() => notes.filter(note => {
    const matchFolder = !activeFolder || note.folder === activeFolder;
    const matchSearch = !search
      || note.title.toLowerCase().includes(search.toLowerCase())
      || note.preview.toLowerCase().includes(search.toLowerCase())
      || note.content.toLowerCase().includes(search.toLowerCase());
    const matchTags = activeTags.length === 0
      || activeTags.some(activeTag => note.tags.some(tag => tag.toLowerCase() === activeTag.toLowerCase()));
    return matchFolder && matchSearch && matchTags;
  }).sort((a, b) => {
    if (sort === 'Title') return a.title.localeCompare(b.title);
    if (sort === 'Created') return new Date(b.createdAtISO).getTime() - new Date(a.createdAtISO).getTime();
    return new Date(b.updatedAtISO).getTime() - new Date(a.updatedAtISO).getTime();
  }), [activeFolder, activeTags, notes, search, sort]);

  const selectedCount = selectedIds.length;
  const filterCount = [Boolean(activeFolder), activeTags.length > 0, Boolean(search.trim())].filter(Boolean).length;

  function toggleTag(tag) {
    setActiveTags(prev => (
      prev.some(existing => existing.toLowerCase() === tag.toLowerCase())
        ? prev.filter(existing => existing.toLowerCase() !== tag.toLowerCase())
        : [...prev, tag]
    ));
  }

  function handleCreateFolder() {
    const folderName = window.prompt('Folder name');
    if (!folderName) return;
    const created = addFolder(folderName, '#3b82f6');
    if (!created) {
      setStatus('Folder already exists.');
      return;
    }
    setStatus(`Folder "${created.name}" created.`);
  }

  function handleAddTag() {
    const tag = window.prompt('Tag name');
    if (!tag) return;
    const created = addTag(tag);
    if (!created) {
      setStatus('Tag already exists.');
      return;
    }
    setStatus(`Tag "${created}" added.`);
  }

  function toggleSelection(noteId) {
    setSelectedIds(prev => (
      prev.includes(noteId)
        ? prev.filter(id => id !== noteId)
        : [...prev, noteId]
    ));
  }

  function handleBulkDelete() {
    selectedIds.forEach(id => deleteNote(id));
    setStatus(`Deleted ${selectedIds.length} selected notes.`);
    setSelectedIds([]);
  }

  function handleBulkDuplicate() {
    selectedIds.forEach(id => duplicateNote(id));
    setStatus(`Duplicated ${selectedIds.length} selected notes.`);
    setSelectedIds([]);
  }

  function handleBulkStar() {
    selectedIds.forEach(id => setNoteStarred(id, true));
    setStatus(`Starred ${selectedIds.length} selected notes.`);
  }

  return (
    <div className="page">
      <div className="explorer-layout">
        <div className="explorer-sidebar slide-in">
          <div>
            <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
              <div className="sidebar-section-title">Folders & Tags</div>
              <button className="btn btn-primary btn-sm" onClick={handleCreateFolder}>Create</button>
            </div>
            <div className="sidebar-section-title" style={{ marginBottom: 6 }}>Folders</div>
            {folders.map(folder => (
              <div
                key={folder.name}
                className={`folder-item${activeFolder === folder.name ? ' active' : ''}`}
                onClick={() => setActiveFolder(activeFolder === folder.name ? null : folder.name)}
              >
                <div className="folder-dot" style={{ background: folder.color }} />
                <span className="folder-name">{folder.name}</span>
                <span className="folder-count">{folder.count}</span>
              </div>
            ))}
          </div>

          <div>
            <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
              <div className="sidebar-section-title">Tag Manager</div>
              <button className="add-tag-btn" onClick={handleAddTag}>+ Add Tag</button>
            </div>
            <div className="tag-manager">
              {tags.map(tag => (
                <span
                  key={tag}
                  className={`tag ${tagColors[tag.toLowerCase()] || 'tag-gray'}`}
                  style={{ opacity: activeTags.length && !activeTags.some(activeTag => activeTag.toLowerCase() === tag.toLowerCase()) ? 0.5 : 1 }}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="multi-select-row">
            <span>Multi-select</span>
            <div className={`toggle-switch${multiSelect ? ' on' : ''}`} onClick={() => setMultiSelect(current => !current)} />
          </div>
        </div>

        <div className="explorer-main">
          <div className="explorer-topbar">
            <div className="explorer-filter-badge">
              <FiFilter size={13} />
              Filtered: {filterCount}
            </div>
            <div className="explorer-search">
              <FiSearch size={13} color="var(--text-muted)" />
              <input
                placeholder="Search notes, tags, content..."
                value={search}
                onChange={event => handleSearchChange(event.target.value)}
              />
            </div>

            <div className="explorer-sort-select">
              <span>Sort</span>
              <select
                value={sort}
                onChange={event => setSort(event.target.value)}
                style={{ border: 'none', background: 'transparent', fontSize: 12, color: 'var(--text-secondary)', outline: 'none', cursor: 'pointer' }}
              >
                <option>Last Edited</option>
                <option>Created</option>
                <option>Title</option>
              </select>
              <FiChevronDown size={12} />
            </div>

            <div className="view-toggle">
              <button className={`view-btn${view === 'grid' ? ' active' : ''}`} onClick={() => setView('grid')}>
                <FiGrid size={13} />
              </button>
              <button className={`view-btn${view === 'list' ? ' active' : ''}`} onClick={() => setView('list')}>
                <FiList size={13} />
              </button>
            </div>

          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div className="explorer-stats" style={{ padding: 0 }}>
              Showing <span>{filtered.length} notes</span>
              {activeFolder && <span style={{ color: 'var(--accent)', marginLeft: 8 }}>Filtered by: {activeFolder}</span>}
            </div>
            <div className="flex items-center gap-2">
              {multiSelect && selectedCount > 0 && (
                <>
                  <button className="btn btn-ghost btn-sm" onClick={handleBulkStar}>Star Selected</button>
                  <button className="btn btn-ghost btn-sm" onClick={handleBulkDuplicate}>Duplicate</button>
                  <button className="btn btn-ghost btn-sm" onClick={handleBulkDelete}>Delete</button>
                </>
              )}
            </div>
          </div>

          {status && (
            <div style={{ padding: '8px 20px', color: 'var(--accent)', fontSize: 12 }}>
              {status}
            </div>
          )}
          {notesError && (
            <div style={{ padding: '8px 20px', color: 'var(--red)', fontSize: 12 }}>
              {notesError}
            </div>
          )}

          <div className="notes-grid" style={{ gridTemplateColumns: view === 'list' ? '1fr' : 'repeat(3,1fr)' }}>
            {notesLoading && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                Loading notes from Supabase...
              </div>
            )}
            {filtered.map(note => (
              <div key={note.id} style={{ position: 'relative' }}>
                {multiSelect && (
                  <label
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      zIndex: 2,
                      background: 'var(--surface)',
                      borderRadius: 4,
                      padding: 2,
                      border: '1px solid var(--border)',
                    }}
                    onClick={event => event.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(note.id)}
                      onChange={() => toggleSelection(note.id)}
                    />
                  </label>
                )}
                <NoteCard note={note} />
              </div>
            ))}
            {!notesLoading && filtered.length === 0 && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                No notes found. Use <strong>New Note</strong> in the navbar to create one.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
