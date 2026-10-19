import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-aes-256-gcm-encrypt-decrypt',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './aes-256-gcm-encrypt-decrypt.component.html',
  styleUrl: './aes-256-gcm-encrypt-decrypt.component.scss',
})
export class Aes256GcmEncryptDecryptComponent implements OnDestroy {
  readonly slug = 'aes-256-gcm-encrypt-decrypt';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['material-estimator', 'bandwidth-calculator', 'btu-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly mode = signal<'encrypt' | 'decrypt'>('encrypt');
  readonly inputText = signal('');
  readonly password = signal('');
  readonly output = signal('');
  readonly errorMsg = signal('');
  readonly busy = signal(false);
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

  setMode(m: 'encrypt' | 'decrypt') {
    this.mode.set(m);
    this.output.set('');
    this.errorMsg.set('');
    this.copied.set(false);
  }

  setInput(v: string) { this.inputText.set(v); }
  setPassword(v: string) { this.password.set(v); }

  clearAll() {
    this.inputText.set('');
    this.password.set('');
    this.output.set('');
    this.errorMsg.set('');
    this.copied.set(false);
  }

  async run() {
    this.errorMsg.set('');
    this.output.set('');
    this.copied.set(false);
    const text = this.inputText().trim();
    const pwd = this.password();
    if (!pwd) { this.errorMsg.set(this.t('labels.errorEmptyPassword')); return; }
    if (!text) { this.errorMsg.set(this.t('labels.errorEmptyInput')); return; }
    this.busy.set(true);
    try {
      this.output.set(this.mode() === 'encrypt' ? await this.encryptText(text, pwd) : await this.decryptText(text, pwd));
    } catch {
      this.errorMsg.set(this.t('labels.errorBadDecrypt'));
    } finally {
      this.busy.set(false);
    }
  }

  async copyOutput() {
    const out = this.output();
    if (!out) return;
    try {
      await navigator.clipboard.writeText(out).catch(() => undefined);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.errorMsg.set(this.t('labels.errorCopy'));
    }
  }

  private async encryptText(plain: string, pwd: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey(pwd, salt);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
    const bundle = new Uint8Array(16 + 12 + ct.byteLength);
    bundle.set(salt, 0);
    bundle.set(iv, 16);
    bundle.set(new Uint8Array(ct), 28);
    return this.toB64(bundle);
  }

  private async decryptText(bundleB64: string, pwd: string): Promise<string> {
    const bundle = this.fromB64(bundleB64);
    if (bundle.length < 29) throw new Error('bad bundle');
    const salt = bundle.slice(0, 16);
    const iv = bundle.slice(16, 28);
    const ct = bundle.slice(28);
    const key = await this.deriveKey(pwd, salt);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(pt);
  }

  private async deriveKey(pwd: string, salt: Uint8Array): Promise<CryptoKey> {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pwd), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt as BufferSource, iterations: 100000, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  private toB64(bytes: Uint8Array): string {
    let s = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      s += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return btoa(s);
  }

  private fromB64(b64: string): Uint8Array {
    const bin = atob(b64.replace(/\s+/g, ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
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
