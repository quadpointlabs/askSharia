import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ownerGetMe, ownerListUsers, ownerSetUserStatus, ownerDeleteUser, ownerListFiles, ownerUploadFile, ownerDeleteFile, ownerDownloadFile, ownerSendMessage, ownerTopUpTokens } from '../services/api';

const OWNER_FILE_API = {
  listFiles: ownerListFiles,
  uploadFile: ownerUploadFile,
  deleteFile: ownerDeleteFile,
  downloadFile: ownerDownloadFile,
};
import chatIcon from '../assets/chatting.jpg';
import ChatBox from '../components/ChatBox';
import FileManager from '../components/FileManager';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

export default function OwnerDashboard() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('chat');
  const [isUploading, setIsUploading] = useState(false);
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [topupId, setTopupId] = useState(null);
  const [topupAmount, setTopupAmount] = useState('10');
  const [toppingUpId, setToppingUpId] = useState(null);
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  useEffect(() => {
    fetchUser();
  }, []);

  useEffect(() => {
    if (activeTab === 'users' && users.length === 0) fetchUsers();
  }, [activeTab]);

  const fetchUser = async () => {
    try {
      const res = await ownerGetMe();
      setUser(res.data);
    } catch (err) {
      localStorage.removeItem('ownerToken');
      localStorage.removeItem('token');
      navigate('/owner/login');
    }
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await ownerListUsers();
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
      await ownerSetUserStatus(userId, !currentEnabled);
      setUsers(prev =>
        prev.map(u => u.id === userId ? { ...u, enabled: !currentEnabled } : u)
      );
    } catch {
      // silently fail
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Delete this user permanently?')) return;
    setDeletingId(userId);
    try {
      await ownerDeleteUser(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch {
      // silently fail
    } finally {
      setDeletingId(null);
    }
  };

  const handleTopUp = async (userId) => {
    const amount = parseInt(topupAmount, 10);
    if (!amount || amount <= 0) return;
    setToppingUpId(userId);
    try {
      const res = await ownerTopUpTokens(userId, amount);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, tokens: res.data.tokens } : u));
      setTopupId(null);
      setTopupAmount('10');
    } catch {
      // silently fail
    } finally {
      setToppingUpId(null);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('ownerToken');
    localStorage.removeItem('token');
    navigate('/owner/login');
  };

  if (isMobile) {
    return (
      <div style={mobile.container}>
        {/* Top Header */}
        <div style={mobile.header}>
          <div style={mobile.headerLeft}>
            <img src={chatIcon} alt="bot" style={mobile.headerIcon} />
            <div>
              <span style={mobile.headerTitle}>RAG Bot</span>
              <span style={mobile.pageLabel}>Owner Page</span>
            </div>
          </div>
          {user && (
            <div style={mobile.headerRight}>
              <div style={mobile.userAvatar}>{user.name.charAt(0).toUpperCase()}</div>
              <button onClick={handleLogout} style={mobile.logoutBtn} title="Logout">🚪</button>
            </div>
          )}
        </div>

        {/* Content */}
        <div style={mobile.main}>
          {activeTab === 'chat' && (
            <div style={mobile.chatWrapper}>
              {user && <ChatBox userId={user.id} isUploading={isUploading} sendMessageFn={ownerSendMessage} />}
            </div>
          )}
          {activeTab === 'files' && (
            <div style={mobile.filesWrapper}>
              <FileManager onUploadingChange={setIsUploading} apiOverrides={OWNER_FILE_API} />
            </div>
          )}
          {activeTab === 'users' && (
            <div style={mobile.filesWrapper}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontWeight: 'bold', fontSize: 15, color: '#134e5e' }}>👥 Users</span>
                <button onClick={fetchUsers} style={ownerUserStyles.refreshBtn}>↻</button>
              </div>
              {loadingUsers ? (
                <p style={{ color: '#888', fontSize: 14 }}>Loading...</p>
              ) : users.length === 0 ? (
                <p style={{ color: '#aaa', textAlign: 'center', marginTop: 32 }}>No users found</p>
              ) : users.map(u => (
                <div key={u.id} style={ownerUserStyles.mobileCard}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={ownerUserStyles.avatar}>{u.name?.charAt(0)?.toUpperCase() ?? '?'}</div>
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: 14 }}>{u.name}</div>
                      <div style={{ fontSize: 12, color: '#888' }}>{u.email}</div>
                    </div>
                    <span style={{
                      ...ownerUserStyles.badge,
                      marginLeft: 'auto',
                      background: u.enabled !== false ? '#48bb78' : '#e53e3e',
                    }}>
                      {u.enabled !== false ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <span style={{
                      ...ownerUserStyles.badge,
                      background: (u.tokens ?? 0) > 20 ? '#c6f6d5' : (u.tokens ?? 0) > 5 ? '#feebc8' : '#fed7d7',
                      color: (u.tokens ?? 0) > 20 ? '#276749' : (u.tokens ?? 0) > 5 ? '#744210' : '#9b2c2c',
                    }}>
                      🪙 {u.tokens ?? 0} tokens
                    </span>
                    {topupId === u.id ? (
                      <>
                        <input
                          type="number"
                          min="1"
                          value={topupAmount}
                          onChange={e => setTopupAmount(e.target.value)}
                          style={ownerUserStyles.topupInput}
                        />
                        <button
                          onClick={() => handleTopUp(u.id)}
                          disabled={toppingUpId === u.id}
                          style={{ ...ownerUserStyles.actionBtn, background: '#48bb78', padding: '4px 10px' }}
                        >
                          {toppingUpId === u.id ? '...' : '✓'}
                        </button>
                        <button
                          onClick={() => { setTopupId(null); setTopupAmount('10'); }}
                          style={{ ...ownerUserStyles.actionBtn, background: '#a0aec0', padding: '4px 10px' }}
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setTopupId(u.id)}
                        style={{ ...ownerUserStyles.actionBtn, background: '#667eea', padding: '4px 10px', fontSize: 12 }}
                      >
                        + Add
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleToggleUser(u.id, u.enabled !== false)}
                      disabled={togglingId === u.id}
                      style={{
                        ...ownerUserStyles.actionBtn,
                        flex: 1,
                        background: u.enabled !== false ? '#e53e3e' : '#48bb78',
                        opacity: togglingId === u.id ? 0.6 : 1,
                      }}
                    >
                      {togglingId === u.id ? '...' : u.enabled !== false ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => handleDeleteUser(u.id)}
                      disabled={deletingId === u.id}
                      style={{
                        ...ownerUserStyles.actionBtn,
                        flex: 1,
                        background: '#718096',
                        opacity: deletingId === u.id ? 0.6 : 1,
                      }}
                    >
                      {deletingId === u.id ? '...' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Tab Bar */}
        <div style={mobile.tabBar}>
          <button
            onClick={() => setActiveTab('chat')}
            style={{ ...mobile.tab, ...(activeTab === 'chat' ? mobile.tabActive : {}) }}
          >
            <span style={mobile.tabIcon}>💬</span>
            <span style={mobile.tabLabel}>Chat</span>
          </button>
          <button
            onClick={() => setActiveTab('files')}
            style={{ ...mobile.tab, ...(activeTab === 'files' ? mobile.tabActive : {}) }}
          >
            <span style={mobile.tabIcon}>📁</span>
            <span style={mobile.tabLabel}>Files</span>
          </button>
          <button
            onClick={() => setActiveTab('users')}
            style={{ ...mobile.tab, ...(activeTab === 'users' ? mobile.tabActive : {}) }}
          >
            <span style={mobile.tabIcon}>👥</span>
            <span style={mobile.tabLabel}>Users</span>
          </button>
        </div>
      </div>
    );
  }

  // Desktop layout
  return (
    <div style={styles.container}>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div>
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ ...styles.logo, margin: '0 0 4px 0' }}>
              <img src={chatIcon} alt="bot" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', verticalAlign: 'middle', marginRight: 8 }} />
              RAG Bot
            </h2>
            <span style={styles.pageLabel}>Owner Page</span>
          </div>
          {user && (
            <div style={styles.userInfo}>
              <div style={styles.avatar}>
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p style={styles.userName}>{user.name}</p>
                <p style={styles.userEmail}>{user.email}</p>
              </div>
            </div>
          )}

          <nav style={styles.nav}>
            <button
              onClick={() => setActiveTab('chat')}
              style={{
                ...styles.navBtn,
                background: activeTab === 'chat' ? 'rgba(255,255,255,0.2)' : 'transparent'
              }}
            >
              💬 Chat
            </button>
            <button
              onClick={() => setActiveTab('files')}
              style={{
                ...styles.navBtn,
                background: activeTab === 'files' ? 'rgba(255,255,255,0.2)' : 'transparent'
              }}
            >
              📁 My Files
            </button>
            <button
              onClick={() => setActiveTab('users')}
              style={{
                ...styles.navBtn,
                background: activeTab === 'users' ? 'rgba(255,255,255,0.2)' : 'transparent'
              }}
            >
              👥 Users
            </button>
          </nav>
        </div>

        <button onClick={handleLogout} style={styles.logoutBtn}>
          🚪 Logout
        </button>
      </div>

      {/* Main Content */}
      <div style={styles.main}>
        {activeTab === 'chat' && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>💬 Chat with your documents</h2>
            <div style={styles.chatContainer}>
              {user && <ChatBox userId={user.id} isUploading={isUploading} sendMessageFn={ownerSendMessage} />}
            </div>
          </div>
        )}

        {activeTab === 'files' && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>📁 My Files</h2>
            <FileManager onUploadingChange={setIsUploading} apiOverrides={OWNER_FILE_API} />
          </div>
        )}

        {activeTab === 'users' && (
          <div style={styles.section}>
            <div style={ownerUserStyles.sectionHeader}>
              <h2 style={styles.sectionTitle}>👥 User Management</h2>
              <button onClick={fetchUsers} style={ownerUserStyles.refreshBtn}>↻ Refresh</button>
            </div>
            {loadingUsers ? (
              <p style={{ color: '#888' }}>Loading users...</p>
            ) : (
              <div style={ownerUserStyles.tableWrap}>
                <table style={ownerUserStyles.table}>
                  <thead>
                    <tr>
                      <th style={ownerUserStyles.th}>Name</th>
                      <th style={ownerUserStyles.th}>Email</th>
                      <th style={ownerUserStyles.th}>Status</th>
                      <th style={ownerUserStyles.th}>Tokens</th>
                      <th style={ownerUserStyles.th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ ...ownerUserStyles.td, textAlign: 'center', color: '#aaa', padding: '32px' }}>
                          No users found
                        </td>
                      </tr>
                    ) : users.map(u => (
                      <tr key={u.id} style={ownerUserStyles.tr}>
                        <td style={ownerUserStyles.td}>
                          <div style={ownerUserStyles.userCell}>
                            <div style={ownerUserStyles.avatar}>{u.name?.charAt(0)?.toUpperCase() ?? '?'}</div>
                            <span>{u.name}</span>
                          </div>
                        </td>
                        <td style={ownerUserStyles.td}>{u.email}</td>
                        <td style={ownerUserStyles.td}>
                          <span style={{
                            ...ownerUserStyles.badge,
                            background: u.enabled !== false ? '#48bb78' : '#e53e3e',
                          }}>
                            {u.enabled !== false ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td style={ownerUserStyles.td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              ...ownerUserStyles.badge,
                              background: (u.tokens ?? 0) > 20 ? '#c6f6d5' : (u.tokens ?? 0) > 5 ? '#feebc8' : '#fed7d7',
                              color: (u.tokens ?? 0) > 20 ? '#276749' : (u.tokens ?? 0) > 5 ? '#744210' : '#9b2c2c',
                            }}>
                              🪙 {u.tokens ?? 0}
                            </span>
                            {topupId === u.id ? (
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <input
                                  type="number"
                                  min="1"
                                  value={topupAmount}
                                  onChange={e => setTopupAmount(e.target.value)}
                                  style={ownerUserStyles.topupInput}
                                />
                                <button
                                  onClick={() => handleTopUp(u.id)}
                                  disabled={toppingUpId === u.id}
                                  style={{ ...ownerUserStyles.actionBtn, background: '#48bb78', padding: '4px 10px' }}
                                >
                                  {toppingUpId === u.id ? '...' : '✓'}
                                </button>
                                <button
                                  onClick={() => { setTopupId(null); setTopupAmount('10'); }}
                                  style={{ ...ownerUserStyles.actionBtn, background: '#a0aec0', padding: '4px 10px' }}
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setTopupId(u.id)}
                                style={{ ...ownerUserStyles.actionBtn, background: '#667eea', padding: '4px 10px', fontSize: 12 }}
                              >
                                + Add
                              </button>
                            )}
                          </div>
                        </td>
                        <td style={ownerUserStyles.td}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => handleToggleUser(u.id, u.enabled !== false)}
                              disabled={togglingId === u.id}
                              style={{
                                ...ownerUserStyles.actionBtn,
                                background: u.enabled !== false ? '#e53e3e' : '#48bb78',
                                opacity: togglingId === u.id ? 0.6 : 1,
                              }}
                            >
                              {togglingId === u.id ? '...' : u.enabled !== false ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u.id)}
                              disabled={deletingId === u.id}
                              style={{
                                ...ownerUserStyles.actionBtn,
                                background: '#718096',
                                opacity: deletingId === u.id ? 0.6 : 1,
                              }}
                            >
                              {deletingId === u.id ? '...' : 'Delete'}
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
      </div>
    </div>
  );
}

const mobile = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100dvh',
    background: '#f5f5f5',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    background: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)',
    flexShrink: 0,
    height: 56,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    objectFit: 'cover',
  },
  headerTitle: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 18,
    display: 'block',
  },
  pageLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: 'white',
    color: '#134e5e',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: 16,
    flexShrink: 0,
  },
  logoutBtn: {
    background: 'rgba(255,255,255,0.2)',
    border: 'none',
    borderRadius: 8,
    color: 'white',
    padding: '6px 10px',
    fontSize: 16,
    cursor: 'pointer',
  },
  main: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  chatWrapper: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    background: 'white',
    padding: 10,
    minHeight: 0,
    overflow: 'hidden',
  },
  filesWrapper: {
    flex: 1,
    overflowY: 'auto',
    padding: '10px 12px',
  },
  tabBar: {
    display: 'flex',
    flexShrink: 0,
    background: 'white',
    borderTop: '1px solid #eee',
    height: 60,
  },
  tab: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    color: '#aaa',
    gap: 2,
    padding: '4px 0',
  },
  tabActive: {
    color: '#134e5e',
    borderTop: '2px solid #134e5e',
  },
  tabIcon: {
    fontSize: 22,
    lineHeight: 1,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: 'bold',
  },
};

const ownerUserStyles = {
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  refreshBtn: {
    padding: '8px 16px',
    borderRadius: 8,
    border: '1px solid #ddd',
    background: 'white',
    cursor: 'pointer',
    fontSize: 13,
    color: '#555',
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
    background: 'linear-gradient(135deg, #134e5e, #71b280)',
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
  mobileCard: {
    background: 'white',
    borderRadius: 10,
    padding: '12px 14px',
    marginBottom: 10,
    boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
  },
  topupInput: {
    width: 56,
    padding: '4px 6px',
    borderRadius: 6,
    border: '1px solid #ddd',
    fontSize: 13,
    textAlign: 'center',
  },
};

const styles = {
  container: {
    display: 'flex',
    height: '100vh',
    background: '#f5f5f5',
  },
  sidebar: {
    width: 260,
    background: 'linear-gradient(180deg, #134e5e 0%, #71b280 100%)',
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    color: 'white',
  },
  logo: {
    fontSize: 22,
    margin: '0 0 24px 0',
  },
  pageLabel: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.65)',
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 32,
    padding: 12,
    background: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: 'white',
    color: '#134e5e',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: 18,
    flexShrink: 0,
  },
  userName: {
    margin: 0,
    fontWeight: 'bold',
    fontSize: 14,
  },
  userEmail: {
    margin: 0,
    fontSize: 11,
    opacity: 0.8,
    wordBreak: 'break-all',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  navBtn: {
    padding: '12px 16px',
    borderRadius: 10,
    border: 'none',
    color: 'white',
    fontSize: 15,
    cursor: 'pointer',
    textAlign: 'left',
    fontWeight: 'bold',
  },
  logoutBtn: {
    padding: '12px 16px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.3)',
    background: 'transparent',
    color: 'white',
    fontSize: 15,
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
  sectionTitle: {
    margin: '0 0 20px 0',
    color: '#333',
    fontSize: 22,
  },
  chatContainer: {
    flex: 1,
    background: 'white',
    borderRadius: 16,
    padding: 20,
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
};
