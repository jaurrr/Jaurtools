import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
interface BimiCheck { key: string; pass: boolean; detail: string; }
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-bimi-svg-validator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './bimi-svg-validator.component.html',
  styleUrl: './bimi-svg-validator.component.scss',
})
export class BimiSvgValidatorComponent implements OnDestroy {
  readonly slug = 'bimi-svg-validator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['ssl-certificate-decoder', 'mime-types', 'responsive-website-tester'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly svg = signal('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n  <title>JaurTools logo</title>\n  <rect width="100" height="100" rx="20" fill="#4f46e5"/>\n  <text x="50" y="68" font-size="52" text-anchor="middle" fill="#ffffff" font-family="sans-serif">JT</text>\n</svg>');
  readonly fileError = signal('');

  setSvg(v: string): void {
    this.svg.set(v.slice(0, 200000));
    this.fileError.set('');
  }

  loadSample(): void {
    this.svg.set('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n  <title>JaurTools logo</title>\n  <rect width="100" height="100" rx="20" fill="#4f46e5"/>\n  <text x="50" y="68" font-size="52" text-anchor="middle" fill="#ffffff" font-family="sans-serif">JT</text>\n</svg>');
    this.fileError.set('');
  }

  clearSvg(): void {
    this.svg.set('');
    this.fileError.set('');
  }

  onFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    if (f.size > 200000) {
      this.fileError.set(this.t('labels.fileTooBigLabel'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.svg.set(String(reader.result ?? '').slice(0, 200000));
      this.fileError.set('');
    };
    reader.onerror = () => this.fileError.set(this.t('labels.fileReadErrorLabel'));
    reader.readAsText(f);
  }

  readonly checks = computed((): BimiCheck[] => this.runChecks(this.svg()));

  readonly passedCount = computed(() => this.checks().filter((c) => c.pass).length);

  readonly allPass = computed(() => {
    const c = this.checks();
    return c.length > 0 && c.every((x) => x.pass);
  });

  private runChecks(src: string): BimiCheck[] {
    const out: BimiCheck[] = [];
    const push = (key: string, pass: boolean, detail: string) => out.push({ key, pass, detail });
    const text = src.trim();
    if (!text) return out;
    let doc: Document | null = null;
    try {
      doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    } catch {
      doc = null;
    }
    if (!doc || doc.querySelector('parsererror')) {
      push('wellformed', false, 'parse error');
      return out;
    }
    push('wellformed', true, 'ok');
    const root = doc.documentElement;
    push('rootSvg', root.tagName.toLowerCase() === 'svg', root.tagName.toLowerCase());
    push('viewBox', root.hasAttribute('viewBox'), root.getAttribute('viewBox') ?? 'missing');
    const vb = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
    let square = false;
    let ratio = '';
    if (vb.length === 4 && vb[2] > 0 && vb[3] > 0 && vb.every((n) => Number.isFinite(n))) {
      const r = vb[2] / vb[3];
      square = r >= 0.95 && r <= 1.05;
      ratio = `${vb[2]}x${vb[3]}`;
    }
    push('square', square, ratio || 'n/a');
    push('hasTitle', root.querySelector(':scope > title') !== null, root.querySelector(':scope > title') ? 'present' : 'missing');
    push('noScript', root.querySelector('script') === null, root.querySelector('script') ? 'found' : 'none');
    push('noForeign', root.querySelector('foreignObject') === null, root.querySelector('foreignObject') ? 'found' : 'none');
    let handlers = 0;
    let extRefs = 0;
    const els: Element[] = [root, ...Array.from(root.querySelectorAll('*'))];
    for (const el of els) {
      for (const a of Array.from(el.attributes)) {
        const n = a.name.toLowerCase();
        if (n.startsWith('on')) handlers++;
        if ((n === 'href' || n === 'xlink:href') && !a.value.startsWith('#')) extRefs++;
      }
      if ((el.getAttribute('style') ?? '').includes('url(')) extRefs++;
    }
    push('noHandlers', handlers === 0, handlers === 0 ? 'none' : `${handlers} found`);
    push('noExternal', extRefs === 0, extRefs === 0 ? 'none' : `${extRefs} found`);
    const bytes = new TextEncoder().encode(text).length;
    push('size', bytes <= 32768, `${bytes} bytes`);
    return out;
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
