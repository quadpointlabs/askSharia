import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ownerLogin } from '../services/api';
import chatIcon from '../assets/chatting.jpg';

export default function OwnerLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await ownerLogin(email, password);
      localStorage.setItem('ownerToken', res.data.access_token);
      // Also set 'token' so shared components (ChatBox, FileManager) work without changes
      localStorage.setItem('token', res.data.access_token);
      navigate('/owner');
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <img src={chatIcon} alt="askSharia" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', display: 'block', margin: '0 auto 12px' }} />
        <h1 style={styles.title}>Owner Login</h1>
        <p style={styles.subtitle}>Manage your knowledge base</p>

        <form onSubmit={handleLogin} style={styles.form}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
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
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <p style={styles.backText}>
          <Link to="/" style={styles.backLink}>Back to User login</Link>
        </p>
        <p style={styles.backText}>
          <Link to="/admin/login" style={styles.backLink}>Go to Admin page</Link>
        </p>
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
    background: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)',
  },
  card: {
    background: 'white',
    borderRadius: 16,
    padding: '32px 24px',
    width: '90%',
    maxWidth: 380,
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  },
  title: {
    textAlign: 'center',
    fontSize: 28,
    marginBottom: 8,
    color: '#333',
  },
  subtitle: {
    textAlign: 'center',
    color: '#888',
    marginBottom: 30,
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
    background: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)',
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
  backText: {
    textAlign: 'center',
    marginTop: 8,
  },
  backLink: {
    color: '#bbb',
    textDecoration: 'none',
    fontSize: 12,
  },
};
