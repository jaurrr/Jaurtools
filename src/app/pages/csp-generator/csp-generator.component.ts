import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface DirectiveState {
  enabled: boolean;
  sources: string[];
}
interface DirectiveDef {
  id: string;
  defaults: string[];
  enabledByDefault: boolean;
}

const DIRECTIVE_DEFS: DirectiveDef[] = [
  { id: 'default-src', defaults: ["'self'"], enabledByDefault: true },
  { id: 'script-src', defaults: [], enabledByDefault: false },
  { id: 'style-src', defaults: [], enabledByDefault: false },
  { id: 'img-src', defaults: [], enabledByDefault: false },
  { id: 'connect-src', defaults: [], enabledByDefault: false },
  { id: 'font-src', defaults: [], enabledByDefault: false },
  { id: 'media-src', defaults: [], enabledByDefault: false },
  { id: 'frame-src', defaults: [], enabledByDefault: false },
  { id: 'object-src', defaults: ["'none'"], enabledByDefault: true },
  { id: 'base-uri', defaults: ["'self'"], enabledByDefault: true },
  { id: 'form-action', defaults: ["'self'"], enabledByDefault: true },
  { id: 'frame-ancestors', defaults: ["'self'"], enabledByDefault: true },
];

const QUICK_SOURCES = ["'self'", "'none'", "'unsafe-inline'", "'unsafe-eval'", 'https:', 'data:', 'blob:'];

@Component({
  selector: 'app-csp-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './csp-generator.component.html',
  styleUrl: './csp-generator.component.scss',
})
export class CspGeneratorComponent implements OnDestroy {
  readonly slug = 'csp-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['chmod-calculator', 'cron-builder', 'bcrypt-hash-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly directiveDefs = DIRECTIVE_DEFS;
  readonly quickSources = QUICK_SOURCES;

  readonly directives = signal<Record<string, DirectiveState>>(
    Object.fromEntries(
      DIRECTIVE_DEFS.map((d) => [d.id, { enabled: d.enabledByDefault, sources: [...d.defaults] }]),
    ),
  );
  readonly customHost = signal<Record<string, string>>({});
  readonly hostError = signal<Record<string, string>>({});
  readonly reportUri = signal('');
  readonly upgradeInsecure = signal(true);
  readonly blockMixed = signal(false);
  readonly copiedKey = signal('');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly headerValue = computed(() => {
    const parts: string[] = [];
    for (const def of this.directiveDefs) {
      const st = this.directives()[def.id];
      if (!st?.enabled) {
        continue;
      }
      if (st.sources.length === 0) {
        parts.push(def.id);
      } else {
        parts.push(`${def.id} ${st.sources.join(' ')}`);
      }
    }
    if (this.upgradeInsecure()) {
      parts.push('upgrade-insecure-requests');
    }
    if (this.blockMixed()) {
      parts.push('block-all-mixed-content');
    }
    const uri = this.reportUri().trim();
    if (uri !== '') {
      parts.push(`report-uri ${uri}`);
    }
    return parts.join('; ');
  });

  readonly metaTag = computed(
    () => `<meta http-equiv="Content-Security-Policy" content="${this.headerValue()}">`,
  );

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

  directiveLabel(id: string): string {
    const key = `labels.dir_${id.replace(/-/g, '_')}`;
    const v = this.t(key);
    return v === '' ? id : v;
  }

  toggleDirective(id: string): void {
    const cur = this.directives();
    const st = cur[id];
    this.directives.set({ ...cur, [id]: { ...st, enabled: !st.enabled } });
  }

  addSource(id: string, source: string): void {
    const cur = this.directives();
    const st = cur[id];
    let sources = st.sources;
    if (source === "'none'") {
      sources = ["'none'"];
    } else {
      sources = st.sources.filter((s) => s !== "'none'");
      if (!sources.includes(source)) {
        sources = [...sources, source];
      }
    }
    this.directives.set({ ...cur, [id]: { ...st, sources } });
  }

  removeSource(id: string, source: string): void {
    const cur = this.directives();
    const st = cur[id];
    this.directives.set({ ...cur, [id]: { ...st, sources: st.sources.filter((s) => s !== source) } });
  }

  setCustomHost(id: string, v: string): void {
    this.customHost.set({ ...this.customHost(), [id]: v });
  }

  addCustomHost(id: string): void {
    const v = (this.customHost()[id] ?? '').trim();
    if (v === '' || /\s|;/.test(v)) {
      this.hostError.set({ ...this.hostError(), [id]: this.t('labels.invalidHostLabel') });
      return;
    }
    this.hostError.set({ ...this.hostError(), [id]: '' });
    this.addSource(id, v);
    this.setCustomHost(id, '');
  }

  setReportUri(v: string): void {
    this.reportUri.set(v ?? '');
  }

  toggleUpgrade(): void {
    this.upgradeInsecure.set(!this.upgradeInsecure());
  }

  toggleBlockMixed(): void {
    this.blockMixed.set(!this.blockMixed());
  }

  reset(): void {
    this.directives.set(
      Object.fromEntries(
        DIRECTIVE_DEFS.map((d) => [d.id, { enabled: d.enabledByDefault, sources: [...d.defaults] }]),
      ),
    );
    this.reportUri.set('');
    this.upgradeInsecure.set(true);
    this.blockMixed.set(false);
  }

  copy(text: string, key: string): void {
    if (!text) {
      return;
    }
    const done = () => {
      this.copiedKey.set(key);
      window.setTimeout(() => this.copiedKey.set(''), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => this.fallbackCopy(text, done));
    } else {
      this.fallbackCopy(text, done);
    }
  }

  private fallbackCopy(text: string, done: () => void): void {
    const ta = this.document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    this.document.body.appendChild(ta);
    ta.select();
    try {
      this.document.execCommand('copy');
    } catch {
      // clipboard unavailable; user can copy manually
    }
    this.document.body.removeChild(ta);
    done();
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
    const selector = hreflang
      ? `link[rel="${rel}"][hreflang="${hreflang}"]`
      : `link[rel="${rel}"]:not([hreflang])`;
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
