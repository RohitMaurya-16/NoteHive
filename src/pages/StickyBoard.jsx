import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiPlus, FiCalendar, FiFilter, FiStar, FiPaperclip,
  FiEdit2, FiMoreHorizontal, FiFeather, FiArchive, FiSearch, FiExternalLink,
} from 'react-icons/fi';
import { useStore } from '../store/useStore';

const COLORS = {
  yellow: '#fbbf24',
  blue: '#60a5fa',
  green: '#34d399',
  red: '#f87171',
  purple: '#a78bfa',
};

const colorLabels = [
  { label: 'Quick', color: COLORS.yellow },
  { label: 'Study', color: COLORS.blue },
  { label: 'Important', color: COLORS.red },
];

function isSameDay(iso, compareDate = new Date()) {
  const date = new Date(iso);
  return date.getFullYear() === compareDate.getFullYear()
    && date.getMonth() === compareDate.getMonth()
    && date.getDate() === compareDate.getDate();
}

export default function StickyBoard() {
  const navigate = useNavigate();
  const {
    stickies,
    folders,
    addSticky,
    addFolder,
    updateSticky,
    deleteSticky,
    toggleStickyStar,
    toggleStickyArchived,
    convertStickyToNote,
    setActiveNote,
  } = useStore();
  const [activeTab, setActiveTab] = useState('Today');
  const [view, setView] = useState('Compact');
  const [tagFilter, setTagFilter] = useState('');
  const [folderFilter, setFolderFilter] = useState('');
  const [activeLabel, setActiveLabel] = useState('');
  const [chatInput, setChatInput] = useState('Ask how to convert review note to full note');
  const [chatResponse, setChatResponse] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [status, setStatus] = useState('');

  const folderOptions = useMemo(() => {
    const folderMap = new Map();
    folders.forEach(folder => folderMap.set(folder.name.toLowerCase(), folder.name));
    stickies.forEach(sticky => {
      const name = sticky.folder || 'Notes';
      folderMap.set(name.toLowerCase(), name);
    });
    if (!folderMap.has('notes')) folderMap.set('notes', 'Notes');
    return Array.from(folderMap.values()).sort((a, b) => a.localeCompare(b));
  }, [folders, stickies]);

  function resolveFolderName(name) {
    const clean = typeof name === 'string' ? name.trim() : '';
    if (!clean) return 'Notes';
    const existing = folderOptions.find(folder => folder.toLowerCase() === clean.toLowerCase());
    return existing || clean;
  }

  const filteredStickies = useMemo(() => stickies.filter(sticky => {
    const tabMatch = activeTab === 'All'
      || (activeTab === 'Archived' ? sticky.archived : (!sticky.archived && isSameDay(sticky.updatedAtISO)));
    const labelMatch = !activeLabel || sticky.tag.toLowerCase() === activeLabel.toLowerCase();
    const folderMatch = !folderFilter || (sticky.folder || 'Notes').toLowerCase() === folderFilter.toLowerCase();
    const query = tagFilter.trim().toLowerCase();
    const textMatch = !query
      || sticky.title.toLowerCase().includes(query)
      || sticky.body.toLowerCase().includes(query)
      || sticky.tag.toLowerCase().includes(query)
      || (sticky.folder || 'Notes').toLowerCase().includes(query);
    return tabMatch && labelMatch && folderMatch && textMatch;
  }), [activeLabel, activeTab, folderFilter, stickies, tagFilter]);

  function handleAsk() {
    const query = chatInput.trim().toLowerCase();
    if (!query) return;
    const match = stickies.find(sticky => (
      sticky.title.toLowerCase().includes(query)
      || sticky.body.toLowerCase().includes(query)
      || sticky.tag.toLowerCase().includes(query)
      || (sticky.folder || 'Notes').toLowerCase().includes(query)
    ));
    if (match) {
      setChatResponse(`Matched sticky: "${match.title}". Use the paperclip button to convert it into a full note.`);
    } else {
      setChatResponse('No direct sticky match found. Try a shorter keyword from the sticky title.');
    }
  }

  async function handleConvertSticky(stickyId) {
    const note = await convertStickyToNote(stickyId, { deleteOriginal: false });
    if (!note) return;
    setActiveNote(note);
    setStatus(`Sticky converted to note in "${note.folder}" and opened in editor.`);
    navigate('/editor');
  }

  function handleAddSticky() {
    const sticky = addSticky({
      tag: activeLabel || 'Quick',
      folder: resolveFolderName(folderFilter || 'Notes'),
    });
    setStatus(`New sticky created in "${sticky.folder}".`);
  }

  function handleCreateFolder() {
    const folderName = window.prompt('Folder name');
    if (!folderName || !folderName.trim()) return;
    const cleanName = folderName.trim();
    const created = addFolder(cleanName, '#6366f1');
    const resolved = resolveFolderName(cleanName);
    if (!created) {
      setStatus('Folder already exists.');
      setFolderFilter(resolved);
      return;
    }
    setFolderFilter(created.name);
    setStatus(`Folder "${created.name}" created.`);
  }

  function toggleLabel(label) {
    setActiveLabel(current => (current === label ? '' : label));
  }

  return (
    <div className="page">
      <div className="sticky-topbar">
        {['Today', 'Archived', 'All'].map(tab => (
          <button
            key={tab}
            className={`sticky-tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}

        <div className="sticky-date-badge">
          <FiCalendar size={12} />
          {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>

        <div className="sticky-view-toggle">
          <span style={{ color: 'var(--text-muted)' }}>View</span>
          {['Compact', 'Expanded'].map(mode => (
            <span
              key={mode}
              className={`sticky-view-opt${view === mode ? ' active' : ''}`}
              onClick={() => setView(mode)}
            >
              {mode}
            </span>
          ))}
        </div>

        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>Filter by:</span>
        {colorLabels.map(item => (
          <span
            key={item.label}
            className="filter-label"
            onClick={() => toggleLabel(item.label)}
            style={{
              background: `${item.color}${activeLabel === item.label ? '' : '22'}`,
              color: activeLabel === item.label ? '#fff' : item.color,
              borderColor: `${item.color}55`,
            }}
          >
            {item.label}
          </span>
        ))}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <FiFilter size={12} color="var(--text-muted)" />
          <input
            className="sticky-tags-input"
            placeholder="Tags or text"
            value={tagFilter}
            onChange={event => setTagFilter(event.target.value)}
          />
        </div>
        <select
          className="sticky-tags-input"
          value={folderFilter}
          onChange={event => setFolderFilter(event.target.value)}
          title="Filter by folder"
        >
          <option value="">All folders</option>
          {folderOptions.map(folder => (
            <option key={folder} value={folder}>{folder}</option>
          ))}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={handleCreateFolder}>New Folder</button>

        <button 
          className="btn btn-primary btn-sm" 
          onClick={() => window.open('https://dsa-notes-vault-20260317.netlify.app/', '_blank')}
          title="Open DSA & Code Notes Vault"
          style={{ marginLeft: 12, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <FiExternalLink size={14} />
          DSA Notes Vault
        </button>
      </div>

      {status && (
        <div style={{ padding: '8px 24px', fontSize: 12, color: 'var(--accent)' }}>
          {status}
        </div>
      )}

      <div className="sticky-grid fade-in">
        {filteredStickies.map(sticky => {
          const isEditing = editingId === sticky.id;
          return (
            <div className="sticky-card" key={sticky.id}>
              <div className="sticky-card-strip" style={{ background: sticky.color }} />
              <div className="sticky-card-body">
                {isEditing ? (
                  <>
                    <input
                      className="sticky-tags-input"
                      style={{ marginBottom: 6, width: '100%', fontWeight: 'bold' }}
                      value={sticky.title}
                      onChange={event => updateSticky(sticky.id, { title: event.target.value })}
                      autoFocus
                    />
                    <textarea
                      className="sticky-tags-input"
                      style={{ width: '100%', minHeight: '60px', resize: 'vertical' }}
                      value={sticky.body}
                      onChange={event => updateSticky(sticky.id, { body: event.target.value })}
                    />
                    <input
                      className="sticky-tags-input"
                      style={{ width: '100%', marginTop: 6 }}
                      value={sticky.tag}
                      onChange={event => updateSticky(sticky.id, { tag: event.target.value || 'Quick' })}
                    />
                    <input
                      className="sticky-tags-input"
                      style={{ width: '100%', marginTop: 6 }}
                      list={`sticky-folder-list-${sticky.id}`}
                      value={sticky.folder || 'Notes'}
                      onChange={event => updateSticky(sticky.id, { folder: resolveFolderName(event.target.value) })}
                      placeholder="Folder"
                    />
                    <datalist id={`sticky-folder-list-${sticky.id}`}>
                      {folderOptions.map(folder => (
                        <option key={folder} value={folder} />
                      ))}
                    </datalist>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                      <h3>{sticky.title}</h3>
                      <FiMoreHorizontal size={14} color="var(--text-muted)" style={{ cursor: 'pointer', flexShrink: 0 }} />
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span className="tag tag-gray">{sticky.tag}</span>
                      <span className="tag tag-blue">{sticky.folder || 'Notes'}</span>
                    </div>
                    {view === 'Expanded'
                      ? <p>{sticky.body}</p>
                      : <p style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{sticky.body}</p>
                    }
                  </>
                )}
              </div>
              <div className="sticky-card-footer">
                <button className="icon-btn" onClick={() => toggleStickyStar(sticky.id)} title="Star">
                  <FiStar size={13} fill={sticky.starred ? 'currentColor' : 'none'} />
                </button>
                <button className="icon-btn" onClick={() => handleConvertSticky(sticky.id)} title="Convert to note">
                  <FiPaperclip size={13} />
                </button>
                <button className="icon-btn" onClick={() => setEditingId(isEditing ? null : sticky.id)}>
                  {isEditing ? 'Save' : <FiEdit2 size={13} />}
                </button>
                <button className="icon-btn" onClick={() => toggleStickyArchived(sticky.id)} title="Archive">
                  <FiArchive size={13} />
                </button>
                <button className="icon-btn" onClick={() => deleteSticky(sticky.id)} style={{ fontSize: 13 }} title="Delete">x</button>
                <span className="sticky-card-time">{sticky.time}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="sticky-footer">
        <div className="sticky-footer-brand">
          <h3>
            <FiFeather size={14} style={{ marginRight: 6 }} />
            NoteHive
          </h3>
          <p>Copyright 2026 NoteHive, Inc.</p>
          <p style={{ marginTop: 8 }}>
            Organize ideas quickly with sticky boards. Convert stickies to full notes when you need deeper work.
          </p>
          <p style={{ marginTop: 12, fontSize: 11, color: '#718096' }}>
            Tips: Use labels for fast filtering and archive completed stickies to keep the board clean.
          </p>
        </div>

        <div>
          <div className="chatbot-widget">
            <div className="chatbot-header">
              <div>
                <span className="online-dot" />
                <span className="chatbot-title">NoteHive Chatbot</span>
                <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 600 }}>Online</span>
              </div>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Ask about a sticky, convert it to a full note, or find related resources.
            </p>
            <div className="chatbot-input-row">
              <input
                className="chatbot-input"
                value={chatInput}
                onChange={event => setChatInput(event.target.value)}
                onKeyDown={event => event.key === 'Enter' && handleAsk()}
              />
              <button className="chatbot-ask-btn" onClick={handleAsk}>
                <FiSearch size={12} style={{ marginRight: 4 }} />
                Ask
              </button>
            </div>
            {chatResponse && (
              <p style={{ marginTop: 8, fontSize: 11, color: 'var(--text-primary)' }}>{chatResponse}</p>
            )}
          </div>
        </div>
      </div>

      <button className="fab-btn" onClick={handleAddSticky}>
        <FiPlus size={22} />
      </button>
    </div>
  );
}
