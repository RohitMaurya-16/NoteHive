import { useMemo, useRef, useState } from 'react';
import { FiDownload, FiUpload } from 'react-icons/fi';
import { useStore } from '../store/useStore';

export default function Profile() {
  const fileInputRef = useRef(null);
  const { notes, stickies, tags, folders, smartCollections, importNotes } = useStore();
  const [status, setStatus] = useState('');

  const starredNotes = useMemo(
    () => notes.filter(note => note.starred).length,
    [notes],
  );

  function handleExportBackup() {
    const payload = {
      exportedAt: new Date().toISOString(),
      notes,
      stickies,
      tags,
      folders,
      smartCollections,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `notehive-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setStatus('Backup exported successfully.');
  }

  function handleImportClick() {
    if (fileInputRef.current) fileInputRef.current.click();
  }

  function handleImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const result = await importNotes(String(reader.result || ''));
      setStatus(result.message);
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  return (
    <div className="page">
      <div className="ml-layout">
        <section className="card" style={{ padding: 18 }}>
          <h1 style={{ marginBottom: 8 }}>Profile</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 14 }}>
            Manage your local data backup and jump to the most used sections.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Total Notes</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{notes.length}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{starredNotes} starred</div>
            </div>
            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Sticky Notes</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{stickies.length}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Active board items</div>
            </div>
            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Folders</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{folders.length}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Organized spaces</div>
            </div>
            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Smart Collections</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{smartCollections.length}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{tags.length} tracked tags</div>
            </div>
          </div>
        </section>

        <section className="card" style={{ padding: 18 }}>
          <h2 style={{ marginBottom: 10 }}>Data Tools</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button className="btn btn-primary" onClick={handleExportBackup}>
              <FiDownload size={14} /> Export Backup
            </button>
            <button className="btn btn-ghost" onClick={handleImportClick}>
              <FiUpload size={14} /> Import Notes JSON
            </button>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
          {status && <p style={{ marginTop: 10, fontSize: 12, color: 'var(--accent)' }}>{status}</p>}
        </section>

      </div>
    </div>
  );
}
