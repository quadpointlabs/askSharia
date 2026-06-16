import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAdminStats, listUsers, setUserStatus, changeAdminPassword, createUser, listOwners, createOwner, setOwnerStatus, deleteOwner, adminGetSystemPrompt, adminSetSystemPrompt } from '../services/api';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', email: '', password: '' });
  const [createError, setCreateError] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [owners, setOwners] = useState([]);
  const [loadingOwners, setLoadingOwners] = useState(false);
  const [togglingOwnerId, setTogglingOwnerId] = useState(null);
  const [deletingOwnerId, setDeletingOwnerId] = useState(null);
  const [showCreateOwnerForm, setShowCreateOwnerForm] = useState(false);
  const [createOwnerForm, setCreateOwnerForm] = useState({ name: '', email: '', password: '' });
  const [createOwnerError, setCreateOwnerError] = useState('');
  const [createOwnerLoading, setCreateOwnerLoading] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [promptDraft, setPromptDraft] = useState('');
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptSaved, setPromptSaved] = useState(false);
  const [promptLoaded, setPromptLoaded] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (activeTab === 'users' && users.length === 0) fetchUsers();
    if (activeTab === 'owners' && owners.length === 0) fetchOwners();
    if (activeTab === 'prompt' && !promptLoaded) fetchSystemPrompt();
  }, [activeTab]);

  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const res = await getAdminStats();
      setStats(res.data);
    } catch {
      localStorage.removeItem('adminToken');
      navigate('/admin/login');
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await listUsers();
      setUsers(res.data);
    } catch {
      // keep existing list on error
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleToggleUser = async (userId, currentEnabled) => {
    setTogglingId(userId);
    try {
      await setUserStatus(userId, !currentEnabled);
      setUsers(prev =>
        prev.map(u => u.id === userId ? { ...u, enabled: !currentEnabled } : u)
      );
    } catch {
      // silently fail — UI stays unchanged
    } finally {
      setTogglingId(null);
    }
  };

  const fetchSystemPrompt = async () => {
    try {
      const res = await adminGetSystemPrompt();
      setPromptDraft(res.data.system_prompt);
      setPromptLoaded(true);
    } catch {
      // keep draft empty on error
    }
  };

  const handleSavePrompt = async () => {
    if (!promptDraft.trim()) return;
    setPromptSaving(true);
    setPromptSaved(false);
    try {
      const res = await adminSetSystemPrompt(promptDraft);
      setPromptDraft(res.data.system_prompt);
      setPromptSaved(true);
      setTimeout(() => setPromptSaved(false), 3000);
    } catch {
      // silently fail
    } finally {
      setPromptSaving(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    navigate('/admin/login');
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreateError('');
    setCreateLoading(true);
    try {
      const res = await createUser(createForm.name, createForm.email, createForm.password);
      setUsers(prev => [{ ...res.data, enabled: true, role: 'user', created_at: new Date().toISOString() }, ...prev]);
      setCreateForm({ name: '', email: '', password: '' });
      setShowCreateForm(false);
    } catch (err) {
      setCreateError(err.response?.data?.detail || 'Failed to create account');
    } finally {
      setCreateLoading(false);
    }
  };

  const fetchOwners = async () => {
    setLoadingOwners(true);
    try {
      const res = await listOwners();
      setOwners(res.data);
    } catch {
      // keep existing list on error
    } finally {
      setLoadingOwners(false);
    }
  };

  const handleToggleOwner = async (ownerId, currentEnabled) => {
    setTogglingOwnerId(ownerId);
    try {
      await setOwnerStatus(ownerId, !currentEnabled);
      setOwners(prev =>
        prev.map(o => o.id === ownerId ? { ...o, enabled: !currentEnabled } : o)
      );
    } catch {
      // silently fail
    } finally {
      setTogglingOwnerId(null);
    }
  };

  const handleDeleteOwner = async (ownerId) => {
    if (!window.confirm('Delete this owner permanently?')) return;
    setDeletingOwnerId(ownerId);
    try {
      await deleteOwner(ownerId);
      setOwners(prev => prev.filter(o => o.id !== ownerId));
    } catch {
      // silently fail
    } finally {
      setDeletingOwnerId(null);
    }
  };

  const handleCreateOwner = async (e) => {
    e.preventDefault();
    setCreateOwnerError('');
    setCreateOwnerLoading(true);
    try {
      const res = await createOwner(createOwnerForm.name, createOwnerForm.email, createOwnerForm.password);
      setOwners(prev => [{ ...res.data, enabled: true, created_at: new Date().toISOString() }, ...prev]);
      setCreateOwnerForm({ name: '', email: '', password: '' });
      setShowCreateOwnerForm(false);
    } catch (err) {
      setCreateOwnerError(err.response?.data?.detail || 'Failed to create owner');
    } finally {
      setCreateOwnerLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');
    if (pwForm.next !== pwForm.confirm) {
      setPwError('New passwords do not match');
      return;
    }
    if (pwForm.next.length < 6) {
      setPwError('New password must be at least 6 characters');
      return;
    }
    setPwLoading(true);
    try {
      await changeAdminPassword(pwForm.current, pwForm.next);
      setPwSuccess('Password changed successfully');
      setPwForm({ current: '', next: '', confirm: '' });
    } catch (err) {
      setPwError(err.response?.data?.detail || 'Failed to change password');
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div>
          <div style={styles.logoArea}>
            <span style={styles.logoIcon}>🛡️</span>
            <div>
              <h2 style={styles.logoTitle}>RAG Bot</h2>
              <span style={styles.pageLabel}>Admin Page</span>
            </div>
          </div>

          <nav style={styles.nav}>
            <button
              onClick={() => setActiveTab('overview')}
              style={{ ...styles.navBtn, background: activeTab === 'overview' ? 'rgba(255,255,255,0.15)' : 'transparent' }}
            >
              📊 Overview
            </button>
            <button
              onClick={() => setActiveTab('users')}
              style={{ ...styles.navBtn, background: activeTab === 'users' ? 'rgba(255,255,255,0.15)' : 'transparent' }}
            >
              👥 Users
            </button>
            <button
              onClick={() => setActiveTab('owners')}
              style={{ ...styles.navBtn, background: activeTab === 'owners' ? 'rgba(255,255,255,0.15)' : 'transparent' }}
            >
              🏢 Owners
            </button>
            <button
              onClick={() => setActiveTab('prompt')}
              style={{ ...styles.navBtn, background: activeTab === 'prompt' ? 'rgba(255,255,255,0.15)' : 'transparent' }}
            >
              📝 System Prompt
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              style={{ ...styles.navBtn, background: activeTab === 'settings' ? 'rgba(255,255,255,0.15)' : 'transparent' }}
            >
              ⚙️ Settings
            </button>
          </nav>
        </div>

        <button onClick={handleLogout} style={styles.logoutBtn}>
          🚪 Logout
        </button>
      </div>

      {/* Main Content */}
      <div style={styles.main}>
        {activeTab === 'overview' && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>📊 System Overview</h2>
            {loadingStats ? (
              <p style={{ color: '#888' }}>Loading stats...</p>
            ) : stats ? (
              <div style={styles.statsGrid}>
                <StatCard label="Total Users" value={stats.total_users ?? '—'} icon="👤" color="#667eea" />
                <StatCard label="Total Files" value={stats.total_files ?? '—'} icon="📄" color="#48bb78" />
                <StatCard label="Total Chats" value={stats.total_chats ?? '—'} icon="💬" color="#ed8936" />
                <StatCard label="Active Today" value={stats.active_today ?? '—'} icon="🟢" color="#38b2ac" />
              </div>
            ) : (
              <p style={{ color: '#e53e3e' }}>Failed to load stats.</p>
            )}
          </div>
        )}

        {activeTab === 'owners' && (
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>🏢 Owner Management</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setShowCreateOwnerForm(v => !v); setCreateOwnerError(''); }} style={styles.createBtn}>
                  {showCreateOwnerForm ? '✕ Cancel' : '+ New Owner'}
                </button>
                <button onClick={fetchOwners} style={styles.refreshBtn}>↻ Refresh</button>
              </div>
            </div>

            {showCreateOwnerForm && (
              <form onSubmit={handleCreateOwner} style={styles.createForm}>
                <input
                  type="text"
                  placeholder="Full Name"
                  value={createOwnerForm.name}
                  onChange={e => setCreateOwnerForm(f => ({ ...f, name: e.target.value }))}
                  style={styles.createInput}
                  required
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={createOwnerForm.email}
                  onChange={e => setCreateOwnerForm(f => ({ ...f, email: e.target.value }))}
                  style={styles.createInput}
                  required
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={createOwnerForm.password}
                  onChange={e => setCreateOwnerForm(f => ({ ...f, password: e.target.value }))}
                  style={styles.createInput}
                  required
                />
                {createOwnerError && <p style={{ color: '#e53e3e', fontSize: 13, margin: 0 }}>{createOwnerError}</p>}
                <button type="submit" style={styles.createSubmitBtn} disabled={createOwnerLoading}>
                  {createOwnerLoading ? 'Creating...' : 'Create Owner'}
                </button>
              </form>
            )}

            {loadingOwners ? (
              <p style={{ color: '#888' }}>Loading owners...</p>
            ) : (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Name</th>
                      <th style={styles.th}>Email</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {owners.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ ...styles.td, textAlign: 'center', color: '#aaa', padding: '32px' }}>
                          No owners found
                        </td>
                      </tr>
                    ) : owners.map(owner => (
                      <tr key={owner.id} style={styles.tr}>
                        <td style={styles.td}>
                          <div style={styles.userCell}>
                            <div style={{ ...styles.avatar, background: 'linear-gradient(135deg, #134e5e, #71b280)' }}>
                              {owner.name?.charAt(0)?.toUpperCase() ?? '?'}
                            </div>
                            <span>{owner.name}</span>
                          </div>
                        </td>
                        <td style={styles.td}>{owner.email}</td>
                        <td style={styles.td}>
                          <span style={{
                            ...styles.badge,
                            background: owner.enabled !== false ? '#48bb78' : '#e53e3e',
                          }}>
                            {owner.enabled !== false ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => handleToggleOwner(owner.id, owner.enabled !== false)}
                              disabled={togglingOwnerId === owner.id}
                              style={{
                                ...styles.actionBtn,
                                background: owner.enabled !== false ? '#e53e3e' : '#48bb78',
                                opacity: togglingOwnerId === owner.id ? 0.6 : 1,
                              }}
                            >
                              {togglingOwnerId === owner.id ? '...' : owner.enabled !== false ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              onClick={() => handleDeleteOwner(owner.id)}
                              disabled={deletingOwnerId === owner.id}
                              style={{
                                ...styles.actionBtn,
                                background: '#718096',
                                opacity: deletingOwnerId === owner.id ? 0.6 : 1,
                              }}
                            >
                              {deletingOwnerId === owner.id ? '...' : 'Delete'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'prompt' && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>📝 System Prompt</h2>
            <div style={promptStyles.card}>
              <p style={promptStyles.desc}>
                This prompt instructs the AI assistant on how to query and respond using the RAG documents.
                Changes take effect immediately for all new chat sessions.
              </p>
              <textarea
                value={promptDraft}
                onChange={e => setPromptDraft(e.target.value)}
                disabled={!promptLoaded || promptSaving}
                style={promptStyles.textarea}
                placeholder={promptLoaded ? '' : 'Loading...'}
              />
              <div style={promptStyles.actions}>
                {promptSaved && <span style={promptStyles.savedBadge}>✓ Saved</span>}
                <button
                  onClick={handleSavePrompt}
                  disabled={!promptLoaded || promptSaving || !promptDraft.trim()}
                  style={{
                    ...promptStyles.saveBtn,
                    opacity: (!promptLoaded || promptSaving || !promptDraft.trim()) ? 0.6 : 1,
                    cursor: (!promptLoaded || promptSaving || !promptDraft.trim()) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {promptSaving ? 'Saving...' : 'Save Prompt'}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>⚙️ Settings</h2>
            <div style={settingsStyles.card}>
              <h3 style={settingsStyles.cardTitle}>Change Password</h3>
              <form onSubmit={handleChangePassword} style={settingsStyles.form}>
                <input
                  type="password"
                  placeholder="Current password"
                  value={pwForm.current}
                  onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
                  style={settingsStyles.input}
                  required
                />
                <input
                  type="password"
                  placeholder="New password"
                  value={pwForm.next}
                  onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
                  style={settingsStyles.input}
                  required
                />
                <input
                  type="password"
                  placeholder="Confirm new password"
                  value={pwForm.confirm}
                  onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                  style={settingsStyles.input}
                  required
                />
                {pwError && <p style={settingsStyles.error}>{pwError}</p>}
                {pwSuccess && <p style={settingsStyles.success}>{pwSuccess}</p>}
                <button type="submit" style={settingsStyles.button} disabled={pwLoading}>
                  {pwLoading ? 'Saving...' : 'Change Password'}
                </button>
              </form>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>👥 User Management</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setShowCreateForm(v => !v); setCreateError(''); }} style={styles.createBtn}>
                  {showCreateForm ? '✕ Cancel' : '+ New Account'}
                </button>
                <button onClick={fetchUsers} style={styles.refreshBtn}>↻ Refresh</button>
              </div>
            </div>

            {showCreateForm && (
              <form onSubmit={handleCreateUser} style={styles.createForm}>
                <input
                  type="text"
                  placeholder="Full Name"
                  value={createForm.name}
                  onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                  style={styles.createInput}
                  required
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={createForm.email}
                  onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                  style={styles.createInput}
                  required
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={createForm.password}
                  onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
                  style={styles.createInput}
                  required
                />
                {createError && <p style={{ color: '#e53e3e', fontSize: 13, margin: 0 }}>{createError}</p>}
                <button type="submit" style={styles.createSubmitBtn} disabled={createLoading}>
                  {createLoading ? 'Creating...' : 'Create Account'}
                </button>
              </form>
            )}

            {loadingUsers ? (
              <p style={{ color: '#888' }}>Loading users...</p>
            ) : (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Name</th>
                      <th style={styles.th}>Email</th>
                      <th style={styles.th}>Role</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ ...styles.td, textAlign: 'center', color: '#aaa', padding: '32px' }}>
                          No users found
                        </td>
                      </tr>
                    ) : users.map(user => (
                      <tr key={user.id} style={styles.tr}>
                        <td style={styles.td}>
                          <div style={styles.userCell}>
                            <div style={styles.avatar}>{user.name?.charAt(0)?.toUpperCase() ?? '?'}</div>
                            <span>{user.name}</span>
                          </div>
                        </td>
                        <td style={styles.td}>{user.email}</td>
                        <td style={styles.td}>
                          <span style={{ ...styles.badge, background: user.role === 'admin' ? '#1a1a2e' : '#667eea' }}>
                            {user.role ?? 'user'}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <span style={{
                            ...styles.badge,
                            background: user.enabled !== false ? '#48bb78' : '#e53e3e',
                          }}>
                            {user.enabled !== false ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <button
                            onClick={() => handleToggleUser(user.id, user.enabled !== false)}
                            disabled={togglingId === user.id}
                            style={{
                              ...styles.actionBtn,
                              background: user.enabled !== false ? '#e53e3e' : '#48bb78',
                              opacity: togglingId === user.id ? 0.6 : 1,
                            }}
                          >
                            {togglingId === user.id
                              ? '...'
                              : user.enabled !== false ? 'Disable' : 'Enable'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }) {
  return (
    <div style={{ ...cardStyles.card, borderTop: `4px solid ${color}` }}>
      <div style={cardStyles.icon}>{icon}</div>
      <div style={{ ...cardStyles.value, color }}>{value}</div>
      <div style={cardStyles.label}>{label}</div>
    </div>
  );
}

const cardStyles = {
  card: {
    background: 'white',
    borderRadius: 12,
    padding: '24px 20px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    textAlign: 'center',
  },
  icon: { fontSize: 32, marginBottom: 8 },
  value: { fontSize: 36, fontWeight: 'bold', marginBottom: 4 },
  label: { fontSize: 13, color: '#888', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' },
};

const styles = {
  container: {
    display: 'flex',
    height: '100vh',
    background: '#f5f5f5',
  },
  sidebar: {
    width: 240,
    background: 'linear-gradient(180deg, #1a1a2e 0%, #0f3460 100%)',
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    color: 'white',
  },
  logoArea: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 32,
  },
  logoIcon: {
    fontSize: 32,
    flexShrink: 0,
  },
  logoTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 'bold',
  },
  pageLabel: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  navBtn: {
    padding: '11px 16px',
    borderRadius: 10,
    border: 'none',
    color: 'white',
    fontSize: 14,
    cursor: 'pointer',
    textAlign: 'left',
    fontWeight: 'bold',
  },
  logoutBtn: {
    padding: '11px 16px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.3)',
    background: 'transparent',
    color: 'white',
    fontSize: 14,
    cursor: 'pointer',
    textAlign: 'left',
    fontWeight: 'bold',
  },
  main: {
    flex: 1,
    padding: 32,
    overflowY: 'auto',
  },
  section: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  sectionTitle: {
    margin: '0 0 20px 0',
    color: '#1a1a2e',
    fontSize: 22,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: 20,
  },
  refreshBtn: {
    padding: '8px 16px',
    borderRadius: 8,
    border: '1px solid #ddd',
    background: 'white',
    cursor: 'pointer',
    fontSize: 13,
    color: '#555',
    marginBottom: 20,
  },
  createBtn: {
    padding: '8px 16px',
    borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)',
    color: 'white',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 20,
  },
  createForm: {
    background: 'white',
    borderRadius: 12,
    padding: '20px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    marginBottom: 20,
    maxWidth: 420,
  },
  createInput: {
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid #ddd',
    fontSize: 14,
    outline: 'none',
  },
  createSubmitBtn: {
    padding: '10px',
    borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)',
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  tableWrap: {
    background: 'white',
    borderRadius: 12,
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    overflow: 'hidden',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    padding: '14px 16px',
    textAlign: 'left',
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    background: '#fafafa',
    borderBottom: '1px solid #eee',
  },
  tr: {
    borderBottom: '1px solid #f0f0f0',
  },
  td: {
    padding: '14px 16px',
    fontSize: 14,
    color: '#333',
  },
  userCell: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #667eea, #764ba2)',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: 13,
    flexShrink: 0,
  },
  badge: {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: 20,
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  actionBtn: {
    padding: '6px 14px',
    borderRadius: 6,
    border: 'none',
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
    cursor: 'pointer',
  },
};

const promptStyles = {
  card: {
    background: 'white',
    borderRadius: 12,
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    flex: 1,
  },
  desc: {
    margin: 0,
    fontSize: 14,
    color: '#666',
    lineHeight: 1.6,
  },
  textarea: {
    width: '100%',
    minHeight: 280,
    padding: '12px 14px',
    borderRadius: 8,
    border: '1.5px solid #dde1e7',
    fontSize: 14,
    fontFamily: 'monospace',
    lineHeight: 1.6,
    resize: 'vertical',
    color: '#333',
    background: '#fafbfc',
    boxSizing: 'border-box',
    outline: 'none',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  savedBadge: {
    fontSize: 13,
    color: '#48bb78',
    fontWeight: '600',
  },
  saveBtn: {
    padding: '10px 24px',
    borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)',
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    cursor: 'pointer',
  },
};

const settingsStyles = {
  card: {
    background: 'white',
    borderRadius: 12,
    padding: '28px 24px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    maxWidth: 400,
  },
  cardTitle: {
    margin: '0 0 20px 0',
    fontSize: 16,
    color: '#1a1a2e',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  input: {
    padding: '11px 14px',
    borderRadius: 8,
    border: '1px solid #ddd',
    fontSize: 15,
    outline: 'none',
  },
  button: {
    padding: '11px',
    borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)',
    color: 'white',
    fontSize: 15,
    fontWeight: 'bold',
    cursor: 'pointer',
    marginTop: 4,
  },
  error: { color: '#e53e3e', fontSize: 13, margin: 0 },
  success: { color: '#38a169', fontSize: 13, margin: 0 },
};
