import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface CssRule {
  selector: string;
  decls: Record<string, string>;
}

const SAMPLE_HTML = `<div class="card">
  <h2>Welcome</h2>
  <p class="intro">Hello, world!</p>
  <a class="btn" href="https://example.com">Click me</a>
</div>`;

const SAMPLE_CSS = `.card { padding: 24px; background: #f8fafc; }
.card h2 { color: #4f46e5; margin: 0 0 8px; }
.intro { color: #334155; }
.btn { display: inline-block; padding: 10px 20px; background: #4f46e5; color: #ffffff; text-decoration: none; border-radius: 6px; }
a:hover { text-decoration: underline; }`;

function parseDeclarations(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of block.split(';')) {
    const idx = part.indexOf(':');
    if (idx < 0) continue;
    const prop = part.slice(0, idx).trim().toLowerCase();
    const val = part.slice(idx + 1).trim();
    if (prop && val) out[prop] = val;
  }
  return out;
}

function parseCss(css: string): CssRule[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: CssRule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) !== null) {
    const selector = m[1].trim();
    if (!selector || selector.startsWith('@')) continue;
    const decls = parseDeclarations(m[2]);
    if (Object.keys(decls).length > 0) rules.push({ selector, decls });
  }
  return rules;
}

@Component({
  selector: 'app-css-inliner',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './css-inliner.component.html',
  styleUrl: './css-inliner.component.scss',
})
export class CssInlinerComponent implements OnDestroy {
  readonly slug = 'css-inliner';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['css-background-pattern-generator', 'css-box-shadow-generator', 'css-checkbox-generator', 'css-border-radius-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly htmlInput = signal(SAMPLE_HTML);
  readonly cssInput = signal(SAMPLE_CSS);
  readonly result = signal('');
  readonly applied = signal(0);
  readonly skipped = signal(0);
  readonly didRun = signal(false);
  readonly error = signal('');
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
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

  inlineCss() {
    const html = this.htmlInput().trim();
    const css = this.cssInput().trim();
    if (!html || !css) {
      this.error.set(this.t('labels.errorEmpty'));
      return;
    }
    this.error.set('');
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const rules = parseCss(css);
    let applied = 0;
    let skipped = 0;
    for (const rule of rules) {
      if (rule.selector.includes(':')) {
        skipped++;
        continue;
      }
      let els: NodeListOf<Element> | null = null;
      try {
        els = doc.querySelectorAll(rule.selector);
      } catch {
        skipped++;
        continue;
      }
      if (!els || els.length === 0) {
        skipped++;
        continue;
      }
      els.forEach((el) => {
        const existing = parseDeclarations(el.getAttribute('style') ?? '');
        const merged: Record<string, string> = { ...rule.decls, ...existing };
        el.setAttribute(
          'style',
          Object.entries(merged).map(([k, v]) => `${k}: ${v}`).join('; ')
        );
        applied++;
      });
    }
    doc.querySelectorAll('style').forEach((s) => s.remove());
    this.result.set(doc.body.innerHTML.trim());
    this.applied.set(applied);
    this.skipped.set(skipped);
    this.didRun.set(true);
    this.copied.set(false);
  }

  loadSample() {
    this.htmlInput.set(SAMPLE_HTML);
    this.cssInput.set(SAMPLE_CSS);
    this.didRun.set(false);
    this.result.set('');
    this.error.set('');
  }

  async copyResult() {
    const r = this.result();
    if (!r) return;
    try {
      await navigator.clipboard.writeText(r).catch(() => undefined);
      this.copied.set(true);
      window.setTimeout(() => this.copied.set(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  downloadResult() {
    const r = this.result();
    if (!r) return;
    const full = `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n</head>\n<body>\n${r}\n</body>\n</html>\n`;
    const blob = new Blob([full], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'inlined-email.html';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
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
