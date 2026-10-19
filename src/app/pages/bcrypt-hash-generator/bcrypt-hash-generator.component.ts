import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { hashSync, compareSync } from 'bcryptjs';

@Component({
  selector: 'app-bcrypt-hash-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './bcrypt-hash-generator.component.html',
  styleUrl: './bcrypt-hash-generator.component.scss',
})
export class BcryptHashGeneratorComponent implements OnDestroy {
  readonly slug = 'bcrypt-hash-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['password-generator', 'css-inliner', 'qr-code-generator', 'word-counter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly password = signal('');
  readonly rounds = signal(10);
  readonly hashResult = signal('');
  readonly error = signal('');
  readonly copied = signal(false);
  readonly busy = signal(false);

  readonly verifyHash = signal('');
  readonly verifyPassword = signal('');
  readonly verifyResult = signal<'none' | 'match' | 'nomatch' | 'error'>('none');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly hashParts = computed(() => {
    const h = this.hashResult();
    if (!h.startsWith('$2b$') && !h.startsWith('$2a$')) return null;
    const segs = h.split('$');
    if (segs.length !== 4) return null;
    return { version: segs[1], cost: segs[2], saltAndHash: segs[3] };
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

  setPassword(v: string) {
    this.password.set(v.slice(0, 200));
    this.error.set('');
    this.hashResult.set('');
  }
  setRounds(v: number) {
    const n = Number.isFinite(v) ? Math.min(14, Math.max(4, Math.round(v))) : 10;
    this.rounds.set(n);
    this.hashResult.set('');
  }

  generate() {
    const pw = this.password();
    if (!pw) {
      this.error.set(this.t('labels.errorEmptyPassword'));
      return;
    }
    this.error.set('');
    this.busy.set(true);
    try {
      const h = hashSync(pw, this.rounds());
      this.hashResult.set(h);
      this.copied.set(false);
    } catch {
      this.error.set(this.t('labels.errorGeneric'));
    } finally {
      this.busy.set(false);
    }
  }

  setVerifyHash(v: string) {
    this.verifyHash.set(v);
    this.verifyResult.set('none');
  }

  setVerifyPassword(v: string) {
    this.verifyPassword.set(v);
    this.verifyResult.set('none');
  }

  verify() {
    const h = this.verifyHash().trim();
    const pw = this.verifyPassword();
    if (!h || !pw) {
      this.verifyResult.set('error');
      return;
    }
    try {
      this.verifyResult.set(compareSync(pw, h) ? 'match' : 'nomatch');
    } catch {
      this.verifyResult.set('error');
    }
  }

  async copyHash() {
    const h = this.hashResult();
    if (!h) return;
    try {
      await navigator.clipboard.writeText(h).catch(() => undefined);
      this.copied.set(true);
      window.setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.fallbackCopy(h);
    }
  }

  private fallbackCopy(text: string) {
    const ta = this.document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    this.document.body.appendChild(ta);
    ta.select();
    try {
      this.document.execCommand('copy');
      this.copied.set(true);
      window.setTimeout(() => this.copied.set(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
    ta.remove();
  }

  downloadHash() {
    const h = this.hashResult();
    if (!h) return;
    const blob = new Blob([h], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'bcrypt-hash.txt';
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
