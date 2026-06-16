import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe, listChats, createChat as apiCreateChat, renameChat as apiRenameChat } from '../services/api';
import chatIcon from '../assets/chatting.jpg';
import ChatBox from '../components/ChatBox';

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
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatName, setNewChatName] = useState('');
  const [showChatList, setShowChatList] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [showConversations, setShowConversations] = useState(true);
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  useEffect(() => {
    fetchUser();
  }, []);

  useEffect(() => {
    if (!user) return;
    listChats()
      .then(res => {
        if (res.data.length === 0) {
          return apiCreateChat('General').then(r => {
            setChats([r.data]);
            setActiveChatId(r.data.id);
          });
        }
        setChats(res.data);
        setActiveChatId(prev => prev ?? res.data[0].id);
      })
      .catch(() => {});
  }, [user?.id]);

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

  const handleRename = async (chatId) => {
    const trimmed = renameValue.trim();
    setRenamingId(null);
    if (!trimmed || trimmed === chats.find(c => c.id === chatId)?.name) return;
    try {
      await apiRenameChat(chatId, trimmed);
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, name: trimmed } : c));
    } catch {
      // silently fail — UI shows old name
    }
  };

  const handleCreateChat = async () => {
    if (!user) return;
    const name = newChatName.trim() || 'New Chat';
    try {
      const res = await apiCreateChat(name);
      setChats(prev => [res.data, ...prev]);
      setActiveChatId(res.data.id);
      setActiveTab('chat');
    } catch {
      // silently fail
    } finally {
      setNewChatName('');
      setShowNewChat(false);
      setShowChatList(false);
    }
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
              <span style={mobile.pageLabel}>User Page</span>
            </div>
          </div>
          {user && (
            <div style={mobile.headerRight}>
              <span style={planBadgeStyle(user.plan ?? 'free')}>
                {(user.plan ?? 'free').charAt(0).toUpperCase() + (user.plan ?? 'free').slice(1)}
              </span>
              <div style={mobile.userAvatar}>{user.name.charAt(0).toUpperCase()}</div>
              <button onClick={handleLogout} style={mobile.logoutBtn} title="Logout">🚪</button>
            </div>
          )}
        </div>

        {/* Content */}
        <div style={mobile.main}>
          {activeTab === 'chat' && (
            <div style={mobile.chatWrapper}>
              {/* Chat selector bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexShrink: 0 }}>
                <button
                  onClick={() => { setShowChatList(v => !v); setShowNewChat(false); }}
                  style={{ flex: 1, background: '#f0f0f0', border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 13, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#333' }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    💬 {chats.find(c => c.id === activeChatId)?.name ?? 'Chat'}
                  </span>
                  <span style={{ fontSize: 10, flexShrink: 0, marginLeft: 4 }}>▾</span>
                </button>
                <button
                  onClick={() => { setShowNewChat(v => !v); setShowChatList(false); }}
                  style={{ background: '#667eea', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 13, color: 'white', cursor: 'pointer', fontWeight: 'bold', flexShrink: 0 }}
                >
                  + New
                </button>
              </div>
              {showChatList && (
                <div style={{ flexShrink: 0, marginBottom: 8, background: '#fafafa', borderRadius: 8, border: '1px solid #eee', overflow: 'hidden' }}>
                  {chats.map(chat => (
                    <div key={chat.id} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #f0f0f0', background: activeChatId === chat.id ? '#eff2ff' : 'transparent' }}>
                      {renamingId === chat.id ? (
                        <>
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleRename(chat.id);
                              if (e.key === 'Escape') setRenamingId(null);
                            }}
                            style={{ flex: 1, padding: '7px 8px', border: 'none', background: 'transparent', fontSize: 13, outline: 'none', color: '#333' }}
                          />
                          <button onClick={() => handleRename(chat.id)} style={{ background: 'none', border: 'none', color: '#667eea', fontSize: 14, padding: '4px 8px', cursor: 'pointer', fontWeight: 'bold' }}>✓</button>
                          <button onClick={() => setRenamingId(null)} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 14, padding: '4px 10px 4px 0', cursor: 'pointer' }}>✕</button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => { setActiveChatId(chat.id); setShowChatList(false); }}
                            style={{ flex: 1, padding: '9px 4px 9px 12px', border: 'none', background: 'transparent', color: activeChatId === chat.id ? '#667eea' : '#333', fontSize: 13, textAlign: 'left', cursor: 'pointer', fontWeight: activeChatId === chat.id ? '600' : 'normal' }}
                          >
                            💬 {chat.name}
                          </button>
                          <button
                            onClick={() => { setRenamingId(chat.id); setRenameValue(chat.name); }}
                            title="Rename"
                            style={{ background: 'none', border: 'none', color: '#bbb', fontSize: 13, padding: '4px 10px 4px 0', cursor: 'pointer', flexShrink: 0 }}
                          >
                            ✏️
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {showNewChat && (
                <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexShrink: 0 }}>
                  <input
                    autoFocus
                    value={newChatName}
                    onChange={e => setNewChatName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleCreateChat();
                      if (e.key === 'Escape') { setShowNewChat(false); setNewChatName(''); }
                    }}
                    placeholder="Chat name..."
                    style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, outline: 'none' }}
                  />
                  <button onClick={handleCreateChat} style={{ background: '#667eea', border: 'none', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 13, color: 'white', fontWeight: 'bold' }}>✓</button>
                  <button onClick={() => { setShowNewChat(false); setNewChatName(''); }} style={{ background: '#eee', border: 'none', borderRadius: 8, padding: '7px 10px', cursor: 'pointer', fontSize: 13, color: '#666' }}>✕</button>
                </div>
              )}
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                {user && activeChatId && (
                  <ChatBox
                    key={activeChatId}
                    userId={user.id}
                    chatId={activeChatId}
                    isUploading={false}
                    tokens={user.tokens ?? 0}
                    onTokenUsed={(remaining) => setUser(u => ({ ...u, tokens: remaining }))}
                  />
                )}
              </div>
            </div>
          )}
          {activeTab === 'tokens' && (
            <div style={mobile.filesWrapper}>
              {user && <TokensPanel tokens={user.tokens ?? 0} plan={user.plan ?? 'free'} />}
            </div>
          )}
          {activeTab === 'pricing' && (
            <div style={mobile.filesWrapper}>
              <PricingPage currentPlan={user?.plan ?? 'free'} />
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
            onClick={() => setActiveTab('tokens')}
            style={{ ...mobile.tab, ...(activeTab === 'tokens' ? mobile.tabActive : {}) }}
          >
            <span style={mobile.tabIcon}>🪙</span>
            <span style={mobile.tabLabel}>Tokens</span>
          </button>
          <button
            onClick={() => setActiveTab('pricing')}
            style={{ ...mobile.tab, ...(activeTab === 'pricing' ? mobile.tabActive : {}) }}
          >
            <span style={mobile.tabIcon}>💎</span>
            <span style={mobile.tabLabel}>Plans</span>
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
            <span style={styles.pageLabel}>User Page</span>
          </div>
          {user && (
            <div style={styles.userInfo}>
              <div style={styles.avatar}>
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p style={styles.userName}>{user.name}</p>
                <p style={styles.userEmail}>{user.email}</p>
                <span style={planBadgeStyle(user.plan ?? 'free')}>
                  {(user.plan ?? 'free').charAt(0).toUpperCase() + (user.plan ?? 'free').slice(1)} Plan
                </span>
              </div>
            </div>
          )}

          <nav style={styles.nav}>
            {/* Conversations */}
            <div style={{ marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showConversations ? 6 : 0 }}>
                <button
                  onClick={() => setShowConversations(v => !v)}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  <span style={{ fontSize: 10 }}>{showConversations ? '▾' : '▸'}</span>
                  Conversations
                </button>
                {showConversations && (
                  <button
                    onClick={() => { setShowNewChat(v => !v); setNewChatName(''); }}
                    style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, color: 'white', fontSize: 12, padding: '3px 8px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    + New
                  </button>
                )}
              </div>
              {showConversations && (
                <>
                {showNewChat && (
                <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                  <input
                    autoFocus
                    value={newChatName}
                    onChange={e => setNewChatName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleCreateChat();
                      if (e.key === 'Escape') { setShowNewChat(false); setNewChatName(''); }
                    }}
                    placeholder="Chat name..."
                    style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: 'none', fontSize: 13, outline: 'none', color: '#333' }}
                  />
                  <button onClick={handleCreateChat} style={{ background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', color: '#667eea', fontWeight: 'bold', fontSize: 13 }}>✓</button>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 220, overflowY: 'auto' }}>
                {chats.map(chat => (
                  <div
                    key={chat.id}
                    style={{ display: 'flex', alignItems: 'center', borderRadius: 8, background: activeChatId === chat.id && activeTab === 'chat' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.07)' }}
                  >
                    {renamingId === chat.id ? (
                      <>
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleRename(chat.id);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: 'none', fontSize: 13, outline: 'none', color: '#333', background: 'rgba(255,255,255,0.9)', margin: '4px 0 4px 6px' }}
                        />
                        <button onClick={() => handleRename(chat.id)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.9)', fontSize: 14, padding: '4px 8px', cursor: 'pointer' }}>✓</button>
                        <button onClick={() => setRenamingId(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 14, padding: '4px 8px 4px 0', cursor: 'pointer' }}>✕</button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => { setActiveChatId(chat.id); setActiveTab('chat'); }}
                          style={{ ...styles.navBtn, flex: 1, background: 'transparent', fontSize: 13, padding: '9px 4px 9px 12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: activeChatId === chat.id ? 'bold' : 'normal' }}
                        >
                          💬 {chat.name}
                        </button>
                        <button
                          onClick={() => { setRenamingId(chat.id); setRenameValue(chat.name); }}
                          title="Rename"
                          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)', fontSize: 13, padding: '4px 10px 4px 4px', cursor: 'pointer', flexShrink: 0, lineHeight: 1 }}
                        >
                          ✏️
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
                </>
              )}
            </div>

            <button
              onClick={() => setActiveTab('tokens')}
              style={{ ...styles.navBtn, background: activeTab === 'tokens' ? 'rgba(255,255,255,0.2)' : 'transparent' }}
            >
              🪙 Tokens
            </button>
            <button
              onClick={() => setActiveTab('pricing')}
              style={{ ...styles.navBtn, background: activeTab === 'pricing' ? 'rgba(255,255,255,0.2)' : 'transparent' }}
            >
              💎 Plans & Pricing
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
            <h2 style={styles.sectionTitle}>💬 {chats.find(c => c.id === activeChatId)?.name ?? 'Chat'}</h2>
            <div style={styles.chatContainer}>
              {user && activeChatId && (
                <ChatBox
                  key={activeChatId}
                  userId={user.id}
                  chatId={activeChatId}
                  isUploading={false}
                  tokens={user.tokens ?? 0}
                  onTokenUsed={(remaining) => setUser(u => ({ ...u, tokens: remaining }))}
                />
              )}
            </div>
          </div>
        )}
        {activeTab === 'tokens' && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>🪙 My Tokens</h2>
            {user && <TokensPanel tokens={user.tokens ?? 0} plan={user.plan ?? 'free'} />}
          </div>
        )}
        {activeTab === 'pricing' && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>💎 Plans & Pricing</h2>
            <PricingPage currentPlan={user?.plan ?? 'free'} />
          </div>
        )}
      </div>
    </div>
  );
}

function TokensPanel({ tokens, plan = 'free' }) {
  const planInfo = PLANS.find(p => p.key === plan) ?? PLANS[0];
  const isUnlimited = planInfo.unlimited;
  const planGrant = planInfo.tokens ?? 0;
  const used = isUnlimited ? 0 : Math.max(0, planGrant - tokens);
  const pct = isUnlimited ? 100 : Math.max(0, Math.min(100, (tokens / planGrant) * 100));
  const barColor = isUnlimited ? '#48bb78' : pct > 50 ? '#48bb78' : pct > 20 ? '#ed8936' : '#e53e3e';

  return (
    <div style={tp.wrap}>
      <div style={tp.balanceCard}>
        <div style={tp.balanceLabel}>Available Tokens</div>
        <div style={{ ...tp.balanceNum, color: barColor }}>
          {isUnlimited ? '∞' : tokens}
        </div>
        {!isUnlimited && (
          <>
            <div style={tp.barTrack}>
              <div style={{ ...tp.barFill, width: `${pct}%`, background: barColor }} />
            </div>
            <div style={tp.barMeta}>
              <span>{used} used</span>
              <span>{tokens} remaining</span>
            </div>
          </>
        )}
        {isUnlimited && (
          <div style={{ fontSize: 13, color: '#48bb78', marginTop: 8, fontWeight: '600' }}>
            Unlimited — no monthly cap
          </div>
        )}
      </div>

      <div style={tp.infoGrid}>
        <div style={tp.infoCard}>
          <div style={tp.infoIcon}>🎁</div>
          <div style={tp.infoTitle}>{planInfo.name} Plan</div>
          <div style={tp.infoValue}>{isUnlimited ? 'Unlimited' : `${planGrant.toLocaleString()} tokens`}</div>
          <div style={tp.infoDesc}>Included with your current plan</div>
        </div>
        <div style={tp.infoCard}>
          <div style={tp.infoIcon}>💬</div>
          <div style={tp.infoTitle}>Per Message</div>
          <div style={tp.infoValue}>1 token</div>
          <div style={tp.infoDesc}>Each chat message costs 1 token</div>
        </div>
        <div style={tp.infoCard}>
          <div style={tp.infoIcon}>📦</div>
          <div style={tp.infoTitle}>Need More?</div>
          <div style={tp.infoValue}>Update the plan</div>
          <div style={tp.infoDesc}>Contact your owner to upgrade to a higher plan</div>
        </div>
      </div>
    </div>
  );
}

const PLANS = [
  {
    key: 'free',
    name: 'Free',
    price: 0,
    tokens: 100,
    unlimited: false,
    reset: 'monthly',
    color: '#667eea',
    popular: false,
    features: [
      '100 tokens per month',
      'Tokens reset on the 1st of each month',
      'Access to all documents',
      'Multilingual support',
    ],
  },
  {
    key: 'basic',
    name: 'Basic',
    price: 20,
    tokens: 500,
    unlimited: false,
    reset: 'monthly',
    color: '#38b2ac',
    popular: true,
    features: [
      '500 tokens per month',
      'Tokens reset on the 1st of each month',
      'Access to all documents',
      'Multilingual support',
      'Priority support',
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    price: 80,
    tokens: null,
    unlimited: true,
    reset: null,
    color: '#764ba2',
    popular: false,
    features: [
      'Unlimited tokens',
      'No monthly cap',
      'Access to all documents',
      'Multilingual support',
      'Priority support',
      'Dedicated assistance',
    ],
  },
];

function PricingPage({ currentPlan = 'free' }) {
  return (
    <div style={pp.wrap}>
      <p style={pp.subtitle}>
        Choose the plan that fits your needs. Tokens reset at the beginning of every month.
        Contact your owner to upgrade.
      </p>
      <div style={pp.grid}>
        {PLANS.map(plan => {
          const isCurrent = plan.key === currentPlan;
          return (
            <div
              key={plan.key}
              style={{
                ...pp.card,
                borderColor: isCurrent ? plan.color : plan.popular ? plan.color : '#e8e8e8',
                borderWidth: isCurrent || plan.popular ? 2 : 1,
                boxShadow: isCurrent ? `0 4px 24px ${plan.color}33` : pp.card.boxShadow,
              }}
            >
              {isCurrent && (
                <div style={{ ...pp.popularBadge, background: plan.color }}>
                  Your Plan
                </div>
              )}
              {!isCurrent && plan.popular && (
                <div style={{ ...pp.popularBadge, background: plan.color }}>
                  Most Popular
                </div>
              )}
              <div style={{ ...pp.planIcon, background: plan.color + '18', color: plan.color }}>
                {plan.key === 'free' ? '🌱' : plan.key === 'basic' ? '⚡' : '🚀'}
              </div>
              <h3 style={{ ...pp.planName, color: plan.color }}>{plan.name}</h3>
              <div style={pp.priceRow}>
                {plan.price === 0 ? (
                  <span style={pp.priceAmount}>Free</span>
                ) : (
                  <>
                    <span style={pp.priceCurrency}>$</span>
                    <span style={pp.priceAmount}>{plan.price}</span>
                    <span style={pp.pricePeriod}>/mo</span>
                  </>
                )}
              </div>
              <div style={pp.tokenRow}>
                <span style={{ ...pp.tokenBadge, background: plan.color + '18', color: plan.color }}>
                  🪙 {plan.unlimited ? 'Unlimited tokens' : `${plan.tokens.toLocaleString()} tokens/month`}
                </span>
              </div>
              <ul style={pp.featureList}>
                {plan.features.map((f, i) => (
                  <li key={i} style={pp.featureItem}>
                    <span style={{ ...pp.checkIcon, color: plan.color }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                style={{
                  ...pp.ctaBtn,
                  background: isCurrent
                    ? `linear-gradient(135deg, ${plan.color}, ${plan.color}cc)`
                    : plan.popular
                      ? `linear-gradient(135deg, ${plan.color}, ${plan.color}cc)`
                      : 'white',
                  color: isCurrent || plan.popular ? 'white' : plan.color,
                  border: `1.5px solid ${plan.color}`,
                  cursor: isCurrent ? 'default' : 'pointer',
                }}
              >
                {isCurrent ? `✓ Your Current Plan` : plan.price === 0 ? 'Downgrade to Free' : `Upgrade to ${plan.name}`}
              </button>
            </div>
          );
        })}
      </div>
      <p style={pp.note}>
        To upgrade your plan, contact your owner. Tokens are deducted per message sent.
      </p>
    </div>
  );
}

const PLAN_BADGE_COLORS = {
  free:  { background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)', border: 'rgba(255,255,255,0.3)' },
  basic: { background: 'rgba(56,178,172,0.25)',  color: '#81e6d9',              border: 'rgba(56,178,172,0.5)'  },
  pro:   { background: 'rgba(118,75,162,0.35)',  color: '#d6bcfa',              border: 'rgba(118,75,162,0.6)'  },
};

const planBadgeStyle = (plan) => {
  const c = PLAN_BADGE_COLORS[plan] ?? PLAN_BADGE_COLORS.free;
  return {
    display: 'inline-block',
    marginTop: 4,
    padding: '2px 8px',
    borderRadius: 20,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    background: c.background,
    color: c.color,
    border: `1px solid ${c.border}`,
  };
};

const pp = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    maxWidth: 900,
    width: '100%',
  },
  subtitle: {
    margin: 0,
    color: '#666',
    fontSize: 15,
    lineHeight: 1.6,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 20,
    alignItems: 'start',
  },
  card: {
    background: 'white',
    borderRadius: 16,
    padding: '28px 24px 24px',
    boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
    border: '1px solid #e8e8e8',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    position: 'relative',
    overflow: 'hidden',
  },
  popularBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    padding: '4px 14px',
    borderBottomLeftRadius: 10,
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  planIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 22,
    marginBottom: 14,
  },
  planName: {
    margin: '0 0 8px 0',
    fontSize: 20,
    fontWeight: '800',
  },
  priceRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 2,
    marginBottom: 14,
  },
  priceCurrency: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginTop: 4,
  },
  priceAmount: {
    fontSize: 42,
    fontWeight: '800',
    color: '#1a1a2e',
    lineHeight: 1,
  },
  pricePeriod: {
    fontSize: 14,
    color: '#999',
    marginLeft: 2,
  },
  tokenRow: {
    marginBottom: 20,
  },
  tokenBadge: {
    display: 'inline-block',
    padding: '5px 12px',
    borderRadius: 20,
    fontSize: 13,
    fontWeight: '600',
  },
  featureList: {
    listStyle: 'none',
    margin: '0 0 24px 0',
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    flex: 1,
  },
  featureItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    fontSize: 13,
    color: '#444',
    lineHeight: 1.4,
  },
  checkIcon: {
    fontWeight: '800',
    fontSize: 14,
    flexShrink: 0,
    marginTop: 1,
  },
  ctaBtn: {
    width: '100%',
    padding: '12px',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: '700',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'opacity 0.15s',
  },
  note: {
    margin: 0,
    color: '#aaa',
    fontSize: 13,
    textAlign: 'center',
  },
};

const tp = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 640 },
  balanceCard: {
    background: 'white',
    borderRadius: 16,
    padding: '28px 28px 20px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  },
  balanceLabel: { fontSize: 13, color: '#888', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 },
  balanceNum: { fontSize: 56, fontWeight: 'bold', lineHeight: 1, marginBottom: 20 },
  barTrack: { height: 10, background: '#f0f0f0', borderRadius: 99, overflow: 'hidden', marginBottom: 8 },
  barFill: { height: '100%', borderRadius: 99, transition: 'width 0.4s ease' },
  barMeta: { display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#aaa' },
  infoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 },
  infoCard: {
    background: 'white',
    borderRadius: 12,
    padding: '20px 16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    textAlign: 'center',
  },
  infoIcon: { fontSize: 28, marginBottom: 8 },
  infoTitle: { fontSize: 12, fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 },
  infoValue: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 6 },
  infoDesc: { fontSize: 12, color: '#aaa', lineHeight: 1.4 },
};

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
    padding: '16px 14px',
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
  tabIcon: { fontSize: 22, lineHeight: 1 },
  tabLabel: { fontSize: 11, fontWeight: 'bold' },
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
