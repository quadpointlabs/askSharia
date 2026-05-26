import { useState, useRef, useEffect } from 'react';
import { sendMessage } from '../services/api';

export default function ChatBox() {
  const [messages, setMessages] = useState([
    { role: 'bot', text: 'Hello! Ask me anything about your documents.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const question = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: question }]);
    setLoading(true);

    try {
      const res = await sendMessage(question);
      setMessages(prev => [...prev, {
        role: 'bot',
        text: res.data.answer,
        sources: res.data.sources
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'bot',
        text: '❌ Error getting response. Please try again.'
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Messages */}
      <div style={styles.messages}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            ...styles.messageRow,
            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
          }}>
            {msg.role === 'bot' && <span style={styles.avatar}>🤖</span>}
            <div style={{
              ...styles.bubble,
              background: msg.role === 'user'
                ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                : '#f0f0f0',
              color: msg.role === 'user' ? 'white' : '#333',
              borderRadius: msg.role === 'user'
                ? '18px 18px 4px 18px'
                : '18px 18px 18px 4px',
            }}>
              <p style={{ margin: 0, direction: 'auto' }}>{msg.text}</p>
              {msg.sources && msg.sources.length > 0 && (
                <p style={styles.sources}>
                  📎 {msg.sources.join(', ')}
                </p>
              )}
            </div>
            {msg.role === 'user' && <span style={styles.avatar}>👤</span>}
          </div>
        ))}

        {loading && (
          <div style={{ ...styles.messageRow, justifyContent: 'flex-start' }}>
            <span style={styles.avatar}>🤖</span>
            <div style={{ ...styles.bubble, background: '#f0f0f0' }}>
              <p style={{ margin: 0, color: '#999' }}>Thinking...</p>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={styles.inputRow}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Ask a question... / اكتب سؤالك... / שאל שאלה..."
          style={styles.input}
          disabled={loading}
          dir="auto"
        />
        <button
          onClick={handleSend}
          style={{
            ...styles.sendBtn,
            opacity: loading || !input.trim() ? 0.5 : 1,
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer'
          }}
          disabled={loading || !input.trim()}
        >
          ➤
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '10px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  messageRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 8,
  },
  avatar: {
    fontSize: 24,
    flexShrink: 0,
  },
  bubble: {
    maxWidth: '70%',
    padding: '10px 14px',
    fontSize: 14,
    lineHeight: 1.5,
  },
  sources: {
    margin: '6px 0 0 0',
    fontSize: 11,
    opacity: 0.7,
  },
  inputRow: {
    display: 'flex',
    gap: 8,
    paddingTop: 12,
    borderTop: '1px solid #eee',
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    borderRadius: 24,
    border: '1px solid #ddd',
    fontSize: 14,
    outline: 'none',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: 'none',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    fontSize: 18,
    cursor: 'pointer',
  },
};