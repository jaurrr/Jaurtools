import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type Pair = 'VI' | 'VR' | 'IR' | 'PV' | 'PI' | 'PR';

@Component({
  selector: 'app-ohms-law-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './ohms-law-calculator.component.html',
  styleUrl: './ohms-law-calculator.component.scss',
})
export class OhmsLawCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.solved().w + "W");
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

  readonly slug = 'ohms-law-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['power-calculator', 'resistor-color-code-calculator', 'voltage-divider-calculator', 'watts-to-amps-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly pair = signal<Pair>('VI');
  readonly a = signal(12);
  readonly b = signal(4);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly solved = computed(() => {
    const p = this.pair(), x = this.a(), y = this.b();
    let v = 0, i = 0, r = 0, w = 0;
    switch (p) {
      case 'VI': v = x; i = y; r = i !== 0 ? v / i : 0; w = v * i; break;
      case 'VR': v = x; r = y; i = r !== 0 ? v / r : 0; w = r !== 0 ? (v * v) / r : 0; break;
      case 'IR': i = x; r = y; v = i * r; w = i * i * r; break;
      case 'PV': w = x; v = y; i = v !== 0 ? w / v : 0; r = v !== 0 ? (v * v) / w : 0; break;
      case 'PI': w = x; i = y; v = i !== 0 ? w / i : 0; r = i !== 0 ? w / (i * i) : 0; break;
      case 'PR': w = x; r = y; v = r >= 0 && w >= 0 ? Math.sqrt(w * r) : 0; i = r !== 0 ? v / r : 0; break;
    }
    const round = (n: number) => Math.round(n * 10000) / 10000;
    return { v: round(v), i: round(i), r: round(r), w: round(w) };
  });

  readonly inputLabels = computed((): [string, string] => {
    switch (this.pair()) {
      case 'VI': return ['labels.voltage', 'labels.current'];
      case 'VR': return ['labels.voltage', 'labels.resistance'];
      case 'IR': return ['labels.current', 'labels.resistance'];
      case 'PV': return ['labels.power', 'labels.voltage'];
      case 'PI': return ['labels.power', 'labels.current'];
      case 'PR': return ['labels.power', 'labels.resistance'];
    }
  });

  readonly pairOptions = computed((): Pair[] => ['VI', 'VR', 'IR', 'PV', 'PI', 'PR']);

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

  setPair(p: Pair) { this.pair.set(p); }
  setA(v: number) { this.a.set(this.clampNum(v, 0, 1e9)); }
  setB(v: number) { this.b.set(this.clampNum(v, 0, 1e9)); }

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
