import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { useStore } from '../store/useStore';

const weekData = [
  { v: 4 }, { v: 6 }, { v: 3 }, { v: 8 }, { v: 5 }, { v: 7 }, { v: 3 }, { v: 9 }, { v: 6 }, { v: 4 },
];

const pinnedTopics = {
  Code: [
    { label: 'JavaScript', color: 'tag-blue' },
    { label: 'Python', color: 'tag-green' },
    { label: 'C++', color: 'tag-gray' },
  ],
  'Theory / English': [
    { label: 'Data Structures', color: 'tag-orange' },
    { label: 'System Design', color: 'tag-orange' },
    { label: 'Operating Systems', color: 'tag-gray' },
  ],
  Questions: [
    { label: 'SQL', color: 'tag-blue' },
    { label: 'Recursion', color: 'tag-purple' },
    { label: 'Hashing', color: 'tag-gray' },
  ],
};

const initialStudyPlan = [
  { title: 'Practice 30 mins of JS closures', priority: 'High', est: 'Estimated 30m', done: false },
  { title: 'Review DB normalization notes', priority: 'Medium', est: 'Estimated 20m', done: false },
  { title: 'Solve 1 BST recursion problem', priority: 'High', est: 'Estimated 40m', done: false },
];

const tagColorMap = { JS: '#f59e0b', DBMS: '#8b5cf6', Algorithms: '#10b981' };

export default function Dashboard() {
  const navigate = useNavigate();
  const { notes, notesLoading, notesError, setActiveNote } = useStore();
  const [studyPlan, setStudyPlan] = useState(initialStudyPlan);

  const completedTasks = studyPlan.filter(task => task.done).length;

  const recentNotes = notes.slice(0, 3).map((n, i) => ({
    id: n.id,
    title: n.title,
    tag: n.folder,
    snippet: n.preview || 'No preview available...',
    date: `Edited ${n.updatedAt}`,
    thumb: [
      'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=80&h=80&fit=crop',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop',
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=80&h=80&fit=crop',
    ][i % 3],
    originalNote: n,
  }));

  function toggleTask(index) {
    setStudyPlan(prev => prev.map((task, taskIndex) => (
      taskIndex === index ? { ...task, done: !task.done } : task
    )));
  }

  function openNote(note) {
    setActiveNote(note);
    navigate('/editor');
  }

  return (
    <div className="page">
      <div className="dashboard-layout fade-in">
        <div className="dashboard-main">
          <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
            <div className="dashboard-welcome">
              <h1>Welcome back, Rohit</h1>
              <p>Quick snapshot of recent activity and suggested items to continue learning.</p>
            </div>
          </div>

          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="recent-notes">
              {notesLoading && (
                <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>
                  Loading notes from Supabase...
                </div>
              )}
              {notesError && (
                <div style={{ padding: 16, color: 'var(--red)', fontSize: 12 }}>
                  {notesError}
                </div>
              )}
              {recentNotes.map(note => (
                <div
                  key={note.id}
                  className="recent-note-item"
                  onClick={() => openNote(note.originalNote)}
                >
                  <div className="recent-note-thumb">
                    <img src={note.thumb} alt={note.title} onError={event => { event.target.style.display = 'none'; }} />
                  </div>
                  <div className="recent-note-info">
                    <h3>{note.title}</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span
                        className="tag"
                        style={{
                          background: `${tagColorMap[note.tag] || '#6b7280'}22`,
                          color: tagColorMap[note.tag] || '#6b7280',
                          fontSize: 10,
                        }}
                      >
                        {note.tag}
                      </span>
                    </div>
                    <p className="snippet" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      - {note.snippet}
                    </p>
                  </div>
                  <div className="recent-note-meta">
                    <div>{note.date}</div>
                    <button
                      className="open-btn"
                      onClick={event => {
                        event.stopPropagation();
                        openNote(note.originalNote);
                      }}
                    >
                      Open
                    </button>
                  </div>
                </div>
              ))}
              {!notesLoading && !notesError && recentNotes.length === 0 && (
                <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>
                  No notes yet. Use <strong>New Note</strong> in navbar.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="dashboard-sidebar">
          <div className="dashboard-side-panel">
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>Pinned Topics</h2>
              <span style={{ fontSize: 12, color: 'var(--accent)', cursor: 'pointer' }} onClick={() => navigate('/explorer')}>
                Filters
              </span>
            </div>
            {Object.entries(pinnedTopics).map(([section, tags]) => (
              <div className="pinned-section" key={section}>
                <div className="pinned-section-label">{section}</div>
                <div className="pinned-tags">
                  {tags.map(tag => (
                    <span
                      key={tag.label}
                      className={`tag ${tag.color}`}
                      onClick={() => navigate(`/explorer?q=${encodeURIComponent(tag.label)}`)}
                    >
                      {tag.label}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="dashboard-side-panel">
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>Study Plan</h2>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {completedTasks}/{studyPlan.length} complete
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Tomorrow</div>
            <div className="study-tasks">
              {studyPlan.map((task, index) => (
                <div className="study-task" key={task.title}>
                  <input type="checkbox" checked={task.done} onChange={() => toggleTask(index)} />
                  <div className="study-task-body">
                    <div className="study-task-title">{task.title}</div>
                    <div className="study-task-est">{task.est}</div>
                  </div>
                  <div
                    className="study-task-priority"
                    style={{ color: task.priority === 'High' ? 'var(--red)' : 'var(--orange)' }}
                  >
                    {task.priority}
                  </div>
                </div>
              ))}
            </div>

            <div className="weekly-snapshot">
              <h3>Weekly snapshot</h3>
              <ResponsiveContainer width="100%" height={60}>
                <LineChart data={weekData}>
                  <Line type="monotone" dataKey="v" stroke="#1a1d23" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
