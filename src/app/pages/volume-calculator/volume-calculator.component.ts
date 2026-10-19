import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type Shape = 'cube' | 'cuboid' | 'sphere' | 'cylinder' | 'cone' | 'pyramid';

@Component({
  selector: 'app-volume-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './volume-calculator.component.html',
  styleUrl: './volume-calculator.component.scss',
})
export class VolumeCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.fmt(this.volume()) + this.unit() + "\u00b3");
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

  readonly slug = 'volume-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['surface-area-calculator', 'triangle-calculator', 'scientific-calculator', 'unit-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly shape = signal<Shape>('cylinder');
  readonly a = signal(3);
  readonly b = signal(5);
  readonly c = signal(4);
  readonly unit = signal('cm');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly volume = computed(() => {
    const a = Math.max(0, this.a());
    const b = Math.max(0, this.b());
    const c = Math.max(0, this.c());
    switch (this.shape()) {
      case 'cube': return a * a * a;
      case 'cuboid': return a * b * c;
      case 'sphere': return (4 / 3) * Math.PI * a * a * a;
      case 'cylinder': return Math.PI * a * a * b;
      case 'cone': return (1 / 3) * Math.PI * a * a * b;
      case 'pyramid': return (1 / 3) * a * a * b;
    }
  });

  readonly detail = computed((): { label: string; value: string; sq: boolean } | null => {
    const a = Math.max(0, this.a());
    const b = Math.max(0, this.b());
    switch (this.shape()) {
      case 'sphere':
        return { label: this.t('labels.detailSurfaceArea'), value: this.fmt(4 * Math.PI * a * a), sq: true };
      case 'cylinder':
        return { label: this.t('labels.detailSurfaceArea'), value: this.fmt(2 * Math.PI * a * (a + b)), sq: true };
      case 'cone':
        return { label: this.t('labels.detailSurfaceArea'), value: this.fmt(Math.PI * a * (a + Math.sqrt(a * a + b * b))), sq: true };
      case 'pyramid':
        return { label: this.t('labels.detailBaseArea'), value: this.fmt(a * a), sq: true };
      default:
        return null;
    }
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

  fmt(v: number): string {
    if (!Number.isFinite(v)) return '–';
    return String(parseFloat(v.toPrecision(8)));
  }

  setShape(v: string) {
    const ok: Shape[] = ['cube', 'cuboid', 'sphere', 'cylinder', 'cone', 'pyramid'];
    if ((ok as string[]).includes(v)) this.shape.set(v as Shape);
  }
  setA(v: number) { this.a.set(this.clampNum(v, 0, 1e6)); }
  setB(v: number) { this.b.set(this.clampNum(v, 0, 1e6)); }
  setC(v: number) { this.c.set(this.clampNum(v, 0, 1e6)); }
  setUnit(v: string) { this.unit.set(v); }

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
    return Math.min(max, Math.max(min, Math.round(v * 10000) / 10000));
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
