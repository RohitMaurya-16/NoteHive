import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FiFileText, FiMaximize2, FiMinimize2, FiSearch, FiTrash2, FiUpload,
} from 'react-icons/fi';

const PDF_DB_NAME = 'notehive_pdf_notes_db';
const PDF_DB_VERSION = 1;
const PDF_STORE_NAME = 'pdf_files';
const LEGACY_STORAGE_KEY = 'nh_pdf_notes_v1';

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isPdfFile(file) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function normalizeDbRecord(record) {
  if (!record || typeof record !== 'object') return null;
  if (typeof record.id !== 'string' || !record.id) return null;
  if (typeof record.name !== 'string' || !record.name.trim()) return null;
  if (!(record.fileBlob instanceof Blob)) return null;

  return {
    id: record.id,
    name: record.name.trim(),
    size: Number.isFinite(record.size) ? record.size : record.fileBlob.size,
    uploadedAtISO: typeof record.uploadedAtISO === 'string' ? record.uploadedAtISO : new Date().toISOString(),
    fileBlob: record.fileBlob,
  };
}

function normalizeLegacyRecord(record) {
  if (!record || typeof record !== 'object') return null;
  if (typeof record.id !== 'string' || !record.id) return null;
  if (typeof record.name !== 'string' || !record.name.trim()) return null;
  if (typeof record.url !== 'string' || !record.url.startsWith('data:application/pdf')) return null;
  return {
    id: record.id,
    name: record.name.trim(),
    size: Number.isFinite(record.size) ? record.size : 0,
    uploadedAtISO: typeof record.uploadedAtISO === 'string' ? record.uploadedAtISO : new Date().toISOString(),
    url: record.url,
  };
}

function createPdfRecord(file) {
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    size: file.size,
    uploadedAtISO: new Date().toISOString(),
    fileBlob: file,
  };
}

function sortByNewest(records) {
  return [...records].sort((a, b) => (
    new Date(b.uploadedAtISO).getTime() - new Date(a.uploadedAtISO).getTime()
  ));
}

function openPdfDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not available.'));
      return;
    }

    const request = window.indexedDB.open(PDF_DB_NAME, PDF_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PDF_STORE_NAME)) {
        db.createObjectStore(PDF_STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open PDF database.'));
  });
}

function getAllPdfRecords(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PDF_STORE_NAME, 'readonly');
    const store = tx.objectStore(PDF_STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
    request.onerror = () => reject(request.error || new Error('Failed to read PDF records.'));
  });
}

function putPdfRecord(db, record) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PDF_STORE_NAME, 'readwrite');
    const store = tx.objectStore(PDF_STORE_NAME);
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('Failed to save PDF record.'));
  });
}

function deletePdfRecord(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PDF_STORE_NAME, 'readwrite');
    const store = tx.objectStore(PDF_STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('Failed to remove PDF record.'));
  });
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

async function migrateLegacyLocalStorage(db) {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return 0;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return 0;
    }

    let migrated = 0;
    for (const item of parsed) {
      const legacy = normalizeLegacyRecord(item);
      if (!legacy) continue;

      try {
        const fileBlob = await dataUrlToBlob(legacy.url);
        await putPdfRecord(db, {
          id: legacy.id,
          name: legacy.name,
          size: legacy.size || fileBlob.size,
          uploadedAtISO: legacy.uploadedAtISO,
          fileBlob,
        });
        migrated += 1;
      } catch {
        // Skip invalid legacy entry and continue.
      }
    }

    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return migrated;
  } catch {
    return 0;
  }
}

export default function MachineLearningSolution() {
  const fileInputRef = useRef(null);
  const dbRef = useRef(null);

  const [pdfNotes, setPdfNotes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [viewerUrl, setViewerUrl] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [storageError, setStorageError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isFullPageViewer, setIsFullPageViewer] = useState(false);

  const filteredPdfs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pdfNotes;
    return pdfNotes.filter(pdf => pdf.name.toLowerCase().includes(q));
  }, [pdfNotes, query]);

  const selectedPdf = useMemo(
    () => pdfNotes.find(pdf => pdf.id === selectedId) || null,
    [pdfNotes, selectedId],
  );

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        const db = await openPdfDatabase();
        dbRef.current = db;

        const migratedCount = await migrateLegacyLocalStorage(db);
        const records = await getAllPdfRecords(db);
        const normalized = sortByNewest(records.map(normalizeDbRecord).filter(Boolean));

        if (!mounted) return;
        setPdfNotes(normalized);
        setStorageError('');
        if (migratedCount > 0) {
          setStatus(`Migrated ${migratedCount} PDF note(s) from older storage.`);
        }
      } catch (error) {
        if (!mounted) return;
        setStorageError(error.message || 'Could not initialize PDF storage.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initialize();

    return () => {
      mounted = false;
      if (dbRef.current) {
        dbRef.current.close();
        dbRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedId && pdfNotes.length > 0) {
      setSelectedId(pdfNotes[0].id);
      return;
    }
    if (selectedId && !pdfNotes.some(pdf => pdf.id === selectedId)) {
      setSelectedId(pdfNotes[0]?.id || null);
    }
  }, [pdfNotes, selectedId]);

  useEffect(() => {
    if (!selectedPdf && isFullPageViewer) setIsFullPageViewer(false);
  }, [selectedPdf, isFullPageViewer]);

  useEffect(() => {
    if (!selectedPdf?.fileBlob) {
      setViewerUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(selectedPdf.fileBlob);
    setViewerUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedPdf]);

  useEffect(() => {
    if (!isFullPageViewer) return undefined;

    const onKeyDown = event => {
      if (event.key === 'Escape') setIsFullPageViewer(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isFullPageViewer]);

  async function withDatabase(task) {
    let db = dbRef.current;
    if (!db) {
      db = await openPdfDatabase();
      dbRef.current = db;
    }
    return task(db);
  }

  async function handleFileUpload(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;

    const accepted = files.filter(isPdfFile);
    const rejectedCount = files.length - accepted.length;

    if (accepted.length === 0) {
      setStatus('Only PDF files are supported.');
      return;
    }

    setUploading(true);
    try {
      const created = [];
      for (const file of accepted) {
        const record = createPdfRecord(file);
        await withDatabase(db => putPdfRecord(db, record));
        created.push(record);
      }

      setPdfNotes(prev => sortByNewest([...created, ...prev]));
      setSelectedId(created[0]?.id || null);
      setStorageError('');
      setStatus(
        rejectedCount > 0
          ? `Added ${created.length} PDF note(s). Skipped ${rejectedCount} non-PDF file(s).`
          : `Added ${created.length} PDF note(s).`,
      );
    } catch (error) {
      setStorageError(error.message || 'Could not save PDF note. Storage may be full.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDeletePdf(id) {
    try {
      await withDatabase(db => deletePdfRecord(db, id));
      setPdfNotes(prev => prev.filter(pdf => pdf.id !== id));
      setStorageError('');
      setStatus('PDF note removed.');
    } catch (error) {
      setStorageError(error.message || 'Could not remove PDF note.');
    }
  }

  function triggerUpload() {
    fileInputRef.current?.click();
  }

  return (
    <div className="page">
      <div className="pdf-layout">
        <section className="pdf-hero card">
          <div>
            <h1>PDF Notes</h1>
            <p>Upload your PDF notes, keep them in one place, and open any PDF directly inside this page.</p>
          </div>
          <div className="pdf-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              multiple
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            <button className="btn btn-primary" onClick={triggerUpload} disabled={uploading}>
              <FiUpload size={14} />
              {uploading ? 'Uploading...' : 'Upload PDF'}
            </button>
          </div>
        </section>

        <section className="pdf-toolbar card">
          <div className="pdf-search">
            <FiSearch size={14} color="var(--text-muted)" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search uploaded PDFs..."
            />
          </div>
          <div className="pdf-meta">
            <span>{pdfNotes.length} PDF notes</span>
            <span>{selectedPdf ? selectedPdf.name : 'No PDF selected'}</span>
          </div>
        </section>

        <div className="pdf-content">
          <aside className="pdf-list card">
            {loading && <div className="pdf-empty">Loading PDF notes...</div>}
            {!loading && filteredPdfs.length === 0 && (
              <div className="pdf-empty">
                No PDF notes found. Upload a PDF to start.
              </div>
            )}

            {!loading && filteredPdfs.map(pdf => (
              <div key={pdf.id} className={`pdf-item${selectedId === pdf.id ? ' active' : ''}`}>
                <button className="pdf-item-main" onClick={() => setSelectedId(pdf.id)}>
                  <FiFileText size={14} />
                  <div className="pdf-item-body">
                    <div className="pdf-item-name">{pdf.name}</div>
                    <div className="pdf-item-sub">
                      {formatBytes(pdf.size)} - {formatDate(pdf.uploadedAtISO)}
                    </div>
                  </div>
                </button>
                <button className="icon-btn" onClick={() => handleDeletePdf(pdf.id)} title="Remove PDF">
                  <FiTrash2 size={13} />
                </button>
              </div>
            ))}
          </aside>

          <section className="pdf-viewer card">
            {!selectedPdf && (
              <div className="pdf-empty">
                Select a PDF note from the list to open it in the browser.
              </div>
            )}

            {selectedPdf && (
              <>
                <div className="pdf-viewer-header">
                  <div className="pdf-viewer-title">{selectedPdf.name}</div>
                  <div className="pdf-viewer-actions">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setIsFullPageViewer(true)}
                      title="Open full page"
                    >
                      <FiMaximize2 size={13} />
                      Full Page
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={triggerUpload}>
                      Upload More
                    </button>
                  </div>
                </div>
                <iframe
                  title={selectedPdf.name}
                  src={viewerUrl}
                  className="pdf-viewer-frame"
                />
              </>
            )}
          </section>
        </div>

        {selectedPdf && isFullPageViewer && (
          <section className="pdf-fullscreen-overlay" role="dialog" aria-modal="true" aria-label="Full page PDF viewer">
            <div className="pdf-fullscreen-panel">
              <div className="pdf-fullscreen-header">
                <div className="pdf-viewer-title">{selectedPdf.name}</div>
                <div className="pdf-viewer-actions">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={triggerUpload}
                  >
                    Upload More
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setIsFullPageViewer(false)}
                    title="Exit full page"
                  >
                    <FiMinimize2 size={13} />
                    Exit Full Page
                  </button>
                </div>
              </div>
              <iframe
                title={`${selectedPdf.name} full page`}
                src={viewerUrl}
                className="pdf-fullscreen-frame"
              />
            </div>
          </section>
        )}

        {(status || storageError) && (
          <section className="card" style={{ fontSize: 12, color: storageError ? 'var(--red)' : 'var(--accent)' }}>
            {storageError || status}
          </section>
        )}
      </div>
    </div>
  );
}
