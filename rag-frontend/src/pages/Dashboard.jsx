import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe } from '../services/api';
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

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('chat');
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const res = await getMe();
      setUser(res.data);
    } catch (err) {
      localStorage.removeItem('token');
      navigate('/');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/');
  };

  if (isMobile) {
    return (
      <div style={mobile.container}>
        {/* Top Header */}
        <div style={mobile.header}>
          <div style={mobile.headerLeft}>
            <img src={chatIcon} alt="bot" style={mobile.headerIcon} />
            <span style={mobile.headerTitle}>RAG Bot</span>
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
              {user && <ChatBox userId={user.id} />}
            </div>
          )}
          {activeTab === 'files' && (
            <div style={mobile.filesWrapper}>
              <FileManager />
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
          <h2 style={styles.logo}>
            <img src={chatIcon} alt="bot" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', verticalAlign: 'middle', marginRight: 8 }} />
            RAG Bot
          </h2>
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
              {user && <ChatBox userId={user.id} />}
            </div>
          </div>
        )}

        {activeTab === 'files' && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>📁 My Files</h2>
            <FileManager />
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
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
    color: '#667eea',
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
    color: '#667eea',
    borderTop: '2px solid #667eea',
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

const styles = {
  container: {
    display: 'flex',
    height: '100vh',
    background: '#f5f5f5',
  },
  sidebar: {
    width: 260,
    background: 'linear-gradient(180deg, #667eea 0%, #764ba2 100%)',
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
    color: '#667eea',
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
