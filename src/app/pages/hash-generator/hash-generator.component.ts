import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface HashResult { algo: string; hex: string; }

const ALGOS = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
const MAX_FILE_BYTES = 100 * 1024 * 1024;

@Component({
  selector: 'app-hash-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './hash-generator.component.html',
  styleUrl: './hash-generator.component.scss',
})
export class HashGeneratorComponent implements OnDestroy {
  readonly slug = 'hash-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['hmac-generator', 'curl-fetch-axios-converter', 'html-entities-encoder-decoder'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly mode = signal<'text' | 'file'>('text');
  readonly text = signal('hello');
  readonly selected = signal<Record<string, boolean>>({
    'MD5': true, 'SHA-1': true, 'SHA-256': true, 'SHA-384': true, 'SHA-512': true,
  });
  readonly results = signal<HashResult[]>([]);
  readonly computing = signal(false);
  readonly fileName = signal('');
  readonly fileError = signal('');
  readonly copiedKey = signal('');
  readonly algos = ALGOS;

  private fileData: Uint8Array | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    void this.compute();
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

  setMode(m: 'text' | 'file') { this.mode.set(m); }
  setText(v: string) { this.text.set(v); void this.compute(); }

  toggleAlgo(algo: string) {
    this.selected.update((s) => ({ ...s, [algo]: !s[algo] }));
    void this.compute();
  }

  async onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.fileError.set('');
    this.fileData = null;
    this.fileName.set('');
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      this.fileError.set(this.t('labels.errorFileSize'));
      return;
    }
    this.fileName.set(file.name);
    const buf = await file.arrayBuffer();
    this.fileData = new Uint8Array(buf);
    await this.compute();
  }

  async compute() {
    const sel = ALGOS.filter((a) => this.selected()[a]);
    if (sel.length === 0) { this.results.set([]); return; }
    this.computing.set(true);
    try {
      const data = this.mode() === 'file'
        ? this.fileData ?? new Uint8Array(0)
        : new TextEncoder().encode(this.text());
      const out: HashResult[] = [];
      const subtleOk = typeof crypto !== 'undefined' && !!crypto.subtle;
      for (const algo of sel) {
        if (algo === 'MD5') out.push({ algo, hex: this.md5Hex(data) });
        else if (algo === 'SHA-1') out.push({ algo, hex: this.sha1Hex(data) });
        else if (subtleOk) {
          const digest = await crypto.subtle.digest(algo, data as unknown as BufferSource);
          out.push({ algo, hex: this.hexOf(new Uint8Array(digest)) });
        } else {
          out.push({ algo, hex: '' });
        }
      }
      this.results.set(out);
      if (!subtleOk && sel.some((a) => a.startsWith('SHA-2') || a.startsWith('SHA-3'))) {
        this.fileError.set(this.t('labels.errorSecureContext'));
      }
    } finally {
      this.computing.set(false);
    }
  }

  copyText(text: string, key: string) {
    const done = () => {
      this.copiedKey.set(key);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copiedKey.set(''), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => this.legacyCopy(text, done));
    } else {
      this.legacyCopy(text, done);
    }
  }

  ngOnDestroy() {
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private legacyCopy(text: string, done: () => void) {
    const ta = this.document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    this.document.body.appendChild(ta);
    ta.select();
    try { this.document.execCommand('copy'); } catch { /* clipboard unavailable */ }
    ta.remove();
    done();
  }

  private hexOf(bytes: Uint8Array): string {
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  private rotl32(x: number, n: number): number {
    return ((x << n) | (x >>> (32 - n))) >>> 0;
  }

  private add32(...ns: number[]): number {
    let r = 0;
    for (const n of ns) r = (r + n) >>> 0;
    return r >>> 0;
  }

  private md5Hex(data: Uint8Array): string {
    const bitLen = data.length * 8;
    const padLen = (56 - ((data.length + 1) % 64) + 64) % 64;
    const total = data.length + 1 + padLen + 8;
    const buf = new Uint8Array(total);
    buf.set(data);
    buf[data.length] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(total - 8, bitLen >>> 0, true);
    dv.setUint32(total - 4, Math.floor(bitLen / 4294967296), true);

    const s = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
      5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
      4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
      6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
    const K: number[] = [];
    for (let i = 0; i < 64; i++) K.push(Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0);

    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    const M = new Uint32Array(16);
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true);
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F: number, g: number;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        F = this.add32(F, A, K[i], M[g]);
        A = D; D = C; C = B;
        B = this.add32(B, this.rotl32(F, s[i]));
      }
      a0 = this.add32(a0, A); b0 = this.add32(b0, B); c0 = this.add32(c0, C); d0 = this.add32(d0, D);
    }
    const out = new Uint8Array(16);
    const odv = new DataView(out.buffer);
    odv.setUint32(0, a0, true); odv.setUint32(4, b0, true);
    odv.setUint32(8, c0, true); odv.setUint32(12, d0, true);
    return this.hexOf(out);
  }

  private sha1Hex(data: Uint8Array): string {
    const bitLen = data.length * 8;
    const padLen = (56 - ((data.length + 1) % 64) + 64) % 64;
    const total = data.length + 1 + padLen + 8;
    const buf = new Uint8Array(total);
    buf.set(data);
    buf[data.length] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(total - 8, Math.floor(bitLen / 4294967296), false);
    dv.setUint32(total - 4, bitLen >>> 0, false);

    let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
    const w = new Uint32Array(80);
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
      for (let i = 16; i < 80; i++) w[i] = this.rotl32(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
      let a = h0, b = h1, c = h2, d = h3, e = h4;
      for (let i = 0; i < 80; i++) {
        let f: number, k: number;
        if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
        else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
        else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
        else { f = b ^ c ^ d; k = 0xca62c1d6; }
        const tmp = this.add32(this.rotl32(a, 5), f, e, k, w[i]);
        e = d; d = c; c = this.rotl32(b, 30); b = a; a = tmp;
      }
      h0 = this.add32(h0, a); h1 = this.add32(h1, b); h2 = this.add32(h2, c);
      h3 = this.add32(h3, d); h4 = this.add32(h4, e);
    }
    const out = new Uint8Array(20);
    const odv = new DataView(out.buffer);
    odv.setUint32(0, h0, false); odv.setUint32(4, h1, false); odv.setUint32(8, h2, false);
    odv.setUint32(12, h3, false); odv.setUint32(16, h4, false);
    return this.hexOf(out);
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
