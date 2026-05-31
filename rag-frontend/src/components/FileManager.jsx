import { useState, useEffect, useRef } from 'react';
import { listFiles, uploadFile, deleteFile } from '../services/api';

export default function FileManager() {
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      const res = await listFiles();
      setFiles(res.data.files);
    } catch (err) {
      console.error('Failed to fetch files');
    }
  };

  const uploadFiles = async (fileArray) => {
    if (fileArray.length === 0) return;
    setUploading(true);
    setMessage('');
    const failed = [];
    try {
      for (let i = 0; i < fileArray.length; i++) {
        setMessage(`⏳ Uploading ${i + 1} of ${fileArray.length}: "${fileArray[i].name}"...`);
        try {
          await uploadFile(fileArray[i]);
        } catch {
          failed.push(fileArray[i].name);
        }
      }
      if (failed.length === 0) {
        setMessage(`✅ ${fileArray.length} file(s) uploaded successfully!`);
      } else {
        setMessage(`⚠️ ${fileArray.length - failed.length} uploaded, ${failed.length} failed: ${failed.join(', ')}`);
      }
      fetchFiles();
    } finally {
      setUploading(false);
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

  const handleDelete = async () => {
    if (selected.length === 0) return;
    if (!confirm(`Delete ${selected.length} file(s)?`)) return;
    try {
      await Promise.all(selected.map(f => deleteFile(f)));
      setMessage(`🗑️ ${selected.length} file(s) deleted`);
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

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div style={styles.container}>
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

      {message && <p style={styles.message}>{message}</p>}

      {/* File List */}
      {files.length === 0 ? (
        <p style={styles.empty}>No files uploaded yet.</p>
      ) : (
        <div style={styles.fileList}>
          {files.map(file => (
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
              <input
                type="checkbox"
                checked={selected.includes(file.name)}
                onChange={() => toggleSelect(file.name)}
                onClick={e => e.stopPropagation()}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { padding: '10px 0' },
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
  message: {
    padding: '8px 12px',
    borderRadius: 8,
    background: '#f8f8f8',
    fontSize: 13,
    marginBottom: 10,
  },
  empty: {
    textAlign: 'center',
    color: '#aaa',
    padding: 30,
  },
  fileList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxHeight: 300,
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
};