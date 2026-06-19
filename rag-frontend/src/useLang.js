import { useState } from 'react';
import translations from './i18n';

export default function useLang(storageKey = 'lang') {
  const [lang, setLangState] = useState(() => localStorage.getItem(storageKey) || 'en');
  const setLang = (l) => {
    localStorage.setItem(storageKey, l);
    setLangState(l);
  };
  const t = translations[lang];
  const isRTL = lang === 'ar';
  return { lang, setLang, t, isRTL };
}
