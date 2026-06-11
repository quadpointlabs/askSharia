import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminLogin } from '../services/api';

export default function AdminLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await adminLogin(username, password);
      localStorage.setItem('adminToken', res.data.access_token);
      navigate('/admin');
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.iconWrap}>
          <span style={styles.icon}>🛡️</span>
        </div>
        <h1 style={styles.title}>Admin Login</h1>
        <p style={styles.subtitle}>Restricted access — administrators only</p>

        <form onSubmit={handleLogin} style={styles.form}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            style={styles.input}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={styles.input}
            required
          />
          {error && <p style={styles.error}>{error}</p>}
          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? 'Logging in...' : 'Login as Admin'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
  },
  card: {
    background: 'white',
    borderRadius: 16,
    padding: '36px 28px',
    width: '90%',
    maxWidth: 380,
    boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
  },
  iconWrap: {
    textAlign: 'center',
    marginBottom: 12,
  },
  icon: {
    fontSize: 48,
  },
  title: {
    textAlign: 'center',
    fontSize: 26,
    marginBottom: 8,
    color: '#1a1a2e',
  },
  subtitle: {
    textAlign: 'center',
    color: '#888',
    fontSize: 13,
    marginBottom: 28,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  input: {
    padding: '12px 16px',
    borderRadius: 8,
    border: '1px solid #ddd',
    fontSize: 16,
    outline: 'none',
  },
  button: {
    padding: '12px',
    borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)',
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    cursor: 'pointer',
    marginTop: 8,
  },
  error: {
    color: 'red',
    fontSize: 13,
    textAlign: 'center',
  },
};
