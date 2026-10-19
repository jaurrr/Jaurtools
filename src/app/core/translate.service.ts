import { Injectable, signal } from '@angular/core';

export type Lang = 'en' | 'hi' | 'ar';
export type Theme = 'light' | 'dark';

const LANG_STORAGE_KEY = 'jt-lang';
const THEME_STORAGE_KEY = 'jt-theme';

const dictCache = new Map<Lang, Record<string, unknown>>();
const dictPromises = new Map<Lang, Promise<Record<string, unknown>>>();

function loadDict(lang: Lang): Promise<Record<string, unknown>> {
  const cached = dictCache.get(lang);
  if (cached) return Promise.resolve(cached);
  let pending = dictPromises.get(lang);
  if (!pending) {
    pending = import(`../i18n/${lang}.json`).then((mod) => {
      const dict = (mod.default ?? mod) as Record<string, unknown>;
      dictCache.set(lang, dict);
      return dict;
    });
    dictPromises.set(lang, pending);
  }
  return pending;
}

export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    return saved === 'hi' || saved === 'ar' ? saved : 'en';
  } catch {
    return 'en';
  }
}

export function loadInitialDict(): () => Promise<void> {
  return () => loadDict(initialLang()).then(() => undefined);
}

@Injectable({ providedIn: 'root' })
export class TranslateService {
  readonly lang = signal<Lang>('en');
  readonly theme = signal<Theme>('light');

  t(key: string): any {
    return this.lookup(this.lang(), key) ?? this.lookup('en', key) ?? key;
  }

  async setLang(next: Lang): Promise<void> {
    await loadDict(next);
    this.lang.set(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      /* storage unavailable */
    }
    document.documentElement.lang = next;
    document.documentElement.dir = next === 'ar' ? 'rtl' : 'ltr';
  }

  toggleTheme(): void {
    this.setTheme(this.theme() === 'light' ? 'dark' : 'light');
  }

  setTheme(next: Theme): void {
    this.theme.set(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* storage unavailable */
    }
    document.documentElement.dataset.theme = next;
  }

  init(): void {
    const lang = initialLang();
    this.lang.set(lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';

    let theme: Theme = 'light';
    try {
      theme = localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
    } catch {
      /* storage unavailable */
    }
    this.setTheme(theme);
  }

  private lookup(lang: Lang, key: string): unknown {
    const dict = dictCache.get(lang);
    if (!dict) return null;
    const value = key
      .split('.')
      .reduce<unknown>(
        (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
        dict,
      );
    return value === undefined ? null : value;
  }
}
