import { useState, useEffect } from 'react';
import { listFiles, uploadFile, deleteFile } from '../services/api';

export default function FileManager() {
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

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

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setMessage('');
    try {
      await uploadFile(file);
      setMessage(`✅ "${file.name}" uploaded successfully!`);
      fetchFiles();
    } catch (err) {
      setMessage('❌ Upload failed');
    } finally {
      setUploading(false);
    }
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
      <div style={styles.toolbar}>
        {/* Upload Button */}
        <label style={styles.uploadBtn}>
          {uploading ? '⏳ Uploading...' : '📤 Upload File'}
          <input
            type="file"
            onChange={handleUpload}
            style={{ display: 'none' }}
            disabled={uploading}
          />
        </label>

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

      {message && <p style={styles.message}>{message}</p>}

      {/* File List */}
      {files.length === 0 ? (
        <p style={styles.empty}>No files uploaded yet. Upload your first file!</p>
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
  },
  uploadBtn: {
    padding: '8px 16px',
    borderRadius: 8,
    background: '#667eea',
    color: 'white',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 'bold',
  },
  deleteBtn: {
    padding: '8px 16px',
    borderRadius: 8,
    background: '#ff4757',
    color: 'white',
    border: 'none',
    fontSize: 14,
    fontWeight: 'bold',
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