import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta, DomSanitizer } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-screen-resolution-simulator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './screen-resolution-simulator.component.html',
  styleUrl: './screen-resolution-simulator.component.scss',
})
export class ScreenResolutionSimulatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.category());
  copyMain(): void {
    const text = this.copyText();
    const done = () => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1600);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, () => done());
    } else {
      done();
    }
  }

  readonly slug = 'screen-resolution-simulator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['rich-text-html-editor', 'tire-size-calculator', 'diff-checker'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);


  private readonly sanitizer = inject(DomSanitizer);

  readonly urlInput = signal('https://example.com');
  readonly appliedUrl = signal('https://example.com');
  readonly width = signal(390);
  readonly height = signal(844);
  readonly zoom = signal(1);

  readonly iframeUrl = computed(() => {
    let u = this.appliedUrl().trim();
    if (!u) return 'about:blank';
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    return u;
  });
  readonly safeUrl = computed(() => this.sanitizer.bypassSecurityTrustResourceUrl(this.iframeUrl()));

  readonly presets = computed(() => {
    const names = this.list('labels.presets');
    const dims: Array<[number, number]> = [
      [390, 844], [412, 915], [820, 1180], [1366, 768], [1920, 1080], [3840, 2160],
    ];
    return dims.map((d, i) => ({ name: names[i] ?? 'Preset ' + (i + 1), w: d[0], h: d[1] }));
  });

  readonly aspect = computed(() => {
    const g = this.gcd(this.width(), this.height());
    return Math.round(this.width() / g) + ' : ' + Math.round(this.height() / g);
  });
  readonly diagonal = computed(() => Math.round(Math.sqrt(this.width() ** 2 + this.height() ** 2)));
  readonly category = computed(() => {
    const w = this.width();
    if (w < 600) return this.t('labels.catPhone');
    if (w < 1024) return this.t('labels.catTablet');
    return this.t('labels.catDesktop');
  });

  private gcd(a: number, b: number): number {
    a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b));
    return b === 0 ? a || 1 : this.gcd(b, a % b);
  }

  setUrlInput(v: string) { this.urlInput.set(v); }
  go() { this.appliedUrl.set(this.urlInput()); }
  setWidth(v: number) { this.width.set(this.clampNum(v, 200, 4096)); }
  setHeight(v: number) { this.height.set(this.clampNum(v, 200, 4096)); }
  setZoom(v: number) { this.zoom.set(v); }
  applyPreset(p: { name: string; w: number; h: number }) {
    this.width.set(p.w);
    this.height.set(p.h);
  }
  rotate() {
    const w = this.width();
    this.width.set(this.height());
    this.height.set(w);
  }
  reload() {
    const f = this.document.getElementById('sim-frame') as HTMLIFrameElement | null;
    if (f) f.src = this.iframeUrl();
  }
  openTab() {
    this.document.defaultView?.open(this.iframeUrl(), '_blank', 'noopener');
  }


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
    for (const l of ['en', 'hi', 'ar']) this.setLink('alternate', `https://jaurtools.com/${l}/${this.slug}`, l);
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
      '@type': 'Question', name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    }));
    const json = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity })
      .replace(/</g, '\u003c');
    const el = this.document.createElement('script');
    el.type = 'application/ld+json';
    el.textContent = json;
    this.document.head.appendChild(el);
    this.jsonLdEl = el;
  }
}
