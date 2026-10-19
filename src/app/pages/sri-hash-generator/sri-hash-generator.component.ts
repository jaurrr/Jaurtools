import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-sri-hash-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './sri-hash-generator.component.html',
  styleUrl: './sri-hash-generator.component.scss',
})
export class SriHashGeneratorComponent implements OnDestroy {
  readonly slug = 'sri-hash-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['permissions-policy-generator', 'ssl-certificate-decoder', 'web-app-manifest-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly codeInput = signal('');
  readonly algorithm = signal<'sha256' | 'sha384' | 'sha512'>('sha384');
  readonly kind = signal<'script' | 'link'>('script');
  readonly hashValue = signal('');
  readonly subtleMissing = signal(false);
  readonly copied = signal('');

  private seq = 0;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    effect(() => {
      const text = this.codeInput();
      const algo = this.algorithm();
      this.computeHash(text, algo);
    });
  }

  private async computeHash(text: string, algo: string) {
    const mySeq = ++this.seq;
    const subtle = (crypto as Crypto & { subtle?: SubtleCrypto }).subtle;
    if (!subtle) {
      this.subtleMissing.set(true);
      this.hashValue.set('');
      return;
    }
    this.subtleMissing.set(false);
    if (!text) {
      this.hashValue.set('');
      return;
    }
    try {
      const bytes = new TextEncoder().encode(text);
      const digest = await subtle.digest(algo.toUpperCase().replace('SHA', 'SHA-'), bytes);
      if (mySeq !== this.seq) return;
      const arr = new Uint8Array(digest);
      let binary = '';
      const chunk = 8192;
      for (let i = 0; i < arr.length; i += chunk) {
        binary += String.fromCharCode(...arr.subarray(i, i + chunk));
      }
      const b64 = btoa(binary);
      this.hashValue.set(`${algo}-${b64}`);
    } catch {
      if (mySeq === this.seq) this.hashValue.set('');
    }
  }

  readonly snippet = computed(() => {
    const h = this.hashValue();
    if (!h) return '';
    return this.kind() === 'script'
      ? `<script src="https://cdn.example.com/library.js"\n  integrity="${h}"\n  crossorigin="anonymous"><\/script>`
      : `<link rel="stylesheet" href="https://cdn.example.com/library.css"\n  integrity="${h}"\n  crossorigin="anonymous" />`;
  });

  readonly byteLength = computed(() => new TextEncoder().encode(this.codeInput()).length);

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

  setCode(v: string) { this.codeInput.set(v); }
  setAlgorithm(v: 'sha256' | 'sha384' | 'sha512') { this.algorithm.set(v); }
  setKind(v: 'script' | 'link') { this.kind.set(v); }
  clearInput() { this.codeInput.set(''); }

  copyText(text: string, which: string) {
    const done = () => {
      this.copied.set(which);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(''), 2000);
    };
    const clipboard = (navigator as Navigator & { clipboard?: Clipboard }).clipboard;
    if (clipboard?.writeText) {
      clipboard.writeText(text).then(done).catch(() => this.legacyCopy(text, done));
    } else {
      this.legacyCopy(text, done);
    }
  }

  private legacyCopy(text: string, done: () => void) {
    const ta = this.document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    this.document.body.appendChild(ta);
    ta.select();
    try {
      this.document.execCommand('copy');
      done();
    } catch {
      /* clipboard unavailable */
    }
    ta.remove();
  }

  ngOnDestroy() {
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
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
