import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const SAMPLE_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFzaGEgU2hhcm1hIiwiaWF0IjoxNzkyMjgxNjAwLCJleHAiOjE3OTIzNjgwMDB9.6lXJxqlczS8z982vyl6flzNbKm8gL34KcLOtnP8okRo';
const SAMPLE_SECRET = 'jaurtools-demo-secret';
const SAMPLE_HEADER = `{\n  "alg": "HS256",\n  "typ": "JWT"\n}`;
const SAMPLE_PAYLOAD = `{\n  "sub": "1234567890",\n  "name": "Asha Sharma",\n  "iat": 1792281600,\n  "exp": 1792368000\n}`;

const HMAC_HASH: Record<string, string> = {
  HS256: 'SHA-256',
  HS384: 'SHA-384',
  HS512: 'SHA-512',
};

function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacSign(data: string, secret: string, hash: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash },
    false,
    ['sign', 'verify'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

@Component({
  selector: 'app-jwt-decoder',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './jwt-decoder.component.html',
  styleUrl: './jwt-decoder.component.scss',
})
export class JwtDecoderComponent implements OnDestroy {
  readonly slug = 'jwt-decoder';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['json-validator', 'json-formatter', 'javascript-obfuscator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly tab = signal<'decode' | 'verify' | 'create'>('decode');
  readonly token = signal(SAMPLE_TOKEN);
  readonly secret = signal(SAMPLE_SECRET);
  readonly verifyState = signal<'idle' | 'checking' | 'valid' | 'invalid' | 'unsupported' | 'error'>('idle');
  readonly createHeader = signal(SAMPLE_HEADER);
  readonly createPayload = signal(SAMPLE_PAYLOAD);
  readonly createSecret = signal(SAMPLE_SECRET);
  readonly createdToken = signal('');
  readonly createError = signal<string | null>(null);
  readonly copied = signal(false);
  readonly focusSeg = signal<'h' | 'p' | 's' | null>(null);
  readonly restored = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;
  private copyTimer: number | null = null;
  private saveTimer: number | null = null;

  constructor() {
    this.restoreSaved();
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    effect(() => {
      const v = this.token();
      if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
      this.saveTimer = window.setTimeout(() => {
        try {
          localStorage.setItem('jt-jwt-decoder-token', v);
        } catch {
          /* storage unavailable — tool still works */
        }
      }, 800);
    });
  }

  readonly decoded = computed(() => {
    const parts = this.token().trim().split('.');
    if (parts.length !== 3) {
      return { ok: false, header: null as unknown, payload: null as unknown, alg: '', sig: '', error: 'structure' };
    }
    try {
      const header = JSON.parse(b64urlDecode(parts[0])) as unknown;
      const payload = JSON.parse(b64urlDecode(parts[1])) as unknown;
      const alg = (header as Record<string, unknown>)?.['alg'];
      return {
        ok: true,
        header,
        payload,
        alg: typeof alg === 'string' ? alg : '',
        sig: parts[2],
        error: null as string | null,
      };
    } catch {
      return { ok: false, header: null as unknown, payload: null as unknown, alg: '', sig: '', error: 'decode' };
    }
  });

  readonly claims = computed(() => {
    const d = this.decoded();
    if (!d.ok || d.payload === null || typeof d.payload !== 'object' || Array.isArray(d.payload)) return [];
    return Object.entries(d.payload as Record<string, unknown>).map(([k, v]) => ({
      key: k,
      display: this.claimDisplay(k, v),
    }));
  });

  readonly expiry = computed(() => {
    const d = this.decoded();
    if (!d.ok || d.payload === null || typeof d.payload !== 'object' || Array.isArray(d.payload)) {
      return { state: 'none' as const, date: '' };
    }
    const exp = (d.payload as Record<string, unknown>)['exp'];
    if (typeof exp !== 'number') return { state: 'none' as const, date: '' };
    const date = new Date(exp * 1000).toLocaleString(this.locale(), {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    return { state: exp * 1000 < Date.now() ? ('expired' as const) : ('active' as const), date };
  });

  readonly tokenSegments = computed((): { h: string; p: string; s: string } | null => {
    const parts = this.token().trim().split('.');
    if (parts.length !== 3) return null;
    return { h: parts[0], p: parts[1], s: parts[2] };
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

  pretty(v: unknown): string {
    return JSON.stringify(v, null, 2) ?? '';
  }

  setTab(v: 'decode' | 'verify' | 'create'): void {
    this.tab.set(v);
  }

  setToken(v: string): void {
    this.token.set(v);
    this.verifyState.set('idle');
    this.focusSeg.set(null);
    this.restored.set(false);
  }

  focusSegment(which: 'h' | 'p' | 's'): void {
    this.focusSeg.set(which);
    const id = which === 'h' ? 'jwt-seg-header' : which === 'p' ? 'jwt-seg-payload' : 'jwt-seg-signature';
    this.document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  loadSample(): void {
    this.token.set(SAMPLE_TOKEN);
    this.secret.set(SAMPLE_SECRET);
    this.verifyState.set('idle');
    this.focusSeg.set(null);
    this.restored.set(false);
  }

  private restoreSaved(): void {
    try {
      const v = localStorage.getItem('jt-jwt-decoder-token');
      if (v && v.trim() && v !== SAMPLE_TOKEN) {
        this.token.set(v.slice(0, 8000));
        this.restored.set(true);
      }
    } catch {
      /* storage unavailable — sample token stays */
    }
  }

  async verifySignature(): Promise<void> {
    const d = this.decoded();
    if (!d.ok) {
      this.verifyState.set('error');
      return;
    }
    const hash = HMAC_HASH[d.alg];
    if (!hash) {
      this.verifyState.set('unsupported');
      return;
    }
    this.verifyState.set('checking');
    try {
      const parts = this.token().trim().split('.');
      const expected = await hmacSign(parts[0] + '.' + parts[1], this.secret(), hash);
      const actual = b64urlToBytes(parts[2]);
      this.verifyState.set(bytesEqual(expected, actual) ? 'valid' : 'invalid');
    } catch {
      this.verifyState.set('error');
    }
  }

  async createToken(): Promise<void> {
    this.createError.set(null);
    try {
      const header = JSON.parse(this.createHeader());
      const payload = JSON.parse(this.createPayload());
      const alg = (header as Record<string, unknown>)['alg'];
      const hash = typeof alg === 'string' ? HMAC_HASH[alg] : undefined;
      if (!hash) {
        this.createError.set(this.t('labels.unsupportedAlgLabel'));
        return;
      }
      const enc = (o: unknown): string =>
        b64urlEncode(new TextEncoder().encode(JSON.stringify(o)));
      const h = enc(header);
      const p = enc(payload);
      const sig = b64urlEncode(await hmacSign(h + '.' + p, this.createSecret(), hash));
      this.createdToken.set(`${h}.${p}.${sig}`);
    } catch (e) {
      this.createError.set(e instanceof Error ? e.message : 'Error');
    }
  }

  async copyCreated(): Promise<void> {
    const tok = this.createdToken();
    if (!tok) return;
    try {
      await navigator.clipboard.writeText(tok).catch(() => undefined);
    } catch {
      const ta = this.document.createElement('textarea');
      ta.value = tok;
      this.document.body.appendChild(ta);
      ta.select();
      this.document.execCommand('copy');
      ta.remove();
    }
    this.copied.set(true);
    if (this.copyTimer !== null) window.clearTimeout(this.copyTimer);
    this.copyTimer = window.setTimeout(() => this.copied.set(false), 2000);
  }

  private claimDisplay(key: string, v: unknown): string {
    if ((key === 'exp' || key === 'iat' || key === 'nbf') && typeof v === 'number') {
      return `${v} (${new Date(v * 1000).toLocaleString(this.locale(), { dateStyle: 'medium', timeStyle: 'short' })})`;
    }
    const s = JSON.stringify(v);
    return s.length > 80 ? s.slice(0, 77) + '...' : s;
  }

  ngOnDestroy() {
    if (this.copyTimer !== null) window.clearTimeout(this.copyTimer);
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
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
