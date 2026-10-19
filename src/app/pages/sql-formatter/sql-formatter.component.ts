import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const SAMPLE_SQL = 'select id, name, email, created_at from users where active = 1 and city = \'Mumbai\' order by created_at desc limit 10;';

@Component({
  selector: 'app-sql-formatter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './sql-formatter.component.html',
  styleUrl: './sql-formatter.component.scss',
})
export class SqlFormatterComponent implements OnDestroy {
  readonly slug = 'sql-formatter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['xml-formatter', 'yaml-formatter', 'fake-json-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  private jsonLdEl: HTMLScriptElement | null = null;

  readonly restored = signal(false);

  private saveTimer: number | null = null;

  constructor() {
    const saved = this.readSaved();
    if (saved !== null) {
      this.sql.set(saved);
      this.restored.set(true);
    }
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    effect(() => {
      const v = this.sql();
      if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
      this.saveTimer = window.setTimeout(() => {
        try {
          localStorage.setItem('jt-sql-formatter-input', v);
        } catch {
          /* storage unavailable — tool still works */
        }
      }, 700);
    });
  }

  readonly sql = signal(SAMPLE_SQL);
  readonly dialect = signal<'standard' | 'mysql' | 'postgres' | 'tsql' | 'sqlite'>('standard');
  readonly upperKeywords = signal(true);
  readonly copied = signal(false);

  setSql(v: string): void { this.sql.set(v.slice(0, 30000)); this.restored.set(false); }
  setDialect(d: 'standard' | 'mysql' | 'postgres' | 'tsql' | 'sqlite'): void { this.dialect.set(d); }
  toggleUpper(): void { this.upperKeywords.update((v) => !v); }

  readonly formatted = computed(() => this.formatSql(this.sql(), this.upperKeywords()));

  copySql(): void {
    if (!navigator.clipboard) return;
    navigator.clipboard
      .writeText(this.formatted())
      .then(() => {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 1600);
      })
      .catch(() => undefined);
  }

  private readonly keywords = new Set([
    'SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET',
    'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS', 'ON', 'USING',
    'UNION', 'ALL', 'DISTINCT', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET',
    'DELETE', 'CREATE', 'TABLE', 'ALTER', 'DROP', 'AND', 'OR', 'NOT', 'IN',
    'AS', 'ASC', 'DESC', 'BETWEEN', 'LIKE', 'IS', 'NULL', 'EXISTS', 'CASE',
    'WHEN', 'THEN', 'ELSE', 'END', 'TOP', 'FETCH', 'NEXT', 'ROWS', 'ONLY',
  ]);

  private readonly clauseBreak = new Set([
    'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET',
    'UNION', 'INSERT', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'ON',
  ]);

  private formatSql(src: string, upper: boolean): string {
    const tokens = this.tokenize(src);
    const lines: string[] = [];
    let depth = 0;
    let extraIndent = '';
    let current = '';
    const ind = () => '  '.repeat(depth) + extraIndent;
    const flush = () => {
      if (current.trim()) lines.push(ind() + current.trimEnd());
      current = '';
    };
    const isKw = (t: string) => this.keywords.has(t.toUpperCase());
    const parenNewline: boolean[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      const up = tok.toUpperCase();
      if (tok === '(') {
        const prev = tokens[i - 1]?.toUpperCase();
        const startsLine = !!prev && (isKw(prev) || prev === ',');
        parenNewline.push(startsLine);
        if (startsLine) {
          flush();
          extraIndent = '';
          depth++;
          lines.push('  '.repeat(depth) + '(');
        } else {
          current = current.trimEnd() + (current.trim() ? ' ' : '') + '(';
        }
        continue;
      }
      if (tok === ')') {
        const wasNewline = parenNewline.pop() ?? false;
        if (wasNewline) {
          flush();
          extraIndent = '';
          depth = Math.max(0, depth - 1);
          current = '  '.repeat(depth) + ')';
        } else {
          current = current.trimEnd() + ') ';
        }
        continue;
      }
      if (tok === ',') {
        current = current.trimEnd() + ',';
        if (parenNewline.length > 0) {
          current += ' ';
        } else {
          flush();
          extraIndent = '  ';
        }
        continue;
      }
      if (tok === ';') {
        current = current.trimEnd() + ';';
        flush();
        extraIndent = '';
        continue;
      }
      if (isKw(up)) {
        const two = up + ' ' + (tokens[i + 1]?.toUpperCase() ?? '');
        const phrase = two === 'GROUP BY' || two === 'ORDER BY' ? two : up;
        if (phrase !== up) i++;
        const word = upper ? phrase : phrase.toLowerCase();
        if (this.clauseBreak.has(phrase)) {
          flush();
          extraIndent = '';
          current = '  '.repeat(depth) + word + ' ';
          continue;
        }
        if (phrase === 'AND' || phrase === 'OR') {
          flush();
          extraIndent = '';
          current = '  '.repeat(depth) + '  ' + word + ' ';
          continue;
        }
        current += word + ' ';
        continue;
      }
      current += tok + ' ';
    }
    flush();
    return lines.join('\n').replace(/\n{3,}/g, '\n\n');
  }

  private tokenize(src: string): string[] {
    const tokens: string[] = [];
    let i = 0;
    let buf = '';
    const pushBuf = () => {
      const t = buf.trim();
      if (t) tokens.push(t);
      buf = '';
    };
    while (i < src.length) {
      const c = src[i];
      const two = src.slice(i, i + 2);
      if (two === '--') {
        pushBuf();
        let j = i;
        while (j < src.length && src[j] !== '\n') j++;
        tokens.push(src.slice(i, j));
        i = j;
        continue;
      }
      if (two === '/*') {
        pushBuf();
        const end = src.indexOf('*/', i + 2);
        const j = end === -1 ? src.length : end + 2;
        tokens.push(src.slice(i, j));
        i = j;
        continue;
      }
      if (c === "'" || c === '"' || c === '`') {
        pushBuf();
        let j = i + 1;
        while (j < src.length) {
          if (src[j] === c && src[j + 1] === c) { j += 2; continue; }
          if (src[j] === c) break;
          j++;
        }
        tokens.push(src.slice(i, j + 1));
        i = j + 1;
        continue;
      }
      if (c === '(' || c === ')' || c === ',' || c === ';') {
        pushBuf();
        tokens.push(c);
        i++;
        continue;
      }
      if (/\s/.test(c)) {
        pushBuf();
        i++;
        continue;
      }
      buf += c;
      i++;
    }
    pushBuf();
    return tokens;
  }

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


  loadSample(): void {
    this.sql.set(SAMPLE_SQL);
    this.dialect.set('standard');
    this.restored.set(false);
  }


  onUpload(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const v = typeof reader.result === 'string' ? reader.result : '';
      this.setSql(v.slice(0, 30000));
    };
    reader.readAsText(file);
    input.value = '';
  }

  ngOnDestroy() {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }


  private readSaved(): string | null {
    try {
      const v = localStorage.getItem('jt-sql-formatter-input');
      return v && v.trim() ? v.slice(0, 30000) : null;
    } catch {
      return null;
    }
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
