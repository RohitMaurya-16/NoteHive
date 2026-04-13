import { useMemo, useRef, useState } from 'react';
import {
  FiClock, FiDownload, FiFolder, FiStar, FiUpload,
} from 'react-icons/fi';
import { useStore } from '../store/useStore';

export default function Profile() {
  const fileInputRef = useRef(null);
  const { notes, stickies, tags, folders, smartCollections, importNotes } = useStore();
  const [status, setStatus] = useState('');

  const starredNotes = useMemo(
    () => notes.filter(note => note.starred).length,
    [notes],
  );
  const latestNote = useMemo(
    () => [...notes].sort((a, b) => new Date(b.updatedAtISO).getTime() - new Date(a.updatedAtISO).getTime())[0] || null,
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
      <div className="ml-layout profile-layout">
        <section className="card profile-hero">
          <div className="profile-hero-copy">
            <div className="profile-kicker">Workspace profile</div>
            <h1>Keep your note system backed up, organized, and ready to move.</h1>
            <p>
              This space gives you a quick read on your vault and the core tools for exporting,
              restoring, and managing your local study data.
            </p>
          </div>
          <div className="profile-hero-meta">
            <div className="profile-meta-chip"><FiClock size={12} /> {latestNote ? `Last updated ${latestNote.updatedAt}` : 'No notes yet'}</div>
            <div className="profile-meta-chip"><FiStar size={12} /> {starredNotes} starred references</div>
            <div className="profile-meta-chip"><FiFolder size={12} /> {folders.length} organized folders</div>
          </div>
        </section>

        <section className="profile-stats-grid">
          <div className="card profile-stat-card">
            <div className="profile-stat-label">Total Notes</div>
            <div className="profile-stat-value">{notes.length}</div>
            <div className="profile-stat-hint">{starredNotes} starred references</div>
          </div>
          <div className="card profile-stat-card">
            <div className="profile-stat-label">Sticky Notes</div>
            <div className="profile-stat-value">{stickies.length}</div>
            <div className="profile-stat-hint">Quick capture board items</div>
          </div>
          <div className="card profile-stat-card">
            <div className="profile-stat-label">Folders</div>
            <div className="profile-stat-value">{folders.length}</div>
            <div className="profile-stat-hint">Organized study spaces</div>
          </div>
          <div className="card profile-stat-card">
            <div className="profile-stat-label">Smart Collections</div>
            <div className="profile-stat-value">{smartCollections.length}</div>
            <div className="profile-stat-hint">{tags.length} tracked tags</div>
          </div>
        </section>

        <section className="profile-tools-grid">
          <article className="card profile-tool-card">
            <div className="profile-tool-kicker">Backup</div>
            <h2>Export a full workspace snapshot</h2>
            <p>Download your notes, stickies, tags, folders, and smart collections as a single JSON backup.</p>
            <button className="btn btn-primary" onClick={handleExportBackup}>
              <FiDownload size={14} /> Export Backup
            </button>
          </article>

          <article className="card profile-tool-card">
            <div className="profile-tool-kicker">Restore</div>
            <h2>Import notes from JSON</h2>
            <p>Bring structured notes back into the workspace and merge them into your current vault.</p>
            <button className="btn btn-ghost" onClick={handleImportClick}>
              <FiUpload size={14} /> Import Notes JSON
            </button>
          </article>
        </section>

        <input
          type="file"
          ref={fileInputRef}
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={handleImportFile}
        />
        {status && <p className="profile-status">{status}</p>}
      </div>
    </div>
  );
}
