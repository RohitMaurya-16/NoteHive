import { useNavigate } from 'react-router-dom';
import { FiStar, FiCode, FiHelpCircle, FiBook } from 'react-icons/fi';
import { useStore } from '../store/useStore';
import NoteContentRenderer from './NoteContentRenderer';

const typeIcon = {
  code: { icon: <FiCode size={14} />, bg: '#dbeafe', color: '#2563eb' },
  theory: { icon: <FiBook size={14} />, bg: '#f3e8ff', color: '#7c3aed' },
  question: { icon: <FiHelpCircle size={14} />, bg: '#fff7ed', color: '#ea580c' },
};

const tagColorMap = {
  JavaScript: 'tag-blue', optimization: 'tag-blue',
  DBMS: 'tag-purple', theory: 'tag-purple',
  Algorithms: 'tag-green', recursion: 'tag-green',
  'Data Structures': 'tag-orange', default: 'tag-gray',
};

export default function NoteCard({ note }) {
  const navigate = useNavigate();
  const { toggleStar, duplicateNote, deleteNote, setActiveNote } = useStore();

  const ti = typeIcon[note.type] || typeIcon.theory;

  function openNote() {
    setActiveNote(note);
    navigate('/editor');
  }

  return (
    <div
      className="note-card"
      onClick={openNote}
    >
      <div className="note-card-header">
        <div className="note-type-icon" style={{ background: ti.bg, color: ti.color }}>
          {ti.icon}
        </div>
        <h3>{note.title}</h3>
        <button
          className={`note-card-star${note.starred ? ' starred' : ''}`}
          onClick={e => { e.stopPropagation(); toggleStar(note.id); }}
        >
          <FiStar size={14} fill={note.starred ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="note-card-preview">
        {note.type === 'code'
          ? <code>{note.preview}</code>
          : <NoteContentRenderer content={(note.content || note.preview || '').substring(0, 300)} />}
      </div>

      <div className="note-card-tags">
        {note.tags.map(t => (
          <span key={t} className={`tag ${tagColorMap[t] || tagColorMap.default}`}>{t}</span>
        ))}
      </div>

      <div className="note-card-footer">
        <span className="note-card-date">Updated {note.updatedAt}</span>
        <div className="note-card-actions">
          <button className="note-action-btn" onClick={e => { e.stopPropagation(); duplicateNote(note.id); }}>Duplicate</button>
          <button className="note-action-btn danger" onClick={e => { e.stopPropagation(); deleteNote(note.id); }}>Delete</button>
        </div>
      </div>
    </div>
  );
}
