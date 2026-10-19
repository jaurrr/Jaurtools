import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-spf-record-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './spf-record-generator.component.html',
  styleUrl: './spf-record-generator.component.scss',
})
export class SpfRecordGeneratorComponent implements OnDestroy {
  readonly slug = 'spf-record-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['dmarc-record-generator', 'dmarc-xml-report-analyzer', 'email-header-analyzer'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly domain = signal('example.com');
  readonly useMx = signal(true);
  readonly useA = signal(false);
  readonly ip4 = signal('');
  readonly ip6 = signal('');
  readonly includes = signal('');
  readonly redirect = signal('');
  readonly allQualifier = signal('-all');
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

  private lines(v: string): string[] {
    return v.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  }

  private validIp4(v: string): boolean {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(\/(\d{1,2}))?$/.exec(v);
    if (!m) return false;
    for (let i = 1; i <= 4; i++) if (Number(m[i]) > 255) return false;
    if (m[6] !== undefined && Number(m[6]) > 32) return false;
    return true;
  }

  private validIp6(v: string): boolean {
    if (!/^[0-9a-fA-F:]+(\/\d{1,3})?$/.test(v) || !v.includes(':')) return false;
    const prefix = /\/(\d{1,3})$/.exec(v)?.[1];
    return !prefix || Number(prefix) <= 128;
  }

  private validHost(v: string): boolean {
    return /^(?=.{1,253}$)[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?(\.[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?)*$/i.test(v);
  }

  readonly badIp4 = computed(() => this.lines(this.ip4()).filter((x) => !this.validIp4(x)));
  readonly badIp6 = computed(() => this.lines(this.ip6()).filter((x) => !this.validIp6(x)));
  readonly goodIp4 = computed(() => this.lines(this.ip4()).filter((x) => this.validIp4(x)));
  readonly goodIp6 = computed(() => this.lines(this.ip6()).filter((x) => this.validIp6(x)));
  readonly goodIncludes = computed(() => this.lines(this.includes()).filter((x) => this.validHost(x)));
  readonly badIncludes = computed(() => this.lines(this.includes()).filter((x) => !this.validHost(x)));
  readonly redirectHost = computed(() => {
    const r = this.redirect().trim();
    return r && this.validHost(r) ? r : '';
  });

  readonly record = computed(() => {
    if (this.redirectHost()) return `v=spf1 redirect=${this.redirectHost()}`;
    const mechs: string[] = [];
    if (this.useMx()) mechs.push('mx');
    if (this.useA()) mechs.push('a');
    for (const ip of this.goodIp4()) mechs.push(`ip4:${ip}`);
    for (const ip of this.goodIp6()) mechs.push(`ip6:${ip}`);
    for (const inc of this.goodIncludes()) mechs.push(`include:${inc}`);
    return `v=spf1${mechs.length ? ' ' + mechs.join(' ') : ''} ${this.allQualifier()}`;
  });

  readonly lookupCount = computed(() => {
    if (this.redirectHost()) return 1;
    return (this.useMx() ? 1 : 0) + (this.useA() ? 1 : 0) + this.goodIncludes().length;
  });

  readonly recordLength = computed(() => this.record().length);

  readonly warnings = computed(() => {
    const w: string[] = [];
    if (this.lookupCount() > 10) w.push('warnTooManyLookups');
    if (this.recordLength() > 255) w.push('warnRecordTooLong');
    if (!this.redirectHost() && this.allQualifier() === '+all') w.push('warnPlusAll');
    if (this.badIp4().length + this.badIp6().length > 0) w.push('warnInvalidIp');
    if (this.badIncludes().length > 0 || (this.redirect().trim() && !this.redirectHost())) w.push('warnInvalidHost');
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

  setDomain(v: string) { this.domain.set(v); }
  setUseMx(v: boolean) { this.useMx.set(!!v); }
  setUseA(v: boolean) { this.useA.set(!!v); }
  setIp4(v: string) { this.ip4.set(v); }
  setIp6(v: string) { this.ip6.set(v); }
  setIncludes(v: string) { this.includes.set(v); }
  setRedirect(v: string) { this.redirect.set(v); }
  setAllQualifier(v: string) { this.allQualifier.set(v); }

  copyRecord() {
    const text = this.record();
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

  downloadRecord() {
    const blob = new Blob([this.record() + '\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = `spf-${this.domain().trim() || 'record'}.txt`;
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
