import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FiFeather, FiPlus } from 'react-icons/fi';
import { useStore } from '../store/useStore';

const navItems = [
  { label: 'Dashboard', to: '/', match: pathname => pathname === '/' },
  { label: 'Notes', to: '/explorer', match: pathname => pathname.startsWith('/explorer') || pathname.startsWith('/editor') },
  { label: 'Sticky Board', to: '/sticky', match: pathname => pathname.startsWith('/sticky') },
  { label: 'Knowledge Base', to: '/kb', match: pathname => pathname.startsWith('/kb') },
  { label: 'PDF Notes', to: '/pdf-notes', match: pathname => pathname.startsWith('/pdf-notes') || pathname.startsWith('/ml-solution') },
  { label: 'Profile', to: '/profile', match: pathname => pathname.startsWith('/profile') },
];

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { addNote, setActiveNote } = useStore();

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
          <FiFeather size={16} />
          NoteHive
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
        <button className="btn btn-primary btn-sm" onClick={handleNewNote}>
          <FiPlus size={13} />
          New Note
        </button>
      </div>
    </nav>
  );
}
