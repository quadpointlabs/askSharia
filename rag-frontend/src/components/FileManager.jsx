import { useState, useEffect, useRef } from 'react';
import { listFiles, uploadFile, deleteFile, downloadFile, reindexFile } from '../services/api';

export default function FileManager({ onUploadingChange, apiOverrides }) {
  const apiFns = {
    listFiles,
    uploadFile,
    deleteFile,
    downloadFile,
    reindexFile,
    ...apiOverrides,
  };
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState([]);
  const [sortBy, setSortBy] = useState('date'); // 'name' | 'date'
  const [sortDir, setSortDir] = useState('desc'); // 'asc' | 'desc'
  const [uploadModal, setUploadModal] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [message, setMessage] = useState(null);
  const dragCounter = useRef(0);
  const fileInputRef = useRef(null);
  const autoCloseTimer = useRef(null);
  const fileListRef = useRef(null);

  const uploading = uploadModal?.phase === 'uploading';

  const INDEXING_NOTICE = '⚠️ The system may be unavailable for a short while due to updating and indexing.';

  useEffect(() => {
    fetchFiles();
    return () => { if (autoCloseTimer.current) clearTimeout(autoCloseTimer.current); };
  }, []);

  // While any file is still indexing (pending), poll until it settles.
  // Failed files are terminal (until the user retries), so they don't keep polling.
  useEffect(() => {
    const isPending = f => (f.status ? f.status === 'pending' : !f.indexed);
    if (!files.some(isPending)) return;
    const timer = setInterval(fetchFiles, 5000);
    return () => clearInterval(timer);
  }, [files]);

  const fetchFiles = async () => {
    try {
      const res = await apiFns.listFiles();
      setFiles(res.data.files);
    } catch (err) {
      console.error('Failed to fetch files');
    }
  };

  const uploadFiles = async (fileArray) => {
    if (fileArray.length === 0) return;

    // Skip files that already exist (server-side) or are duplicated within this batch.
    const existingNames = new Set(files.map(f => f.name.toLowerCase()));
    const skipped = [];
    const toUpload = [];
    for (const file of fileArray) {
      const key = file.name.toLowerCase();
      if (existingNames.has(key)) {
        skipped.push(file.name);
      } else {
        existingNames.add(key);
        toUpload.push(file);
      }
    }

    if (toUpload.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      alert(`Already uploaded — skipped:\n${skipped.join('\n')}`);
      return;
    }

    const failedFiles = [];
    setUploadModal({ current: 0, total: toUpload.length, currentFile: '', phase: 'uploading', failed: [], skipped });
    onUploadingChange?.(true);

    try {
      for (let i = 0; i < toUpload.length; i++) {
        setUploadModal(prev => ({ ...prev, current: i + 1, currentFile: toUpload[i].name }));
        try {
          await apiFns.uploadFile(toUpload[i]);
        } catch {
          failedFiles.push(toUpload[i].name);
          setUploadModal(prev => ({ ...prev, failed: [...prev.failed, toUpload[i].name] }));
        }
      }
      setUploadModal(prev => ({ ...prev, phase: 'done' }));
      fetchFiles();
      if (toUpload.length > failedFiles.length) setMessage(INDEXING_NOTICE);
      if (failedFiles.length === 0 && skipped.length === 0) {
        autoCloseTimer.current = setTimeout(() => setUploadModal(null), 2000);
      }
    } finally {
      onUploadingChange?.(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUpload = (e) => {
    uploadFiles(Array.from(e.target.files));
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    dragCounter.current++;
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragOver(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    await uploadFiles(dropped);
  };

  const handleReindex = async (filename) => {
    try {
      await apiFns.reindexFile(filename);
      // Optimistically flip to pending so the spinner shows and polling resumes.
      setFiles(prev => prev.map(f =>
        f.name === filename ? { ...f, status: 'pending', indexed: false, error: null } : f
      ));
    } catch {
      setMessage('❌ Retry failed');
    }
  };

  const handleDownload = async (filename) => {
    try {
      const res = await apiFns.downloadFile(filename);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setMessage('❌ Download failed');
    }
  };

  const handleDownloadSelected = async () => {
    for (const filename of selected) {
      await handleDownload(filename);
    }
  };

  const handleDelete = async () => {
    if (selected.length === 0) return;
    if (!confirm(`Delete ${selected.length} file(s)?`)) return;
    try {
      await Promise.all(selected.map(f => apiFns.deleteFile(f)));
      setMessage(INDEXING_NOTICE);
      setSelected([]);
      fetchFiles();
    } catch (err) {
      setMessage('❌ Delete failed');
    }
  };

  const toggleSelect = (filename) => {
    setSelected(prev =>
      prev.includes(filename)
        ? prev.filter(f => f !== filename)
        : [...prev, filename]
    );
  };

  // Let arrow / page / home-end keys scroll the file list once it's focused,
  // so it's navigable by keyboard as well as mouse wheel.
  const handleFileListKeyDown = (e) => {
    const el = fileListRef.current;
    if (!el) return;
    const line = 48;   // ~one row per arrow press
    const page = el.clientHeight - line;
    const deltas = {
      ArrowDown: line,
      ArrowUp: -line,
      PageDown: page,
      PageUp: -page,
      Home: -el.scrollHeight,
      End: el.scrollHeight,
    };
    if (!(e.key in deltas)) return;
    e.preventDefault();
    el.scrollBy({ top: deltas[e.key], behavior: 'smooth' });
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Clicking a sort key toggles its direction; switching keys resets to a
  // sensible default (A→Z for name, newest-first for date).
  const changeSort = (key) => {
    if (sortBy === key) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const sortedFiles = [...files].sort((a, b) => {
    let cmp;
    if (sortBy === 'name') {
      cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
    } else {
      cmp = new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime();
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const sortArrow = (key) => (sortBy === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  return (
    <div style={styles.container}>
      {/* Status / notice banner */}
      {message && (
        <div style={styles.notice}>
          <span style={{ flex: 1 }}>{message}</span>
          <button onClick={() => setMessage(null)} style={styles.noticeClose} title="Dismiss">✕</button>
        </div>
      )}

      {/* Upload Progress Modal */}
      {uploadModal && (
        <div style={styles.modalOverlay}>
          <style>{`@keyframes rag-spin { to { transform: rotate(360deg); } }`}</style>
          <div style={styles.modalCard}>
            {uploadModal.phase === 'uploading' ? (
              <>
                <div style={styles.spinner} />
                <h3 style={styles.modalTitle}>Uploading & Indexing</h3>
                <p style={styles.modalCurrentFile} title={uploadModal.currentFile}>
                  {uploadModal.currentFile}
                </p>
                <div style={styles.progressBarTrack}>
                  <div style={{
                    ...styles.progressBarFill,
                    width: uploadModal.total > 0
                      ? `${(uploadModal.current / uploadModal.total) * 100}%`
                      : '0%'
                  }} />
                </div>
                <p style={styles.progressCount}>
                  {uploadModal.current} of {uploadModal.total} file{uploadModal.total !== 1 ? 's' : ''}
                </p>
                <p style={styles.modalNote}>Chat will be available once complete</p>
              </>
            ) : (
              <>
                <div style={styles.doneIcon}>
                  {uploadModal.failed.length === 0 ? '✅' : '⚠️'}
                </div>
                <h3 style={styles.modalTitle}>
                  {uploadModal.failed.length === 0 ? 'Upload Complete!' : 'Upload Finished'}
                </h3>
                <p style={styles.modalSubtitle}>
                  {uploadModal.total - uploadModal.failed.length} of {uploadModal.total}{' '}
                  file{uploadModal.total !== 1 ? 's' : ''} indexed successfully
                </p>
                {uploadModal.total > uploadModal.failed.length && (
                  <p style={styles.modalNotice}>{INDEXING_NOTICE}</p>
                )}
                {uploadModal.failed.length > 0 && (
                  <div style={styles.failedList}>
                    <p style={styles.failedTitle}>Failed:</p>
                    {uploadModal.failed.map(f => (
                      <p key={f} style={styles.failedItem}>• {f}</p>
                    ))}
                  </div>
                )}
                {uploadModal.skipped?.length > 0 && (
                  <div style={styles.skippedList}>
                    <p style={styles.skippedTitle}>Skipped (already uploaded):</p>
                    {uploadModal.skipped.map(f => (
                      <p key={f} style={styles.skippedItem}>• {f}</p>
                    ))}
                  </div>
                )}
                <button onClick={() => setUploadModal(null)} style={styles.closeBtn}>
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Single hidden file input shared by button and drop zone */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleUpload}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
        multiple
        tabIndex={-1}
      />

      <div style={styles.toolbar}>
        {/* Upload Button */}
        <button
          style={styles.uploadBtn}
          onClick={() => fileInputRef.current.click()}
          disabled={uploading}
        >
          {uploading ? '⏳ Uploading...' : '📤 Upload Files'}
        </button>

        {/* Download Selected Button */}
        <button
          onClick={handleDownloadSelected}
          style={{
            ...styles.downloadBtn,
            opacity: selected.length > 0 ? 1 : 0.4,
            cursor: selected.length > 0 ? 'pointer' : 'not-allowed'
          }}
          disabled={selected.length === 0}
        >
          ⬇️ Download Selected ({selected.length})
        </button>

        {/* Delete Button */}
        <button
          onClick={handleDelete}
          style={{
            ...styles.deleteBtn,
            opacity: selected.length > 0 ? 1 : 0.4,
            cursor: selected.length > 0 ? 'pointer' : 'not-allowed'
          }}
          disabled={selected.length === 0}
        >
          🗑️ Delete Selected ({selected.length})
        </button>
      </div>

      {/* Drop Zone */}
      <div
        style={{
          ...styles.dropZone,
          borderColor: dragOver ? '#667eea' : '#ccc',
          background: dragOver ? '#f0f0ff' : '#fafafa',
        }}
        onClick={() => fileInputRef.current.click()}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <span style={styles.dropIcon}>☁️</span>
        <span style={styles.dropText}>
          {dragOver ? 'Release to upload' : 'Drag & drop files here, or click to browse'}
        </span>
      </div>

      {/* File List */}
      {files.length === 0 ? (
        <p style={styles.empty}>No files uploaded yet.</p>
      ) : (
        <>
          <div style={styles.sortBar}>
            <span style={styles.sortLabel}>Sort by:</span>
            <button
              style={{ ...styles.sortBtn, ...(sortBy === 'name' ? styles.sortBtnActive : {}) }}
              onClick={() => changeSort('name')}
            >
              Name{sortArrow('name')}
            </button>
            <button
              style={{ ...styles.sortBtn, ...(sortBy === 'date' ? styles.sortBtnActive : {}) }}
              onClick={() => changeSort('date')}
            >
              Date{sortArrow('date')}
            </button>
          </div>
          <div
            ref={fileListRef}
            style={styles.fileList}
            tabIndex={0}
            onKeyDown={handleFileListKeyDown}
          >
          {sortedFiles.map(file => (
            <div
              key={file.name}
              style={{
                ...styles.fileItem,
                background: selected.includes(file.name) ? '#f0f0ff' : 'white',
                borderColor: selected.includes(file.name) ? '#667eea' : '#eee',
              }}
              onClick={() => toggleSelect(file.name)}
            >
              <span style={styles.fileIcon}>
                {file.name.endsWith('.pdf') ? '📄' :
                 file.name.endsWith('.docx') ? '📝' :
                 file.name.endsWith('.txt') ? '📃' :
                 file.name.endsWith('.pptx') ? '📊' : '📁'}
              </span>
              <div style={styles.fileInfo}>
                <p style={styles.fileName}>{file.name}</p>
                <p style={styles.fileMeta}>
                  {formatSize(file.size)} · {new Date(file.uploaded_at).toLocaleDateString()}
                </p>
              </div>
              {(() => {
                const status = file.status || (file.indexed ? 'indexed' : 'pending');
                if (status === 'indexed') {
                  return (
                    <span style={styles.indexedBadge} title="Indexed successfully">✅</span>
                  );
                }
                if (status === 'failed') {
                  return (
                    <span style={styles.failedBadgeWrap}>
                      <span style={styles.failedBadge} title={file.error || 'Indexing failed'}>❌</span>
                      <button
                        style={styles.retryBtn}
                        title="Retry indexing"
                        onClick={e => { e.stopPropagation(); handleReindex(file.name); }}
                      >
                        ↻
                      </button>
                    </span>
                  );
                }
                return (
                  <span style={styles.indexingBadge} title="Indexing…">⏳</span>
                );
              })()}
              <button
                style={styles.rowDownloadBtn}
                title="Download"
                onClick={e => { e.stopPropagation(); handleDownload(file.name); }}
              >
                ⬇️
              </button>
              <input
                type="checkbox"
                checked={selected.includes(file.name)}
                onChange={() => toggleSelect(file.name)}
                onClick={e => e.stopPropagation()}
              />
            </div>
          ))}
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  container: { padding: '10px 0' },
  notice: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    marginBottom: 12,
    borderRadius: 8,
    background: '#fffbea',
    border: '1px solid #f6e05e',
    color: '#975a16',
    fontSize: 13,
    fontWeight: 600,
  },
  noticeClose: {
    background: 'none',
    border: 'none',
    color: '#975a16',
    cursor: 'pointer',
    fontSize: 14,
    lineHeight: 1,
    padding: 2,
    flexShrink: 0,
  },
  modalNotice: {
    margin: 0,
    fontSize: 12,
    color: '#975a16',
    background: '#fffbea',
    border: '1px solid #f6e05e',
    borderRadius: 8,
    padding: '8px 12px',
    width: '100%',
  },
  toolbar: {
    display: 'flex',
    gap: 10,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  uploadBtn: {
    padding: '10px 16px',
    borderRadius: 8,
    border: 'none',
    background: '#667eea',
    color: 'white',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 'bold',
    flex: '1 1 auto',
  },
  dropZone: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '24px 16px',
    marginBottom: 12,
    borderRadius: 12,
    border: '2px dashed #ccc',
    cursor: 'pointer',
    transition: 'border-color 0.15s, background 0.15s',
  },
  dropIcon: { fontSize: 32 },
  dropText: { fontSize: 13, color: '#666' },
  downloadBtn: {
    padding: '10px 16px',
    borderRadius: 8,
    background: '#2ed573',
    color: 'white',
    border: 'none',
    fontSize: 14,
    fontWeight: 'bold',
    flex: '1 1 auto',
  },
  deleteBtn: {
    padding: '10px 16px',
    borderRadius: 8,
    background: '#ff4757',
    color: 'white',
    border: 'none',
    fontSize: 14,
    fontWeight: 'bold',
    flex: '1 1 auto',
  },
  indexedBadge: {
    fontSize: 14,
    flexShrink: 0,
  },
  indexingBadge: {
    fontSize: 14,
    flexShrink: 0,
    opacity: 0.7,
  },
  failedBadgeWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  failedBadge: {
    fontSize: 14,
    cursor: 'help',
  },
  retryBtn: {
    background: 'none',
    border: '1px solid #ddd',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
    lineHeight: 1,
    padding: '2px 5px',
    color: '#667eea',
  },
  rowDownloadBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 18,
    padding: '2px 4px',
    borderRadius: 4,
  },
  empty: {
    textAlign: 'center',
    color: '#aaa',
    padding: 30,
  },
  sortBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sortLabel: {
    fontSize: 13,
    color: '#888',
    fontWeight: 600,
  },
  sortBtn: {
    padding: '5px 12px',
    borderRadius: 6,
    border: '1px solid #ddd',
    background: 'white',
    color: '#555',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
  sortBtnActive: {
    borderColor: '#667eea',
    background: '#f0f0ff',
    color: '#667eea',
  },
  fileList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxHeight: '70vh',
    overflowY: 'auto',
  },
  fileItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid #eee',
    cursor: 'pointer',
  },
  fileIcon: { fontSize: 24 },
  fileInfo: { flex: 1 },
  fileName: { margin: 0, fontSize: 14, fontWeight: 'bold', color: '#333' },
  fileMeta: { margin: 0, fontSize: 12, color: '#aaa' },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  modalCard: {
    background: 'white',
    borderRadius: 16,
    padding: '36px 40px',
    minWidth: 320,
    maxWidth: 420,
    width: '90%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
    textAlign: 'center',
  },
  spinner: {
    width: 48,
    height: 48,
    border: '4px solid #e0e0e0',
    borderTop: '4px solid #667eea',
    borderRadius: '50%',
    animation: 'rag-spin 0.8s linear infinite',
  },
  modalTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  modalCurrentFile: {
    margin: 0,
    fontSize: 13,
    color: '#667eea',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontWeight: 600,
  },
  progressBarTrack: {
    width: '100%',
    height: 8,
    background: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #667eea, #764ba2)',
    borderRadius: 4,
    transition: 'width 0.3s ease',
  },
  progressCount: {
    margin: 0,
    fontSize: 13,
    color: '#888',
  },
  modalNote: {
    margin: 0,
    fontSize: 12,
    color: '#aaa',
    fontStyle: 'italic',
  },
  doneIcon: {
    fontSize: 48,
    lineHeight: 1,
  },
  modalSubtitle: {
    margin: 0,
    fontSize: 14,
    color: '#555',
  },
  failedList: {
    width: '100%',
    background: '#fff5f5',
    borderRadius: 8,
    padding: '8px 12px',
    textAlign: 'left',
  },
  failedTitle: {
    margin: '0 0 4px 0',
    fontSize: 12,
    fontWeight: 'bold',
    color: '#e53e3e',
  },
  failedItem: {
    margin: '2px 0 0 0',
    fontSize: 12,
    color: '#e53e3e',
    wordBreak: 'break-all',
  },
  skippedList: {
    width: '100%',
    background: '#fffbea',
    borderRadius: 8,
    padding: '8px 12px',
    textAlign: 'left',
  },
  skippedTitle: {
    margin: '0 0 4px 0',
    fontSize: 12,
    fontWeight: 'bold',
    color: '#b7791f',
  },
  skippedItem: {
    margin: '2px 0 0 0',
    fontSize: 12,
    color: '#b7791f',
    wordBreak: 'break-all',
  },
  closeBtn: {
    marginTop: 4,
    padding: '10px 32px',
    borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    cursor: 'pointer',
  },
};