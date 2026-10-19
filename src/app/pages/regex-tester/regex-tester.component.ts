import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type Flavor = 'js' | 'python' | 'pcre';

interface ExplainToken {
  token: string;
  descKey: string;
}

interface QuickToken {
  snippet: string;
  descKey: string;
}

const SAVE_KEY = 'jt-regex-tester';
const DEFAULT_PATTERN = '\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b';
const DEFAULT_TEXT =
  'Contact us at support@jaurtools.com or sales@jaurtools.com.\nInvalid: not-an-email, also bad@domain.\nCall +91 99367 86415 for help.';

const NAMED_ESCAPES: Record<string, string> = {
  d: 'expDigit',
  D: 'expNonDigit',
  w: 'expWord',
  W: 'expNonWord',
  s: 'expSpace',
  S: 'expNonSpace',
  b: 'expBoundary',
  B: 'expNonBoundary',
};

const SIMPLE_TOKENS: Record<string, string> = {
  '.': 'expAny',
  '^': 'expStart',
  $: 'expEnd',
  '*': 'expStar',
  '+': 'expPlus',
  '?': 'expOpt',
  '|': 'expOr',
  ')': 'expGroupEnd',
};

const QUICK_TOKENS: Record<Flavor, QuickToken[]> = {
  js: [
    { snippet: '\\d', descKey: 'expDigit' },
    { snippet: '\\w', descKey: 'expWord' },
    { snippet: '\\s', descKey: 'expSpace' },
    { snippet: '.', descKey: 'expAny' },
    { snippet: '*', descKey: 'expStar' },
    { snippet: '+', descKey: 'expPlus' },
    { snippet: '?', descKey: 'expOpt' },
    { snippet: '^', descKey: 'expStart' },
    { snippet: '$', descKey: 'expEnd' },
    { snippet: '\\b', descKey: 'expBoundary' },
    { snippet: '|', descKey: 'expOr' },
    { snippet: '(...)', descKey: 'expGroup' },
    { snippet: '(?:...)', descKey: 'expNonCap' },
    { snippet: '(?<name>...)', descKey: 'expNamed' },
    { snippet: '[...]', descKey: 'expClass' },
    { snippet: '{2,4}', descKey: 'expRepeat' },
  ],
  python: [
    { snippet: '\\d', descKey: 'expDigit' },
    { snippet: '\\w', descKey: 'expWord' },
    { snippet: '\\s', descKey: 'expSpace' },
    { snippet: '.', descKey: 'expAny' },
    { snippet: '*', descKey: 'expStar' },
    { snippet: '+', descKey: 'expPlus' },
    { snippet: '?', descKey: 'expOpt' },
    { snippet: '^', descKey: 'expStart' },
    { snippet: '$', descKey: 'expEnd' },
    { snippet: '\\b', descKey: 'expBoundary' },
    { snippet: '|', descKey: 'expOr' },
    { snippet: '(...)', descKey: 'expGroup' },
    { snippet: '(?:...)', descKey: 'expNonCap' },
    { snippet: '(?P<name>...)', descKey: 'expNamed' },
    { snippet: '[^...]', descKey: 'expNegClass' },
    { snippet: '{2,4}', descKey: 'expRepeat' },
  ],
  pcre: [
    { snippet: '\\d', descKey: 'expDigit' },
    { snippet: '\\w', descKey: 'expWord' },
    { snippet: '\\s', descKey: 'expSpace' },
    { snippet: '.', descKey: 'expAny' },
    { snippet: '*', descKey: 'expStar' },
    { snippet: '+', descKey: 'expPlus' },
    { snippet: '?', descKey: 'expOpt' },
    { snippet: '^', descKey: 'expStart' },
    { snippet: '$', descKey: 'expEnd' },
    { snippet: '\\b', descKey: 'expBoundary' },
    { snippet: '|', descKey: 'expOr' },
    { snippet: '(...)', descKey: 'expGroup' },
    { snippet: '(?:...)', descKey: 'expNonCap' },
    { snippet: '(?P<name>...)', descKey: 'expNamed' },
    { snippet: '(?>...)', descKey: 'expAtomic' },
    { snippet: '{2,4}', descKey: 'expRepeat' },
  ],
};

// Constructs that exist in other flavors but not in JavaScript.
const NON_JS_CONSTRUCTS: RegExp[] = [/\(\?P</, /\(\?>/, /[*+?]\+/, /\\K/, /\\A/, /\\Z/, /\\G/, /\(\?P=/];

function explainPattern(p: string): ExplainToken[] {
  const out: ExplainToken[] = [];
  const push = (token: string, descKey: string) => {
    if (out.length < 64) out.push({ token, descKey });
  };
  let i = 0;
  let lit = '';
  const flushLit = () => {
    if (lit) {
      push(lit, 'expLiteral');
      lit = '';
    }
  };
  while (i < p.length) {
    const c = p[i];
    if (c === '\\' && i + 1 < p.length) {
      flushLit();
      const n = p[i + 1];
      push('\\' + n, NAMED_ESCAPES[n] ?? 'expEscape');
      i += 2;
      continue;
    }
    if (c === '[') {
      flushLit();
      let j = i + 1;
      if (p[j] === '^') j++;
      if (p[j] === ']') j++;
      while (j < p.length && p[j] !== ']') {
        if (p[j] === '\\') j++;
        j++;
      }
      const neg = p[i + 1] === '^';
      push(p.slice(i, Math.min(j + 1, p.length)), neg ? 'expNegClass' : 'expClass');
      i = j + 1;
      continue;
    }
    if (c === '(') {
      flushLit();
      if (p.startsWith('(?:', i)) { push('(?:', 'expNonCap'); i += 3; continue; }
      if (p.startsWith('(?=', i)) { push('(?=', 'expLookahead'); i += 3; continue; }
      if (p.startsWith('(?!', i)) { push('(?!', 'expNegLookahead'); i += 3; continue; }
      if (p.startsWith('(?<=', i)) { push('(?<=', 'expLookbehind'); i += 4; continue; }
      if (p.startsWith('(?<!', i)) { push('(?<!', 'expNegLookbehind'); i += 4; continue; }
      if (p.startsWith('(?>', i)) { push('(?>', 'expAtomic'); i += 3; continue; }
      const nm = /^\(\?<([A-Za-z][A-Za-z0-9_]*)>/.exec(p.slice(i));
      if (nm) { push('(?<' + nm[1] + '>', 'expNamed'); i += nm[0].length; continue; }
      const pn = /^\(\?P<([A-Za-z][A-Za-z0-9_]*)>/.exec(p.slice(i));
      if (pn) { push('(?P<' + pn[1] + '>', 'expNamed'); i += pn[0].length; continue; }
      push('(', 'expGroup');
      i++;
      continue;
    }
    if (c === '{') {
      const m = /^\{\d+(,\d*)?\}/.exec(p.slice(i));
      if (m) {
        flushLit();
        push(m[0], 'expRepeat');
        i += m[0].length;
        continue;
      }
    }
    const simple = SIMPLE_TOKENS[c];
    if (simple) {
      flushLit();
      push(c, simple);
      i++;
      continue;
    }
    lit += c;
    if (lit.length >= 14) flushLit();
    i++;
  }
  flushLit();
  return out;
}

@Component({
  selector: 'app-regex-tester',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './regex-tester.component.html',
  styleUrl: './regex-tester.component.scss',
})
export class RegexTesterComponent implements OnDestroy {
  readonly slug = 'regex-tester';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['url-parser', 'fake-json-generator', 'xml-formatter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly pattern = signal(DEFAULT_PATTERN);
  readonly flagI = signal(false);
  readonly flagM = signal(false);
  readonly flagS = signal(false);
  readonly flagU = signal(false);
  readonly testText = signal(DEFAULT_TEXT);
  readonly flavor = signal<Flavor>('js');
  readonly mode = signal<'test' | 'replace'>('test');
  readonly replacement = signal('$&');
  readonly restored = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;
  private saveTimer: number | null = null;

  constructor() {
    this.restoreSaved();
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    effect(() => {
      const state = {
        p: this.pattern(),
        t: this.testText(),
        f: this.flagsStr(),
        fl: this.flavor(),
        m: this.mode(),
        r: this.replacement(),
      };
      if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
      this.saveTimer = window.setTimeout(() => {
        try {
          localStorage.setItem(SAVE_KEY, JSON.stringify(state));
        } catch {
          /* storage unavailable — tool still works */
        }
      }, 600);
    });
  }

  readonly flagsStr = computed(() => {
    let f = 'g';
    if (this.flagI()) f += 'i';
    if (this.flagM()) f += 'm';
    if (this.flagS()) f += 's';
    if (this.flagU()) f += 'u';
    return f;
  });

  readonly outcome = computed((): { error: string; matches: { text: string; index: number; groups: string[] }[] } => {
    const p = this.pattern();
    if (!p) return { error: '', matches: [] };
    try {
      const re = new RegExp(p, this.flagsStr());
      const text = this.testText();
      const matches: { text: string; index: number; groups: string[] }[] = [];
      let m: RegExpExecArray | null;
      let guard = 0;
      re.lastIndex = 0;
      while ((m = re.exec(text)) !== null && guard < 200) {
        guard++;
        matches.push({ text: m[0], index: m.index, groups: m.slice(1).map((g) => g ?? '') });
        if (m[0] === '') re.lastIndex++;
      }
      return { error: '', matches };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Invalid pattern', matches: [] };
    }
  });

  readonly segments = computed((): { text: string; hit: boolean }[] => {
    const text = this.testText();
    const segs: { text: string; hit: boolean }[] = [];
    let pos = 0;
    for (const m of this.outcome().matches) {
      if (m.index > pos) segs.push({ text: text.slice(pos, m.index), hit: false });
      segs.push({ text: m.text === '' ? '(empty)' : m.text, hit: true });
      pos = m.index + m.text.length;
    }
    segs.push({ text: text.slice(pos), hit: false });
    return segs;
  });

  readonly explanation = computed<ExplainToken[]>(() => explainPattern(this.pattern()));

  readonly quickTokens = computed<QuickToken[]>(() => QUICK_TOKENS[this.flavor()]);

  readonly compatIssue = computed(() => {
    if (this.flavor() === 'js') return false;
    return NON_JS_CONSTRUCTS.some((re) => re.test(this.pattern()));
  });

  readonly replaceResult = computed(() => {
    const p = this.pattern();
    if (!p) return '';
    try {
      return this.testText().replace(new RegExp(p, this.flagsStr()), this.replacement()).slice(0, 20000);
    } catch {
      return '';
    }
  });

  readonly faqs = computed(() => {
    this.translate.lang();
    const raw = this.lookup('faqs');
    return Array.isArray(raw) ? (raw as { q: string; a: string }[]) : [];
  });

  t(key: string): string {
    this.translate.lang();
    const raw = this.lookup(key);
    return typeof raw === 'string' ? raw : '';
  }

  tc(key: string): string {
    this.translate.lang();
    const raw = (this.translate.t as unknown as (k: string) => unknown)(`common.${key}`);
    return typeof raw === 'string' ? raw : '';
  }

  list(key: string): string[] {
    this.translate.lang();
    const raw = this.lookup(key);
    return Array.isArray(raw) ? (raw as string[]) : [];
  }

  relatedName(slug: string): string {
    this.translate.lang();
    const raw = (this.translate.t as unknown as (k: string) => unknown)(`${slug}.name`);
    return typeof raw === 'string' ? raw : slug;
  }

  setPattern(v: string): void {
    this.pattern.set(v.slice(0, 1000));
  }

  setTestText(v: string): void {
    this.testText.set(v.slice(0, 20000));
  }

  setFlavor(f: Flavor): void {
    this.flavor.set(f);
  }

  setMode(m: 'test' | 'replace'): void {
    this.mode.set(m);
  }

  toggleFlag(which: 'i' | 'm' | 's' | 'u'): void {
    if (which === 'i') this.flagI.update((v) => !v);
    if (which === 'm') this.flagM.update((v) => !v);
    if (which === 's') this.flagS.update((v) => !v);
    if (which === 'u') this.flagU.update((v) => !v);
  }

  insertToken(snippet: string): void {
    this.setPattern(this.pattern() + snippet);
  }

  loadSample(): void {
    this.pattern.set(DEFAULT_PATTERN);
    this.testText.set(DEFAULT_TEXT);
    this.flagI.set(false);
    this.flagM.set(false);
    this.flagS.set(false);
    this.flagU.set(false);
    this.flavor.set('js');
    this.mode.set('test');
    this.replacement.set('$&');
    this.restored.set(false);
  }

  exportJson(): void {
    const data = JSON.stringify(
      this.outcome().matches.map((m) => ({ match: m.text, index: m.index, groups: m.groups })),
      null,
      2,
    );
    this.downloadText(data, 'regex-matches.json', 'application/json');
  }

  exportCsv(): void {
    const rows: string[][] = [['match', 'index', 'groups']];
    for (const m of this.outcome().matches) rows.push([m.text, String(m.index), m.groups.join('; ')]);
    const csv =
      '\uFEFF' +
      rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n');
    this.downloadText(csv, 'regex-matches.csv', 'text/csv;charset=utf-8');
  }

  ngOnDestroy() {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private restoreSaved(): void {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as {
        p?: string;
        t?: string;
        f?: string;
        fl?: Flavor;
        m?: 'test' | 'replace';
        r?: string;
      };
      if (typeof s.p === 'string') this.pattern.set(s.p.slice(0, 1000));
      if (typeof s.t === 'string') this.testText.set(s.t.slice(0, 20000));
      if (typeof s.f === 'string') {
        this.flagI.set(s.f.includes('i'));
        this.flagM.set(s.f.includes('m'));
        this.flagS.set(s.f.includes('s'));
        this.flagU.set(s.f.includes('u'));
      }
      if (s.fl === 'js' || s.fl === 'python' || s.fl === 'pcre') this.flavor.set(s.fl);
      if (s.m === 'test' || s.m === 'replace') this.mode.set(s.m);
      if (typeof s.r === 'string') this.replacement.set(s.r.slice(0, 500));
      this.restored.set(true);
    } catch {
      /* corrupted save — start fresh */
    }
  }

  private downloadText(content: string, filename: string, mime: string): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = filename;
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }

  private clampNum(v: number, min: number, max: number): number {
    if (!Number.isFinite(v)) return min;
    return Math.min(max, Math.max(min, Math.round(v * 100) / 100));
  }

  private locale(): string {
    const lang = this.translate.lang();
    return lang === 'ar' ? 'ar-SA' : lang === 'hi' ? 'hi-IN' : 'en-IN';
  }

  private updateSeo() {
    const lang = this.translate.lang();
    this.pageTitle.setTitle(this.t('metaTitle'));
    this.meta.updateTag({ name: 'description', content: this.t('metaDescription') });
    this.meta.updateTag({ name: 'keywords', content: this.t('keywords') });
    this.setLink('canonical', `https://jaurtools.com/${lang}/${this.slug}`);
    for (const l of ['en', 'hi', 'ar']) {
      this.setLink('alternate', `https://jaurtools.com/${l}/${this.slug}`, l);
    }
  }

  private setLink(rel: string, href: string, hreflang?: string) {
    const head = this.document.head;
    const selector = hreflang ? `link[rel="${rel}"][hreflang="${hreflang}"]` : `link[rel="${rel}"]:not([hreflang])`;
    let el = head.querySelector<HTMLLinkElement>(selector);
    if (!el) {
      el = this.document.createElement('link');
      el.rel = rel;
      if (hreflang) el.hreflang = hreflang;
      head.appendChild(el);
    }
    el.href = href;
  }

  private refreshJsonLd() {
    this.jsonLdEl?.remove();
    const mainEntity = this.faqs().map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    }));
    const json = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity,
    }).replace(/</g, '\\u003c');
    const el = this.document.createElement('script');
    el.type = 'application/ld+json';
    el.textContent = json;
    this.document.head.appendChild(el);
    this.jsonLdEl = el;
  }
}
