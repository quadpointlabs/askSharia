import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { sendMessage } from '../services/api';
import chatIcon from '../assets/chatting.jpg';

const WELCOME = { role: 'bot', text: 'Hello! Ask me anything about your documents.' };

const loadHistory = (userId) => {
  try {
    const saved = localStorage.getItem(`chat_history_${userId}`);
    return saved ? JSON.parse(saved) : [WELCOME];
  } catch {
    return [WELCOME];
  }
};

export default function ChatBox({ userId, isUploading, sendMessageFn = sendMessage, tokens, onTokenUsed }) {
  const [messages, setMessages] = useState(() => loadHistory(userId));
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  const outOfTokens = tokens !== undefined && tokens <= 0;

  useEffect(() => {
    localStorage.setItem(`chat_history_${userId}`, JSON.stringify(messages));
  }, [messages, userId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleClear = () => {
    setMessages([WELCOME]);
  };

  const handleSend = async () => {
    if (!input.trim() || loading || outOfTokens) return;

    const question = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: question }]);
    setLoading(true);

    try {
      const res = await sendMessageFn(question);
      setMessages(prev => [...prev, {
        role: 'bot',
        text: res.data.answer,
        sources: res.data.sources
      }]);
      if (res.data.tokens_remaining !== null && res.data.tokens_remaining !== undefined) {
        onTokenUsed?.(res.data.tokens_remaining);
      }
    } catch (err) {
      const detail = err.response?.data?.detail;
      const isOutOfTokens = err.response?.status === 402;
      setMessages(prev => [...prev, {
        role: 'bot',
        text: isOutOfTokens
          ? `🪙 ${detail}`
          : '❌ Error getting response. Please try again.'
      }]);
      if (isOutOfTokens) onTokenUsed?.(0);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {isUploading && (
        <div style={styles.uploadingBanner}>
          ⏳ Files are being uploaded and indexed — chat will be available once complete.
        </div>
      )}
      {outOfTokens && (
        <div style={styles.noTokensBanner}>
          🪙 No tokens remaining. Contact your owner to top up.
        </div>
      )}
      {/* Messages */}
      <div style={styles.messages}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            ...styles.messageRow,
            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
          }}>
            {msg.role === 'bot' && <img src={chatIcon} alt="bot" style={styles.avatar} />}
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
              {msg.role === 'bot' ? (
                <div style={styles.markdown}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ children }) => <p style={{ margin: '0 0 8px 0' }}>{children}</p>,
                      ul: ({ children }) => <ul style={{ margin: '0 0 8px 0', paddingLeft: 20 }}>{children}</ul>,
                      ol: ({ children }) => <ol style={{ margin: '0 0 8px 0', paddingLeft: 20 }}>{children}</ol>,
                      li: ({ children }) => <li style={{ marginBottom: 2 }}>{children}</li>,
                      code: ({ inline, children }) =>
                        inline
                          ? <code style={{ background: '#e0e0e0', borderRadius: 4, padding: '1px 5px', fontFamily: 'monospace', fontSize: 13 }}>{children}</code>
                          : <pre style={{ background: '#1e1e1e', color: '#d4d4d4', borderRadius: 8, padding: '10px 14px', overflowX: 'auto', fontSize: 13, fontFamily: 'monospace', margin: '0 0 8px 0' }}><code>{children}</code></pre>,
                      table: ({ children }) => <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 8 }}>{children}</table>,
                      th: ({ children }) => <th style={{ border: '1px solid #ccc', padding: '4px 8px', background: '#e8e8e8' }}>{children}</th>,
                      td: ({ children }) => <td style={{ border: '1px solid #ccc', padding: '4px 8px' }}>{children}</td>,
                      blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid #aaa', margin: '0 0 8px 0', paddingLeft: 12, color: '#666' }}>{children}</blockquote>,
                    }}
                  >
                    {msg.text}
                  </ReactMarkdown>
                </div>
              ) : (
                <p style={{ margin: 0, direction: 'auto' }}>{msg.text}</p>
              )}
              {msg.sources && msg.sources.length > 0 && (
                <div style={styles.sourcesContainer}>
                <p style={styles.sourcesTitle}>📎 Sources:</p>
                {[...new Map(msg.sources.map(s => [s.file, s])).values()].map((src, i) => (
                <div key={i} style={styles.sourceItem}>
                <span>[{src.number}] 📄 {src.file}</span>
                {src.score && (
                <span style={styles.score}>
                {' '}· relevance: {(src.score * 100).toFixed(0)}%
                </span>
                )}
                </div>
                ))}
                </div>
              )}
            </div>
            {msg.role === 'user' && <span style={styles.avatar}>👤</span>}
          </div>
        ))}

        {loading && (
          <div style={{ ...styles.messageRow, justifyContent: 'flex-start' }}>
            <img src={chatIcon} alt="bot" style={styles.avatar} />
            <div style={{ ...styles.bubble, background: '#f0f0f0' }}>
              <p style={{ margin: 0, color: '#999' }}>Thinking...</p>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={styles.inputRow}>
        <button
          onClick={handleClear}
          title="Clear history"
          style={styles.clearBtn}
        >
          🗑️
        </button>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Ask a question... / اكتب سؤالك... / שאל שאלה..."
          style={styles.input}
          disabled={loading || isUploading || outOfTokens}
          dir="auto"
        />
        {tokens !== undefined && (
          <span style={{
            ...styles.tokenBadge,
            background: tokens > 20 ? '#e8f5e9' : tokens > 5 ? '#fff3e0' : '#ffebee',
            color: tokens > 20 ? '#2e7d32' : tokens > 5 ? '#e65100' : '#c62828',
          }}>
            🪙 {tokens}
          </span>
        )}
        <button
          onClick={handleSend}
          style={{
            ...styles.sendBtn,
            opacity: loading || !input.trim() || isUploading || outOfTokens ? 0.5 : 1,
            cursor: loading || !input.trim() || isUploading || outOfTokens ? 'not-allowed' : 'pointer'
          }}
          disabled={loading || !input.trim() || isUploading || outOfTokens}
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
  uploadingBanner: {
    padding: '8px 14px',
    marginBottom: 8,
    borderRadius: 8,
    background: '#fff8e1',
    border: '1px solid #ffe082',
    fontSize: 13,
    color: '#795548',
    textAlign: 'center',
  },
  noTokensBanner: {
    padding: '8px 14px',
    marginBottom: 8,
    borderRadius: 8,
    background: '#ffebee',
    border: '1px solid #ef9a9a',
    fontSize: 13,
    color: '#c62828',
    textAlign: 'center',
  },
  tokenBadge: {
    fontSize: 12,
    fontWeight: '700',
    padding: '4px 10px',
    borderRadius: 20,
    whiteSpace: 'nowrap',
    flexShrink: 0,
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
    width: 32,
    height: 32,
    borderRadius: '50%',
    objectFit: 'cover',
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
  markdown: {
    margin: 0,
    lineHeight: 1.6,
    // collapse default margins on the first/last child elements
    // so the bubble padding is the only spacing
    overflowX: 'auto',
  },
  inputRow: {
    display: 'flex',
    gap: 8,
    paddingTop: 12,
    borderTop: '1px solid #eee',
    alignItems: 'center',
  },
  clearBtn: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: '1px solid #ddd',
    background: 'white',
    fontSize: 16,
    cursor: 'pointer',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    borderRadius: 24,
    border: '1px solid #ddd',
    fontSize: 16,
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