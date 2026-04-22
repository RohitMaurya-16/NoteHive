import { useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiBold, FiItalic, FiCode, FiList, FiChevronLeft, FiStar,
  FiClock, FiSave, FiPlay, FiEye, FiEdit, FiX,
} from 'react-icons/fi';
import { useStore } from '../store/useStore';
import NoteContentRenderer from '../components/NoteContentRenderer';

function relativeLabel(iso) {
  if (!iso) return 'just now';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'just now';
  const diff = Date.now() - date.getTime();
  if (diff < 60 * 1000) return 'just now';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m ago`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}h ago`;
  if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / (24 * 60 * 60 * 1000))}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function NoteEditor() {
  const navigate = useNavigate();
  const textareaRef = useRef(null);
  const {
    activeNote,
    setActiveNote,
    addNote,
    addFolder,
    updateNote,
    notes,
    folders,
    setNoteStarred,
    isAdmin,
  } = useStore();

  const [activeTab, setActiveTab] = useState('Edit');
  const [activeCtx, setActiveCtx] = useState('Context');
  const [language, setLanguage] = useState('English');
  const [showHistory, setShowHistory] = useState(false);
  const [status, setStatus] = useState('');
  const [editorMode, setEditorMode] = useState('read');
  const activeNoteId = activeNote?.id;

  useEffect(() => {
    setEditorMode('read');
    setActiveTab('Edit');
  }, [activeNoteId]);

  let localResources = [];
  if (activeNoteId) {
    const localStorageKey = `nh_resources_${activeNoteId}`;
    try {
      const stored = localStorage.getItem(localStorageKey);
      const resources = stored ? JSON.parse(stored) : [];
      localResources = Array.isArray(resources) ? resources.filter(r => typeof r === 'string') : [];
    } catch {
      localResources = [];
    }
  }

  async function handleCreateFirstNote() {
    const created = await addNote();
    if (created) setActiveNote(created);
  }

  const title = activeNote?.title || 'Untitled Note';
  const content = activeNote?.content || '';
  const currentFolder = activeNote?.folder || 'Notes';
  const starred = Boolean(activeNote?.starred);
  const savedLabel = `Saved ${relativeLabel(activeNote?.updatedAtISO)}`;
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const readTimeMinutes = Math.max(1, Math.ceil(wordCount / 220));

  const folderOptions = useMemo(() => {
    const map = new Map();
    folders.forEach(folder => map.set(folder.name.toLowerCase(), folder.name));
    if (!map.has(currentFolder.toLowerCase())) map.set(currentFolder.toLowerCase(), currentFolder);
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [folders, currentFolder]);

  function resolveFolderName(name) {
    const clean = typeof name === 'string' ? name.trim() : '';
    if (!clean) return 'Notes';
    const existing = folderOptions.find(folder => folder.toLowerCase() === clean.toLowerCase());
    return existing || clean;
  }

  const selectedFolder = resolveFolderName(currentFolder);

  const recentItems = useMemo(
    () => notes.slice(0, 4),
    [notes],
  );

  const relatedNotes = useMemo(() => {
    if (!activeNote) return [];
    return notes
      .filter(note => note.id !== activeNote.id && note.folder === activeNote.folder)
      .slice(0, 5);
  }, [activeNote, notes]);

  const history = useMemo(
    () => (activeNote?.history || []).slice().reverse(),
    [activeNote?.history],
  );

  function updateCurrentNote(changes, options = {}) {
    if (!activeNote) return;
    return updateNote(activeNote.id, changes, options);
  }

  function handleTitleChange(event) {
    updateCurrentNote({ title: event.target.value }, { touchUpdatedAt: false, trackHistory: false, persist: false });
  }

  function handleContentChange(event) {
    updateCurrentNote({ content: event.target.value }, { touchUpdatedAt: false, trackHistory: false, persist: false });
  }

  async function handleFolderChange(event) {
    const nextFolder = resolveFolderName(event.target.value);
    if (!nextFolder || !activeNote || nextFolder === currentFolder) return;
    addFolder(nextFolder);
    const updated = await updateCurrentNote(
      { folder: nextFolder },
      { touchUpdatedAt: true, trackHistory: false, persist: true },
    );
    if (updated) setStatus(`Moved to folder "${updated.folder}".`);
  }

  async function handleCreateFolder() {
    if (!activeNote) return;
    const folderName = window.prompt('Folder name');
    if (!folderName || !folderName.trim()) return;
    const cleanName = folderName.trim();
    addFolder(cleanName);
    const nextFolder = resolveFolderName(cleanName);
    const updated = await updateCurrentNote(
      { folder: nextFolder },
      { touchUpdatedAt: true, trackHistory: false, persist: true },
    );
    if (updated) setStatus(`Folder "${updated.folder}" ready.`);
  }

  async function handleSave() {
    const saved = await updateCurrentNote({ title, content }, { touchUpdatedAt: true, trackHistory: true, persist: true });
    setStatus(saved ? 'Saved to Supabase.' : 'Save failed.');
  }

  function handleToggleStar() {
    if (!activeNote) return;
    setNoteStarred(activeNote.id, !starred);
  }

  function openNote(note) {
    setActiveNote(note);
    setShowHistory(false);
  }

  function applyInline(prefix, suffix = prefix) {
    const el = textareaRef.current;
    if (!el || !activeNote) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = content.slice(start, end) || 'text';
    const replacement = `${prefix}${selected}${suffix}`;
    const next = `${content.slice(0, start)}${replacement}${content.slice(end)}`;
    updateCurrentNote({ content: next }, { touchUpdatedAt: false, trackHistory: false, persist: false });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  }

  function applyList() {
    const el = textareaRef.current;
    if (!el || !activeNote) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = content.slice(start, end) || 'List item';
    const lines = selected.split('\n').map(line => (line.trim() ? `- ${line}` : '- '));
    const replacement = lines.join('\n');
    const next = `${content.slice(0, start)}${replacement}${content.slice(end)}`;
    updateCurrentNote({ content: next }, { touchUpdatedAt: false, trackHistory: false, persist: false });
  }

  async function addResource() {
    if (!activeNote) return;
    const url = window.prompt('Paste resource URL');
    if (!url || !url.trim()) return;
    
    const newUrl = url.trim();
    if (localResources.includes(newUrl)) {
      setStatus('Resource already exists.');
      return;
    }

    const updated = [...localResources, newUrl];
    const localStorageKey = `nh_resources_${activeNote.id}`;
    localStorage.setItem(localStorageKey, JSON.stringify(updated));
    setStatus('Resource saved locally.');
  }

  async function removeResource(resourceUrl) {
    if (!activeNote) return;
    const updated = localResources.filter(url => url !== resourceUrl);
    const localStorageKey = `nh_resources_${activeNote.id}`;
    localStorage.setItem(localStorageKey, JSON.stringify(updated));
    setStatus('Resource removed.');
  }

  function openInKB() {
    const query = title.trim() || 'note';
    navigate(`/kb?q=${encodeURIComponent(query)}`);
  }

  function restoreVersion(version) {
    if (!activeNote) return;
    updateCurrentNote(
      { title: version.title, content: version.content },
      { touchUpdatedAt: true, trackHistory: true },
    );
    setShowHistory(false);
    setStatus('Version restored.');
  }

  if (!activeNote) {
    return (
      <div className="page">
        <div className="ml-layout">
          <section className="card" style={{ padding: 18 }}>
            <h2 style={{ marginBottom: 8 }}>No note selected</h2>
            <p style={{ marginBottom: 12, color: 'var(--text-secondary)' }}>
              Select a note from explorer/dashboard or create a new one.
            </p>
            <button className="btn btn-primary" onClick={handleCreateFirstNote}>Create New Note</button>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="page note-editor-page">
      <div className="editor-topbar">
        <input
          className="editor-title-input"
          value={title}
          onChange={handleTitleChange}
          placeholder="Note title..."
          disabled={editorMode === 'read' || !isAdmin}
          style={{ opacity: (editorMode === 'read' || !isAdmin) ? 0.7 : 1, cursor: (editorMode === 'read' || !isAdmin) ? 'default' : 'text' }}
        />
        <div className="editor-tags">
          {(activeNote?.tags || []).slice(0, 3).map(tag => (
            <span key={tag} className="tag tag-blue">{tag}</span>
          ))}
          <select
            className="editor-lang-select"
            value={selectedFolder}
            onChange={handleFolderChange}
            title="Note folder"
            disabled={editorMode === 'read' || !isAdmin}
            style={{ opacity: (editorMode === 'read' || !isAdmin) ? 0.7 : 1, cursor: (editorMode === 'read' || !isAdmin) ? 'default' : 'pointer' }}
          >
            {folderOptions.map(folder => (
              <option key={folder} value={folder}>{folder}</option>
            ))}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={handleCreateFolder} disabled={editorMode === 'read' || !isAdmin}>+ Folder</button>
        </div>
        <select className="editor-lang-select" value={language} onChange={event => setLanguage(event.target.value)}>
          <option>English</option>
          <option>Spanish</option>
          <option>French</option>
        </select>
        <span className="saved-badge">{savedLabel}</span>
        <div className="editor-mode-toggle" role="group" aria-label="Editor mode">
          <button
            className={`btn btn-sm editor-mode-btn ${editorMode === 'read' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setEditorMode('read')}
            title="Read Mode"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <FiEye size={13} /> Read
          </button>
          <button
            className={`btn btn-sm editor-mode-btn ${editorMode === 'write' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setEditorMode('write')}
            title="Write Mode"
            disabled={!isAdmin}
            style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: isAdmin ? 1 : 0.5, cursor: isAdmin ? 'pointer' : 'not-allowed' }}
          >
            <FiEdit size={13} /> Write
          </button>
        </div>
        {isAdmin && (
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={editorMode === 'read'}>
            <FiSave size={13} /> Save
          </button>
        )}
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleToggleStar}
          style={{ color: starred ? 'var(--yellow)' : undefined }}
        >
          <FiStar size={14} fill={starred ? 'currentColor' : 'none'} />
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowHistory(current => !current)}>
          <FiClock size={13} /> Version History
        </button>
        <button className="btn btn-primary btn-sm" style={{ background: 'var(--text-primary)' }} onClick={() => setActiveTab('Preview')}>
          <FiPlay size={12} /> Preview
        </button>
      </div>

      {showHistory && (
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Version History</div>
          {history.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No previous versions yet.</div>}
          {history.slice(0, 5).map(version => (
            <div key={version.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>
                {version.savedAt} - {version.title}
              </span>
              <button className="note-action-btn" onClick={() => restoreVersion(version)}>Restore</button>
            </div>
          ))}
        </div>
      )}

      <div className="editor-layout">
        <div className="editor-workspace">
          <div className="workspace-section">
            <div className="workspace-section-title">
              Workspace <FiChevronLeft size={12} style={{ cursor: 'pointer' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Folders
            </div>
            {folders.map(folder => (
              <div className="workspace-folder" key={folder.name} onClick={() => navigate(`/explorer?q=${encodeURIComponent(folder.name)}`)}>
                <div className="workspace-folder-dot" style={{ background: folder.color }} />
                <span className="workspace-folder-name" title={folder.name}>{folder.name}</span>
                <span className="workspace-folder-count">{folder.count} notes</span>
              </div>
            ))}
          </div>
          <div className="workspace-section">
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Recent
            </div>
            {recentItems.map(item => (
              <div className="workspace-recent-item" key={item.id} onClick={() => openNote(item)}>
                <div className="workspace-recent-title">{item.title}</div>
                <div className="workspace-recent-date">Updated {item.updatedAt}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="editor-center">
          <div className="editor-tabs">
            {['Edit', 'Preview', 'WYSIWYG (Theory)', 'Code Editor'].map(tab => (
              <div
                key={tab}
                className={`editor-tab${activeTab === tab ? ' active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </div>
            ))}
            <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', paddingBottom: 6, display: 'flex', alignItems: 'flex-end', gap: 12 }}>
              <span>Auto-save: <span style={{ color: 'var(--green)', fontWeight: 600 }}>ON</span></span>
              <button className="btn btn-accent btn-sm" onClick={() => setStatus('Published to local draft.')}>Publish</button>
            </div>
          </div>

          <div className="editor-toolbar">
            <button className="toolbar-btn" title="Bold" onClick={() => applyInline('**', '**')} disabled={editorMode === 'read'}>
              <FiBold size={13} />
            </button>
            <button className="toolbar-btn" title="Italic" onClick={() => applyInline('*', '*')} disabled={editorMode === 'read'}>
              <FiItalic size={13} />
            </button>
            <button className="toolbar-btn" title="Code" onClick={() => applyInline('`', '`')} disabled={editorMode === 'read'}>
              <FiCode size={13} />
            </button>
            <button className="toolbar-btn" title="List" onClick={applyList} disabled={editorMode === 'read'}>
              <FiList size={13} />
            </button>
            <div className="toolbar-sep" />
            <span className="editor-toolbar-info">
              Length: {wordCount} words
            </span>
          </div>

          <div className="editor-content">
            {activeTab === 'Edit' && (
              editorMode === 'read'
                ? (
                  <article className="note-reading-panel">
                    <header className="note-reading-hero">
                      <h1 className="note-reading-title">{title || 'Untitled Note'}</h1>
                      <div className="note-reading-meta">
                        <span>{selectedFolder}</span>
                        <span>{wordCount} words</span>
                        <span>{readTimeMinutes} min read</span>
                        <span>{savedLabel}</span>
                      </div>
                    </header>
                    <div className="note-reading-content">
                      <NoteContentRenderer
                        content={content}
                        emptyMessage="Nothing written yet. Switch to Write mode to start editing."
                      />
                    </div>
                  </article>
                )
                : (
                  <textarea
                    ref={textareaRef}
                    className="editor-textarea"
                    placeholder="Start typing your note here..."
                    value={content}
                    onChange={handleContentChange}
                  />
                )
            )}
            {activeTab === 'Preview' && (
              <section className="note-preview-panel">
                <div className="note-preview-label">Formatted Preview</div>
                <NoteContentRenderer content={content} emptyMessage="Nothing to preview yet." />
              </section>
            )}
            {activeTab === 'WYSIWYG (Theory)' && (
              <section className="note-preview-panel note-preview-theory">
                <div className="note-preview-label">Theory Layout</div>
                <NoteContentRenderer content={content} emptyMessage="No theory content yet." />
              </section>
            )}
            {activeTab === 'Code Editor' && (
              <pre className="note-code-editor">{content || '// No code yet'}</pre>
            )}
          </div>
        </div>

        <div className="editor-context">
          <div className="context-tabs">
            {['Context', 'Metadata'].map(tab => (
              <div
                key={tab}
                className={`context-tab${activeCtx === tab ? ' active' : ''}`}
                onClick={() => setActiveCtx(tab)}
              >
                {tab}
              </div>
            ))}
          </div>
          <div className="context-body">
            {activeCtx === 'Context' && (
              <>
                <div className="context-author">
                  <div className="context-author-avatar">P</div>
                  <div>
                    <div className="context-author-name">Project Owner</div>
                    <div className="context-author-role">Author</div>
                  </div>
                </div>

                <div className="context-section-title">Related Notes</div>
                {relatedNotes.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No related notes in this folder yet.</div>
                )}
                {relatedNotes.map(note => (
                  <div className="related-note-item" key={note.id} onClick={() => openNote(note)}>
                    <div className="related-note-title">{note.title}</div>
                    <div className="related-note-date">Updated {note.updatedAt}</div>
                  </div>
                ))}

                <div className="context-section-title">Quick Actions</div>
                <button className="quick-action-btn" onClick={addResource} disabled={editorMode === 'read'}>Attach Resource</button>
                <button className="quick-action-btn" onClick={openInKB}>Link to KB</button>
              </>
            )}

            {activeCtx === 'Metadata' && (
              <>
                <div className="context-meta-row">Created: {activeNote?.createdAt}</div>
                <div className="context-meta-row">Updated: {activeNote?.updatedAt}</div>
                <div className="context-meta-row">Folder: {activeNote?.folder || 'Notes'}</div>
                <div className="context-meta-row">Type: {activeNote?.type || 'theory'}</div>

                <div className="context-section-title">Tags Summary</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {(activeNote?.tags || []).length === 0 && <span className="tag tag-gray">no-tags</span>}
                  {(activeNote?.tags || []).map(tag => (
                    <span className="tag tag-blue" key={tag}>{tag}</span>
                  ))}
                </div>

                <div className="context-section-title">Resources</div>
                {localResources.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No resources attached yet.</div>
                )}
                {localResources.map(link => (
                  <div key={link} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 8, padding: '6px 8px', background: 'var(--surface)', borderRadius: 4 }}>
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      style={{ flex: 1, fontSize: 11, color: 'var(--accent)', wordBreak: 'break-all', textDecoration: 'underline' }}
                    >
                      {link}
                    </a>
                    <button
                      className="icon-btn"
                      onClick={() => removeResource(link)}
                      title="Remove resource"
                      style={{ flexShrink: 0, color: 'var(--text-muted)', opacity: 0.6 }}
                      disabled={editorMode === 'read'}
                    >
                      <FiX size={12} />
                    </button>
                  </div>
                ))}
              </>
            )}

            {status && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--accent)' }}>
                {status}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
