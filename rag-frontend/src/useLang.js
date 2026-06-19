import { useState } from 'react';
import translations from './i18n';

export default function useLang() {
  const [lang, setLangState] = useState(() => localStorage.getItem('lang') || 'en');
  const setLang = (l) => {
    localStorage.setItem('lang', l);
    setLangState(l);
  };
  const t = translations[lang];
  const isRTL = lang === 'ar';
  return { lang, setLang, t, isRTL };
}
