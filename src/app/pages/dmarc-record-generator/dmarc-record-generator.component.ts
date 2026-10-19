import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-dmarc-record-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './dmarc-record-generator.component.html',
  styleUrl: './dmarc-record-generator.component.scss',
})
export class DmarcRecordGeneratorComponent implements OnDestroy {
  readonly slug = 'dmarc-record-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['spf-record-generator', 'dmarc-xml-report-analyzer', 'email-header-analyzer'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly domain = signal('example.com');
  readonly policy = signal('reject');
  readonly subPolicy = signal('inherit');
  readonly pct = signal(100);
  readonly adkim = signal('r');
  readonly aspf = signal('r');
  readonly rua = signal('');
  readonly ruf = signal('');
  readonly fo = signal('0');
  readonly rf = signal('afrf');
  readonly ri = signal(86400);
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

  private isEmail(v: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
  }

  readonly record = computed(() => {
    const parts = ['v=DMARC1', `p=${this.policy()}`];
    const sp = this.subPolicy();
    if (sp !== 'inherit') parts.push(`sp=${sp}`);
    if (this.pct() < 100) parts.push(`pct=${this.pct()}`);
    if (this.adkim() === 's') parts.push('adkim=s');
    if (this.aspf() === 's') parts.push('aspf=s');
    const rua = this.rua().trim();
    if (rua && this.isEmail(rua)) parts.push(`rua=mailto:${rua}`);
    const ruf = this.ruf().trim();
    if (ruf && this.isEmail(ruf)) parts.push(`ruf=mailto:${ruf}`);
    if (this.fo() !== '0') parts.push(`fo=${this.fo()}`);
    if (this.rf() === 'iodef') parts.push('rf=iodef');
    if (this.ri() !== 86400) parts.push(`ri=${this.ri()}`);
    return parts.join('; ') + ';';
  });

  readonly host = computed(() => `_dmarc.${this.domain().trim() || 'example.com'}`);
  readonly recordLength = computed(() => this.record().length);

  readonly warnings = computed(() => {
    const w: string[] = [];
    const rua = this.rua().trim();
    const ruf = this.ruf().trim();
    if (!rua) w.push('warnNoRua');
    else if (!this.isEmail(rua)) w.push('warnInvalidRua');
    if (ruf && !this.isEmail(ruf)) w.push('warnInvalidRuf');
    if (this.policy() === 'none') w.push('warnPolicyNone');
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
  setPolicy(v: string) { this.policy.set(v); }
  setSubPolicy(v: string) { this.subPolicy.set(v); }
  setAdkim(v: string) { this.adkim.set(v); }
  setAspf(v: string) { this.aspf.set(v); }
  setRua(v: string) { this.rua.set(v); }
  setRuf(v: string) { this.ruf.set(v); }
  setFo(v: string) { this.fo.set(v); }
  setRf(v: string) { this.rf.set(v); }
  setPct(v: number) { this.pct.set(this.clampNum(v, 0, 100)); }
  setRi(v: number) { this.ri.set(this.clampNum(v, 3600, 604800)); }

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
    a.download = `${this.host()}.txt`;
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
