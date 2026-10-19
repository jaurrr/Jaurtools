import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface Stop {
  color: string;
  pos: number;
}

const PALETTE = ['#4f46e5', '#7c3aed', '#2563eb', '#0891b2', '#059669', '#65a30d', '#ca8a04', '#ea580c', '#dc2626', '#db2777', '#e11d48'];

@Component({
  selector: 'app-css-gradient-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './css-gradient-generator.component.html',
  styleUrl: './css-gradient-generator.component.scss',
})
export class CssGradientGeneratorComponent implements OnDestroy {
  readonly slug = 'css-gradient-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['analogous-color-scheme', 'color-blender', 'color-picker'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly kind = signal<'linear' | 'radial'>('linear');
  readonly angle = signal(135);
  readonly stops = signal<Stop[]>([
    { color: '#4f46e5', pos: 0 },
    { color: '#ec4899', pos: 100 },
  ]);
  readonly copied = signal('');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly palette = PALETTE;

  readonly sortedStops = computed(() =>
    [...this.stops()].sort((a, b) => a.pos - b.pos)
  );

  readonly cssText = computed(() => {
    const list = this.sortedStops().map((s) => `${s.color} ${Math.round(s.pos)}%`).join(', ');
    return this.kind() === 'linear'
      ? `background: linear-gradient(${Math.round(this.angle())}deg, ${list});`
      : `background: radial-gradient(circle, ${list});`;
  });

  readonly previewStyle = computed(() => {
    const list = this.sortedStops().map((s) => `${s.color} ${Math.round(s.pos)}%`).join(', ');
    return this.kind() === 'linear'
      ? `linear-gradient(${Math.round(this.angle())}deg, ${list})`
      : `radial-gradient(circle, ${list})`;
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

  setKind(k: 'linear' | 'radial') { this.kind.set(k); }
  setAngle(v: number) { this.angle.set(this.clampNum(v, 0, 360)); }

  setStopColor(i: number, v: string) {
    this.stops.update((ss) => ss.map((s, idx) => (idx === i ? { ...s, color: v } : s)));
  }
  setStopPos(i: number, v: number) {
    const pos = this.clampNum(v, 0, 100);
    this.stops.update((ss) => ss.map((s, idx) => (idx === i ? { ...s, pos } : s)));
  }
  addStop() {
    if (this.stops().length >= 6) return;
    const mid = PALETTE[this.stops().length % PALETTE.length];
    this.stops.update((ss) => [...ss, { color: mid, pos: 50 }]);
  }
  removeStop(i: number) {
    if (this.stops().length <= 2) return;
    this.stops.update((ss) => ss.filter((_, idx) => idx !== i));
  }
  usePreset(a: string, b: string) {
    this.kind.set('linear');
    this.angle.set(135);
    this.stops.set([{ color: a, pos: 0 }, { color: b, pos: 100 }]);
  }

  copyText(text: string) {
    try { void navigator.clipboard?.writeText(text); } catch { /* clipboard unavailable */ }
    this.copied.set(text);
    window.setTimeout(() => { if (this.copied() === text) this.copied.set(''); }, 1500);
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
