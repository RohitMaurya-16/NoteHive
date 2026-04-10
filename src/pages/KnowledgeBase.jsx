import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  FiAlertCircle,
  FiBook,
  FiCode,
  FiHelpCircle,
  FiMic,
  FiPlus,
  FiSearch,
  FiSend,
} from 'react-icons/fi';
import { useStore } from '../store/useStore';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://notehive-backend-wi97.onrender.com';
const KB_CHAT_STORAGE_KEY = 'nh_kb_chat_messages';
const scopeFields = ['Titles', 'Content', 'Code Blocks', 'Questions'];
const filterPills = ['Recent', 'Important', 'Has Code', 'Has Questions'];

const initialMessages = [
  {
    id: 'welcome-assistant',
    role: 'assistant',
    source: 'internal',
    text: 'I answer from your internal notes first. Ask a question and I will cite matched notes.',
    citedNotes: [],
    relatedNotes: [],
    actions: [],
  },
];

function getTypeIcon(type) {
  if (type === 'theory') return <FiBook size={11} />;
  if (type === 'code') return <FiCode size={11} />;
  return <FiHelpCircle size={11} />;
}

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
      // ignore payload parse errors
    }
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

function toChatHistory(messages) {
  return messages
    .filter(message => message.role === 'assistant' || message.role === 'user')
    .map(message => ({
      role: message.role,
      content: message.text,
    }))
    .slice(-10);
}

function buildAssistantMessage(payload) {
  const data = payload?.data || {};
  const references = Array.isArray(data.references) ? data.references : [];
  const related = Array.isArray(data.related) ? data.related : [];
  const actions = Array.isArray(data.actions) ? data.actions : [];

  return {
    id: `assistant-${Date.now()}`,
    role: 'assistant',
    source: data.source === 'fallback' ? 'fallback' : 'internal',
    text: typeof data.answer === 'string' && data.answer.trim()
      ? data.answer
      : 'I could not generate a response.',
    citedNotes: references.map(reference => ({
      id: reference.id,
      title: reference.title || 'Untitled Note',
      author: reference.updatedAt ? `Updated ${new Date(reference.updatedAt).toLocaleDateString('en-US')}` : 'Updated recently',
      similarity: Number(reference.similarity || 0),
      snippet: reference.snippet || '',
      folder: reference.folder || 'Notes',
    })),
    relatedNotes: related.map(reference => ({
      id: reference.id,
      title: reference.title || 'Untitled Note',
      folder: reference.folder || 'Notes',
    })),
    actions: actions.map(action => ({
      type: action.type,
      label: action.label || 'Open',
      noteId: action.noteId || null,
      path: action.path || null,
    })),
  };
}

function normalizeStoredMessage(message, index) {
  if (!message || typeof message !== 'object') return null;
  const role = message.role === 'user' ? 'user' : 'assistant';
  const text = typeof message.text === 'string' ? message.text.trim() : '';
  if (!text) return null;

  return {
    id: typeof message.id === 'string' && message.id ? message.id : `restored-${Date.now()}-${index}`,
    role,
    source: message.source === 'fallback' ? 'fallback' : 'internal',
    text,
    citedNotes: Array.isArray(message.citedNotes) ? message.citedNotes : [],
    relatedNotes: Array.isArray(message.relatedNotes) ? message.relatedNotes : [],
    actions: Array.isArray(message.actions) ? message.actions : [],
  };
}

function loadStoredMessages() {
  try {
    const raw = localStorage.getItem(KB_CHAT_STORAGE_KEY);
    if (!raw) return initialMessages;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return initialMessages;
    const restored = parsed.map((item, index) => normalizeStoredMessage(item, index)).filter(Boolean);
    return restored.length ? restored : initialMessages;
  } catch {
    return initialMessages;
  }
}

export default function KnowledgeBase() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    setActiveNote,
    notes,
    notesLoading,
    notesError,
    saveSmartCollection,
    addNote,
  } = useStore();

  const query = searchParams.get('q') || '';
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState(() => loadStoredMessages());
  const [status, setStatus] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [scopes, setScopes] = useState({
    Titles: true,
    Content: true,
    'Code Blocks': true,
    Questions: true,
  });
  const [activeFilters, setActiveFilters] = useState([]);

  useEffect(() => {
    try {
      localStorage.setItem(KB_CHAT_STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // ignore storage write failures in constrained environments
    }
  }, [messages]);

  function updateQuery(next) {
    const params = new URLSearchParams(searchParams);
    if (next.trim()) params.set('q', next.trim());
    else params.delete('q');
    setSearchParams(params, { replace: true });
  }

  const recentNoteIds = useMemo(() => {
    const sorted = [...notes]
      .sort((a, b) => new Date(b.updatedAtISO).getTime() - new Date(a.updatedAtISO).getTime())
      .slice(0, Math.max(5, Math.ceil(notes.length * 0.35)));
    return new Set(sorted.map(note => note.id));
  }, [notes]);

  const filteredNotes = useMemo(() => notes.filter(note => {
    const lower = query.trim().toLowerCase();
    const hasQuery = Boolean(lower);
    const inTitle = scopes.Titles && note.title.toLowerCase().includes(lower);
    const inContent = scopes.Content && note.content.toLowerCase().includes(lower);
    const inCode = scopes['Code Blocks'] && (
      note.type === 'code'
      || note.content.includes('```')
      || note.preview.includes('const ')
    ) && (!hasQuery || note.content.toLowerCase().includes(lower) || note.preview.toLowerCase().includes(lower));
    const inQuestions = scopes.Questions && (
      note.type === 'question'
      || note.title.includes('?')
      || note.content.includes('?')
    ) && (!hasQuery || note.title.toLowerCase().includes(lower) || note.content.toLowerCase().includes(lower));

    if (hasQuery && !(inTitle || inContent || inCode || inQuestions)) return false;

    const hasCode = note.type === 'code' || note.content.includes('```') || note.preview.includes('const ');
    const hasQuestions = note.type === 'question' || note.title.includes('?') || note.content.includes('?');

    const filterChecks = {
      Recent: recentNoteIds.has(note.id),
      Important: note.starred,
      'Has Code': hasCode,
      'Has Questions': hasQuestions,
    };

    return activeFilters.every(filter => filterChecks[filter]);
  }), [activeFilters, notes, query, recentNoteIds, scopes]);

  function toggleFilter(filter) {
    setActiveFilters(prev => (
      prev.includes(filter)
        ? prev.filter(item => item !== filter)
        : [...prev, filter]
    ));
  }

  function handleOpenNote(note) {
    setActiveNote(note);
    navigate('/editor');
  }

  async function handleOpenNoteById(noteId) {
    const local = notes.find(item => Number(item.id) === Number(noteId));
    if (local) {
      handleOpenNote(local);
      return;
    }

    try {
      const payload = await apiRequest(`/api/notes/${encodeURIComponent(noteId)}`);
      const remote = payload?.data;
      if (!remote) {
        setStatus('Note reference exists but could not be loaded.');
        return;
      }
      navigate(`/explorer?q=${encodeURIComponent(remote.title || String(noteId))}`);
      setStatus('Note is outside current cache. Open it from explorer results.');
    } catch {
      setStatus('Could not open referenced note.');
    }
  }

  async function sendMessage() {
    const text = chatInput.trim();
    if (!text || chatLoading) return;

    const userMessage = { id: `user-${Date.now()}`, role: 'user', text };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setChatInput('');
    setChatLoading(true);
    setStatus('');

    try {
      // Always search internal notes first
      const internalPayload = await apiRequest('/api/chat/query', {
        method: 'POST',
        body: JSON.stringify({
          message: text,
          history: toChatHistory(nextMessages),
          topK: 6,
        }),
      });

      const assistantMessage = buildAssistantMessage(internalPayload);
      let finalText = assistantMessage.text;
      let hasInternalMatch = (assistantMessage.citedNotes || []).length > 0;

      // If no internal notes matched OR web search is enabled, search the web
      if (useWebSearch || !hasInternalMatch) {
        try {
          const webPayload = await apiRequest('/api/search/web', {
            method: 'POST',
            body: JSON.stringify({
              query: text,
              limit: 5,
            }),
          });

          if (webPayload?.data?.ok && webPayload.data.results?.length > 0) {
            const webResults = webPayload.data.results
              .map((r, i) => `${i + 1}. **${r.title}** (${r.url})\n   ${r.snippet}`)
              .join('\n\n');
            
            if (hasInternalMatch) {
              // If we have internal notes, show both
              finalText = `${finalText}\n\n---\n\n**Web Search Results:**\n${webResults}`;
            } else {
              // If no internal notes, show web results as main answer
              finalText = `**Web Search Results for "${text}":**\n\n${webResults}`;
            }
          } else if (!hasInternalMatch) {
            // No internal match and no web results
            finalText = `No results found for "${text}". Try searching with different keywords.`;
          }
        } catch (webError) {
          if (!hasInternalMatch) {
            finalText = `Could not find information about "${text}". Please try rephrasing or searching with different keywords.`;
          }
          console.warn('[KB] Web search failed:', webError.message);
        }
      }

      assistantMessage.text = finalText;
      setMessages(prev => [...prev, assistantMessage]);
      
      if (hasInternalMatch && useWebSearch) {
        setStatus('Answer from notes and web search.');
      } else if (hasInternalMatch) {
        setStatus('Answer from your internal knowledge base.');
      } else {
        setStatus('Answer from web search.');
      }
    } catch (error) {
      const errorText = String(error.message || '').trim();

      setMessages(prev => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          source: 'fallback',
          text: `Chat request failed: ${errorText}`,
          citedNotes: [],
          relatedNotes: [],
          actions: [],
        },
      ]);
      setStatus('Could not reach chat backend.');
    } finally {
      setChatLoading(false);
    }
  }

  function saveSearchCollection() {
    const name = window.prompt('Collection name');
    if (!name) return;
    saveSmartCollection(name, query, { scopes, activeFilters });
    setStatus(`Saved smart collection "${name}".`);
  }

  async function saveTranscriptAsNote() {
    const transcript = messages
      .map(message => `${message.role === 'assistant' ? 'Assistant' : 'You'}: ${message.text}`)
      .join('\n\n');

    const note = await addNote({
      title: `KB Transcript - ${new Date().toLocaleDateString('en-US')}`,
      content: transcript,
      folder: 'Notes',
      tags: ['kb', 'transcript'],
      type: 'theory',
    });
    if (!note) {
      setStatus('Could not save transcript to backend.');
      return;
    }
    setActiveNote(note);
    setStatus('Transcript saved as a note.');
  }

  function refineFromLastUserMessage() {
    const lastUser = [...messages].reverse().find(message => message.role === 'user');
    if (!lastUser) {
      setStatus('No user message available to refine.');
      return;
    }
    updateQuery(lastUser.text);
    setStatus('Search query updated from latest chat question.');
  }

  function appendSuggestedPrompt() {
    const suggestion = filteredNotes[0]?.title || 'Show my latest DBMS notes';
    setChatInput(current => (current ? `${current}. ${suggestion}` : suggestion));
  }

  function clearChatHistory() {
    const shouldClear = window.confirm('Delete this KB chat history? This action cannot be undone.');
    if (!shouldClear) return;
    setMessages(initialMessages);
    setStatus('Chat history cleared.');
  }

  async function runAction(action) {
    if (!action) return;
    if (action.type === 'open_note' && action.noteId) {
      await handleOpenNoteById(action.noteId);
      return;
    }
    if (action.path) {
      navigate(action.path);
    }
  }

  return (
    <div className="page">
      <div className="kb-layout">
        <div className="kb-left">
          <div className="kb-search-panel">
            <div className="kb-search-label">Ask anything from your notes</div>
            <div className="kb-search-input-row">
              <input
                placeholder="Explain normalization in DBMS or show SQL note"
                value={query}
                onChange={event => updateQuery(event.target.value)}
              />
              <button onClick={() => setStatus('Search refreshed.')} title="Run search">
                <FiSearch size={14} color="var(--text-muted)" style={{ cursor: 'pointer', flexShrink: 0 }} />
              </button>
              <button onClick={() => setStatus('Voice search is not enabled in this local build.')} title="Voice search">
                <FiMic size={14} color="var(--text-muted)" style={{ cursor: 'pointer', flexShrink: 0, marginLeft: 4 }} />
              </button>
            </div>
            <div className="kb-scope-row">
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 4 }}>Scope:</span>
              {scopeFields.map(scope => (
                <label className="kb-scope-label" key={scope}>
                  <input
                    type="checkbox"
                    checked={Boolean(scopes[scope])}
                    onChange={() => setScopes(prev => ({ ...prev, [scope]: !prev[scope] }))}
                    style={{ width: 12, height: 12 }}
                  />
                  {scope}
                </label>
              ))}
            </div>
            <div className="kb-filter-pills">
              {filterPills.map(filter => (
                <span
                  key={filter}
                  className={`tag ${activeFilters.includes(filter) ? 'tag-blue' : 'tag-gray'}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => toggleFilter(filter)}
                >
                  {filter}
                </span>
              ))}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--accent)', cursor: 'pointer' }} onClick={() => setActiveFilters([])}>
                Clear filters
              </span>
            </div>
          </div>

          <div className="kb-results">
            <div className="kb-results-header">
              <div className="kb-results-count">Search Results</div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Showing {filteredNotes.length} matching items</span>
            </div>
            {notesLoading && (
              <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                Loading notes from Supabase...
              </div>
            )}
            {notesError && (
              <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--red)' }}>
                {notesError}
              </div>
            )}

            {filteredNotes.map(note => (
              <div className="kb-result-item" key={note.id}>
                <div className="kb-result-thumb">
                  <div style={{ width: 56, height: 56, background: 'var(--surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                    {getTypeIcon(note.type)}
                  </div>
                </div>
                <div className="kb-result-body">
                  <div className="kb-result-header">
                    <div className="kb-result-title">{note.title}</div>
                    <span className={`kb-type-badge ${note.type === 'code' ? 'tag-blue' : 'tag-purple'}`}>
                      {getTypeIcon(note.type)} {note.type}
                    </span>
                  </div>
                  <p className="kb-result-snippet">{note.preview || (note.content ? `${note.content.slice(0, 100)}...` : 'No content preview.')}</p>
                  <div className="kb-result-meta">Added: {note.createdAt}</div>
                  <div className="kb-result-actions">
                    <button className="note-action-btn primary" onClick={() => handleOpenNote(note)}>Open Note</button>
                  </div>
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Tip: Use filters and scopes together for better matches.
              </p>
              <button className="btn btn-primary btn-sm" onClick={saveSearchCollection}>Save search as smart collection</button>
            </div>
          </div>
        </div>

        <div className="kb-right">
          <div className="kb-chat-header">
            <div className="chat-avatar" style={{ width: 28, height: 28, fontSize: 12 }}>N</div>
            <div className="kb-chat-title">NoteHive Assistant</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Internal-first RAG with fallback AI</div>
            <div className="kb-chat-actions">
              <button className="btn btn-ghost btn-sm" onClick={saveTranscriptAsNote}>Save transcript</button>
              <button className="btn btn-ghost btn-sm" onClick={refineFromLastUserMessage}>Refine search</button>
              <button className="btn btn-ghost btn-sm" onClick={clearChatHistory}>Clear chat</button>
            </div>
          </div>

          <div className="kb-chat-messages">
            {messages.map(message => (
              <div key={message.id} className={`chat-msg${message.role === 'user' ? ' flex-row-reverse' : ''}`}>
                {message.role === 'assistant' && <div className="chat-avatar">N</div>}
                <div className={`chat-bubble${message.role === 'user' ? ' user-bubble' : ''}`}>
                  {message.role === 'assistant' && (
                    <div style={{ marginBottom: 8 }}>
                      <span className={`tag ${message.source === 'internal' ? 'tag-green' : 'tag-orange'}`}>
                        {message.source === 'internal' ? 'Internal Answer' : 'Fallback AI'}
                      </span>
                    </div>
                  )}
                  {message.text}

                  {message.citedNotes && message.citedNotes.length > 0 && (
                    <div className="chat-cited-notes">
                      {message.citedNotes.map(note => (
                        <div className="chat-cited-card" key={note.id}>
                          <div style={{ width: 28, height: 28, background: 'var(--border)', borderRadius: 4, flexShrink: 0 }} />
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600 }}>{note.title}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                              {note.author} | {note.folder} | score {note.similarity.toFixed(2)}
                            </div>
                            {note.snippet && (
                              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 3 }}>{note.snippet}</div>
                            )}
                          </div>
                          <button
                            className="note-action-btn primary"
                            style={{ fontSize: 10, marginLeft: 'auto' }}
                            onClick={() => handleOpenNoteById(note.id)}
                          >
                            Open Note
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {message.actions && message.actions.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                      {message.actions.map(action => (
                        <button
                          key={`${message.id}-${action.label}`}
                          className="note-action-btn primary"
                          onClick={() => runAction(action)}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {message.relatedNotes && message.relatedNotes.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>Related</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {message.relatedNotes.map(note => (
                          <button
                            key={`${message.id}-related-${note.id}`}
                            className="note-action-btn"
                            onClick={() => handleOpenNoteById(note.id)}
                          >
                            {note.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {chatLoading && (
              <div className="chat-msg">
                <div className="chat-avatar">N</div>
                <div className="chat-bubble">
                  <span style={{ color: 'var(--text-muted)' }}>
                    {useWebSearch 
                      ? 'Searching your notes and the web...' 
                      : 'Searching your internal notes...'}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="kb-chat-input-row">
            <input
              className="kb-chat-input"
              placeholder="Ask the KB or continue the conversation..."
              value={chatInput}
              onChange={event => setChatInput(event.target.value)}
              onKeyDown={event => event.key === 'Enter' && sendMessage()}
            />
            <button 
              className={`btn btn-sm ${useWebSearch ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setUseWebSearch(!useWebSearch)}
              title="Toggle web search"
              style={{ whiteSpace: 'nowrap' }}
            >
              {useWebSearch ? '🌐 Web ON' : '🌐 Web OFF'}
            </button>
            <button className="btn btn-primary" onClick={sendMessage} disabled={chatLoading}>
              <FiSend size={13} /> Send
            </button>
            <button className="btn btn-ghost btn-sm" onClick={appendSuggestedPrompt}><FiPlus size={14} /></button>
          </div>

          <div className="kb-chat-footer">
            Refine search: <span onClick={() => updateQuery('')}>Reset Query</span>
          </div>
          {status && (
            <div style={{ padding: '0 16px 10px', fontSize: 11, color: status.includes('failed') ? 'var(--red)' : 'var(--accent)', background: 'var(--surface)' }}>
              {status}
            </div>
          )}
          {!notesLoading && notes.length === 0 && (
            <div style={{ padding: '0 16px 10px', fontSize: 11, color: 'var(--orange)', background: 'var(--surface)', display: 'flex', gap: 6, alignItems: 'center' }}>
              <FiAlertCircle size={12} />
              Add notes first to get internal-first answers.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
