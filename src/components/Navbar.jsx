import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FiFeather, FiPlus } from 'react-icons/fi';
import { useStore } from '../store/useStore';

const navItems = [
  { label: 'Dashboard', to: '/', match: pathname => pathname === '/' },
  { label: 'Notes', to: '/explorer', match: pathname => pathname.startsWith('/explorer') || pathname.startsWith('/editor') },
  { label: 'Knowledge Base', to: '/kb', match: pathname => pathname.startsWith('/kb') },
  { label: 'PDF Notes', to: '/pdf-notes', match: pathname => pathname.startsWith('/pdf-notes') || pathname.startsWith('/ml-solution') },
  { label: 'Profile', to: '/profile', match: pathname => pathname.startsWith('/profile') },
];

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { addNote, setActiveNote, notes, isAdmin, requestAdminAccess, logout } = useStore();

  async function handleNewNote() {
    const note = await addNote();
    if (!note) return;
    setActiveNote(note);
    navigate('/editor');
  }

  return (
    <nav className="navbar">
      <button className="navbar-logo-btn" onClick={() => navigate('/')} aria-label="Open dashboard">
        <span className="navbar-logo">
          <span className="navbar-logo-mark">
            <FiFeather size={16} />
          </span>
          <span className="navbar-logo-copy">
            <span className="navbar-logo-title">NoteHive</span>
            <span className="navbar-logo-subtitle">Knowledge Studio</span>
          </span>
        </span>
      </button>

      <div className="navbar-nav" role="navigation" aria-label="Primary">
        {navItems.map(item => (
          <Link
            key={item.to}
            to={item.to}
            className={`navbar-link${item.match(location.pathname) ? ' active' : ''}`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div className="navbar-actions">
        {isAdmin ? (
          <button className="btn btn-ghost btn-sm" onClick={logout} style={{ color: 'var(--green)' }}>
            Admin Active (Logout)
          </button>
        ) : (
          <button className="btn btn-ghost btn-sm" onClick={() => requestAdminAccess('login')}>
            Admin Login
          </button>
        )}
        <span className="navbar-summary">
          <strong>{notes.length}</strong> notes
        </span>
        {isAdmin && (
          <button className="btn btn-primary btn-sm" onClick={handleNewNote}>
            <FiPlus size={13} />
            New Note
          </button>
        )}
      </div>
    </nav>
  );
}
