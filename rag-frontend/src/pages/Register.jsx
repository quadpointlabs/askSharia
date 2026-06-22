import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { register } from '../services/api';
import chatIcon from '../assets/balance.jpg';

const COUNTRY_CODES = [
  { code: '+93',  label: 'Afghanistan' },
  { code: '+355', label: 'Albania' },
  { code: '+213', label: 'Algeria' },
  { code: '+376', label: 'Andorra' },
  { code: '+244', label: 'Angola' },
  { code: '+54',  label: 'Argentina' },
  { code: '+374', label: 'Armenia' },
  { code: '+61',  label: 'Australia' },
  { code: '+43',  label: 'Austria' },
  { code: '+994', label: 'Azerbaijan' },
  { code: '+973', label: 'Bahrain' },
  { code: '+880', label: 'Bangladesh' },
  { code: '+32',  label: 'Belgium' },
  { code: '+501', label: 'Belize' },
  { code: '+229', label: 'Benin' },
  { code: '+975', label: 'Bhutan' },
  { code: '+591', label: 'Bolivia' },
  { code: '+387', label: 'Bosnia and Herzegovina' },
  { code: '+267', label: 'Botswana' },
  { code: '+55',  label: 'Brazil' },
  { code: '+673', label: 'Brunei' },
  { code: '+359', label: 'Bulgaria' },
  { code: '+226', label: 'Burkina Faso' },
  { code: '+257', label: 'Burundi' },
  { code: '+855', label: 'Cambodia' },
  { code: '+237', label: 'Cameroon' },
  { code: '+1',   label: 'Canada / USA' },
  { code: '+238', label: 'Cape Verde' },
  { code: '+236', label: 'Central African Republic' },
  { code: '+235', label: 'Chad' },
  { code: '+56',  label: 'Chile' },
  { code: '+86',  label: 'China' },
  { code: '+57',  label: 'Colombia' },
  { code: '+269', label: 'Comoros' },
  { code: '+242', label: 'Congo' },
  { code: '+506', label: 'Costa Rica' },
  { code: '+385', label: 'Croatia' },
  { code: '+53',  label: 'Cuba' },
  { code: '+357', label: 'Cyprus' },
  { code: '+420', label: 'Czech Republic' },
  { code: '+45',  label: 'Denmark' },
  { code: '+253', label: 'Djibouti' },
  { code: '+593', label: 'Ecuador' },
  { code: '+20',  label: 'Egypt' },
  { code: '+503', label: 'El Salvador' },
  { code: '+240', label: 'Equatorial Guinea' },
  { code: '+291', label: 'Eritrea' },
  { code: '+372', label: 'Estonia' },
  { code: '+251', label: 'Ethiopia' },
  { code: '+679', label: 'Fiji' },
  { code: '+358', label: 'Finland' },
  { code: '+33',  label: 'France' },
  { code: '+241', label: 'Gabon' },
  { code: '+220', label: 'Gambia' },
  { code: '+995', label: 'Georgia' },
  { code: '+49',  label: 'Germany' },
  { code: '+233', label: 'Ghana' },
  { code: '+30',  label: 'Greece' },
  { code: '+502', label: 'Guatemala' },
  { code: '+224', label: 'Guinea' },
  { code: '+245', label: 'Guinea-Bissau' },
  { code: '+592', label: 'Guyana' },
  { code: '+509', label: 'Haiti' },
  { code: '+504', label: 'Honduras' },
  { code: '+852', label: 'Hong Kong' },
  { code: '+36',  label: 'Hungary' },
  { code: '+354', label: 'Iceland' },
  { code: '+91',  label: 'India' },
  { code: '+62',  label: 'Indonesia' },
  { code: '+98',  label: 'Iran' },
  { code: '+964', label: 'Iraq' },
  { code: '+353', label: 'Ireland' },
  { code: '+972', label: 'Israel' },
  { code: '+39',  label: 'Italy' },
  { code: '+225', label: 'Ivory Coast' },
  { code: '+1876',label: 'Jamaica' },
  { code: '+81',  label: 'Japan' },
  { code: '+962', label: 'Jordan' },
  { code: '+7',   label: 'Kazakhstan / Russia' },
  { code: '+254', label: 'Kenya' },
  { code: '+965', label: 'Kuwait' },
  { code: '+996', label: 'Kyrgyzstan' },
  { code: '+856', label: 'Laos' },
  { code: '+371', label: 'Latvia' },
  { code: '+961', label: 'Lebanon' },
  { code: '+266', label: 'Lesotho' },
  { code: '+231', label: 'Liberia' },
  { code: '+218', label: 'Libya' },
  { code: '+423', label: 'Liechtenstein' },
  { code: '+370', label: 'Lithuania' },
  { code: '+352', label: 'Luxembourg' },
  { code: '+853', label: 'Macau' },
  { code: '+261', label: 'Madagascar' },
  { code: '+265', label: 'Malawi' },
  { code: '+60',  label: 'Malaysia' },
  { code: '+960', label: 'Maldives' },
  { code: '+223', label: 'Mali' },
  { code: '+356', label: 'Malta' },
  { code: '+222', label: 'Mauritania' },
  { code: '+230', label: 'Mauritius' },
  { code: '+52',  label: 'Mexico' },
  { code: '+373', label: 'Moldova' },
  { code: '+377', label: 'Monaco' },
  { code: '+976', label: 'Mongolia' },
  { code: '+382', label: 'Montenegro' },
  { code: '+212', label: 'Morocco' },
  { code: '+258', label: 'Mozambique' },
  { code: '+95',  label: 'Myanmar' },
  { code: '+264', label: 'Namibia' },
  { code: '+977', label: 'Nepal' },
  { code: '+31',  label: 'Netherlands' },
  { code: '+64',  label: 'New Zealand' },
  { code: '+505', label: 'Nicaragua' },
  { code: '+227', label: 'Niger' },
  { code: '+234', label: 'Nigeria' },
  { code: '+389', label: 'North Macedonia' },
  { code: '+47',  label: 'Norway' },
  { code: '+968', label: 'Oman' },
  { code: '+92',  label: 'Pakistan' },
  { code: '+970', label: 'Palestine' },
  { code: '+507', label: 'Panama' },
  { code: '+675', label: 'Papua New Guinea' },
  { code: '+595', label: 'Paraguay' },
  { code: '+51',  label: 'Peru' },
  { code: '+63',  label: 'Philippines' },
  { code: '+48',  label: 'Poland' },
  { code: '+351', label: 'Portugal' },
  { code: '+974', label: 'Qatar' },
  { code: '+40',  label: 'Romania' },
  { code: '+250', label: 'Rwanda' },
  { code: '+966', label: 'Saudi Arabia' },
  { code: '+221', label: 'Senegal' },
  { code: '+381', label: 'Serbia' },
  { code: '+232', label: 'Sierra Leone' },
  { code: '+65',  label: 'Singapore' },
  { code: '+421', label: 'Slovakia' },
  { code: '+386', label: 'Slovenia' },
  { code: '+252', label: 'Somalia' },
  { code: '+27',  label: 'South Africa' },
  { code: '+82',  label: 'South Korea' },
  { code: '+211', label: 'South Sudan' },
  { code: '+34',  label: 'Spain' },
  { code: '+94',  label: 'Sri Lanka' },
  { code: '+249', label: 'Sudan' },
  { code: '+597', label: 'Suriname' },
  { code: '+46',  label: 'Sweden' },
  { code: '+41',  label: 'Switzerland' },
  { code: '+963', label: 'Syria' },
  { code: '+886', label: 'Taiwan' },
  { code: '+992', label: 'Tajikistan' },
  { code: '+255', label: 'Tanzania' },
  { code: '+66',  label: 'Thailand' },
  { code: '+228', label: 'Togo' },
  { code: '+868', label: 'Trinidad and Tobago' },
  { code: '+216', label: 'Tunisia' },
  { code: '+90',  label: 'Turkey' },
  { code: '+993', label: 'Turkmenistan' },
  { code: '+256', label: 'Uganda' },
  { code: '+380', label: 'Ukraine' },
  { code: '+971', label: 'UAE' },
  { code: '+44',  label: 'United Kingdom' },
  { code: '+598', label: 'Uruguay' },
  { code: '+998', label: 'Uzbekistan' },
  { code: '+58',  label: 'Venezuela' },
  { code: '+84',  label: 'Vietnam' },
  { code: '+967', label: 'Yemen' },
  { code: '+260', label: 'Zambia' },
  { code: '+263', label: 'Zimbabwe' },
].sort((a, b) => a.label.localeCompare(b.label));

function CountryCodePicker({ value, onChange }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const searchRef = useRef(null);

  const selected = COUNTRY_CODES.find(c => c.code === value) || COUNTRY_CODES[0];
  const filtered = search
    ? COUNTRY_CODES.filter(c =>
        c.label.toLowerCase().includes(search.toLowerCase()) ||
        c.code.includes(search)
      )
    : COUNTRY_CODES;

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
  }, [open]);

  const select = (code) => { onChange(code); setOpen(false); setSearch(''); };

  return (
    <div ref={containerRef} style={pickerStyles.wrapper}>
      <button type="button" onClick={() => setOpen(o => !o)} style={pickerStyles.trigger}>
        <span>{selected.code}</span>
        <span style={pickerStyles.arrow}>▾</span>
      </button>
      {open && (
        <div style={pickerStyles.dropdown}>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search country..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={pickerStyles.search}
          />
          <ul style={pickerStyles.list}>
            {filtered.length === 0 && <li style={pickerStyles.empty}>No results</li>}
            {filtered.map(c => (
              <li
                key={c.code + c.label}
                onClick={() => select(c.code)}
                style={{ ...pickerStyles.item, ...(c.code === value ? pickerStyles.itemActive : {}) }}
              >
                <span style={pickerStyles.itemCode}>{c.code}</span>
                <span>{c.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const pickerStyles = {
  wrapper: { position: 'relative', flexShrink: 0 },
  trigger: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '12px 10px', borderRadius: 8, border: '1px solid #ddd',
    background: 'white', fontSize: 15, cursor: 'pointer',
    whiteSpace: 'nowrap', height: '100%', boxSizing: 'border-box',
  },
  arrow: { fontSize: 11, color: '#888' },
  dropdown: {
    position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 100,
    background: 'white', border: '1px solid #ddd', borderRadius: 8,
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)', width: 240, overflow: 'hidden',
  },
  search: {
    width: '100%', padding: '10px 12px', border: 'none',
    borderBottom: '1px solid #eee', fontSize: 14, outline: 'none',
    boxSizing: 'border-box',
  },
  list: { listStyle: 'none', margin: 0, padding: 0, maxHeight: 220, overflowY: 'auto' },
  item: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '9px 12px', cursor: 'pointer', fontSize: 14, color: '#333',
  },
  itemActive: { background: '#f0f0ff', fontWeight: 'bold' },
  itemCode: { color: '#667eea', fontWeight: 'bold', minWidth: 40, fontSize: 13 },
  empty: { padding: '12px', color: '#aaa', fontSize: 14, textAlign: 'center' },
};

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [countryCode, setCountryCode] = useState('+966');
  const [mobileNumber, setMobileNumber] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const mobile = mobileNumber ? `${countryCode}${mobileNumber}` : undefined;
    try {
      await register(name, email, password, mobile);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <img src={chatIcon} alt="askSharia" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', display: 'block', margin: '0 auto 12px' }} />
        <h1 style={styles.title}>Create Account</h1>
        <p style={styles.subtitle}>Join askSharia</p>

        <form onSubmit={handleRegister} style={styles.form}>
          <input
            type="text"
            placeholder="Full Name"
            value={name}
            onChange={e => setName(e.target.value)}
            style={styles.input}
            required
          />
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
          <div style={styles.phoneRow}>
            <CountryCodePicker value={countryCode} onChange={setCountryCode} />
            <input
              type="tel"
              placeholder="Mobile number"
              value={mobileNumber}
              onChange={e => setMobileNumber(e.target.value)}
              style={styles.phoneInput}
            />
          </div>
          {error && <p style={styles.error}>{error}</p>}
          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? 'Creating account...' : 'Register'}
          </button>
        </form>

        <p style={styles.linkRow}>
          Already have an account?{' '}
          <Link to="/" style={styles.inlineLink}>Login</Link>
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
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  card: {
    background: 'white',
    borderRadius: 16,
    padding: '32px 24px',
    width: '90%',
    maxWidth: 380,
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  },
  title: { textAlign: 'center', fontSize: 28, marginBottom: 8, color: '#333' },
  subtitle: { textAlign: 'center', color: '#888', marginBottom: 30 },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  input: {
    padding: '12px 16px', borderRadius: 8, border: '1px solid #ddd',
    fontSize: 16, outline: 'none',
  },
  phoneRow: { display: 'flex', gap: 8, alignItems: 'stretch' },
  phoneInput: {
    padding: '12px 16px', borderRadius: 8, border: '1px solid #ddd',
    fontSize: 16, outline: 'none', flex: 1, minWidth: 0,
  },
  button: {
    padding: '12px', borderRadius: 8, border: 'none',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white', fontSize: 16, fontWeight: 'bold', cursor: 'pointer', marginTop: 8,
  },
  error: { color: 'red', fontSize: 13, textAlign: 'center' },
  separator: { color: '#ccc', fontSize: 13 },
  linkRow: { textAlign: 'center', marginTop: 16, fontSize: 13, color: '#666' },
  inlineLink: { color: '#667eea', textDecoration: 'none', fontWeight: 'bold' },
};
