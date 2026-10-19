import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type PolicyState = 'unset' | 'deny' | 'self' | 'custom';

const DIRECTIVES = [
  'accelerometer', 'autoplay', 'camera', 'clipboard-read', 'clipboard-write',
  'display-capture', 'encrypted-media', 'fullscreen', 'gamepad', 'geolocation',
  'gyroscope', 'hid', 'idle-detection', 'local-fonts', 'magnetometer',
  'microphone', 'midi', 'payment', 'picture-in-picture', 'publickey-credentials-get',
  'screen-wake-lock', 'serial', 'sync-xhr', 'usb-devices',
];

const SENSITIVE = ['camera', 'microphone', 'geolocation', 'display-capture', 'hid', 'serial', 'usb-devices', 'idle-detection', 'local-fonts'];

@Component({
  selector: 'app-permissions-policy-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './permissions-policy-generator.component.html',
  styleUrl: './permissions-policy-generator.component.scss',
})
export class PermissionsPolicyGeneratorComponent implements OnDestroy {
  readonly slug = 'permissions-policy-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['security-txt-generator', 'llms-txt-generator', 'web-app-manifest-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly directives = DIRECTIVES;
  readonly states = signal<Record<string, PolicyState>>({});
  readonly origins = signal('');
  readonly copied = signal(false);

  private copyTimer: ReturnType<typeof setTimeout> | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  stateOf(name: string): PolicyState {
    return this.states()[name] ?? 'unset';
  }

  setState(name: string, s: PolicyState) {
    this.states.update((m) => ({ ...m, [name]: s }));
  }

  applyPreset(kind: 'strict' | 'balanced' | 'reset') {
    if (kind === 'reset') {
      this.states.set({});
      return;
    }
    const next: Record<string, PolicyState> = {};
    for (const d of DIRECTIVES) {
      next[d] = kind === 'strict' ? 'deny' : SENSITIVE.includes(d) ? 'deny' : 'self';
    }
    this.states.set(next);
  }

  readonly originList = computed(() =>
    this.origins()
      .split(/[\s,]+/)
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter(Boolean)
  );

  readonly invalidOrigins = computed(() =>
    this.originList().filter((o) => !/^https?:\/\/[^\s/:]+(:\d+)?$/.test(o))
  );

  readonly headerValue = computed(() => {
    const valid = this.originList().filter((o) => !this.invalidOrigins().includes(o));
    const parts: string[] = [];
    for (const d of DIRECTIVES) {
      const s = this.stateOf(d);
      if (s === 'unset') continue;
      if (s === 'deny') parts.push(`${d}=()`);
      else if (s === 'self') parts.push(`${d}=(self)`);
      else parts.push(`${d}=(self${valid.map((o) => ` "${o}"`).join('')})`);
    }
    return parts.join(', ');
  });

  readonly configuredCount = computed(() =>
    DIRECTIVES.filter((d) => this.stateOf(d) !== 'unset').length
  );

  readonly warnings = computed(() => {
    const w: string[] = [];
    const hasCustom = DIRECTIVES.some((d) => this.stateOf(d) === 'custom');
    if (hasCustom && this.originList().length === 0) w.push('warnCustomNoOrigins');
    if (this.invalidOrigins().length > 0) w.push('warnInvalidOrigins');
    if (this.configuredCount() === 0) w.push('warnNothingSet');
    return w;
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

  setOrigins(v: string) { this.origins.set(v); }

  copyHeader() {
    const text = `Permissions-Policy: ${this.headerValue()}`;
    const done = () => {
      this.copied.set(true);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
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

  downloadHeader() {
    const blob = new Blob([`Permissions-Policy: ${this.headerValue()}\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'permissions-policy.txt';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
