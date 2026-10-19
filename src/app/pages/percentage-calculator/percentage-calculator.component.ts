import { Component, OnInit, OnDestroy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Title, Meta } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type PctMode = 'of' | 'is' | 'change';

const MODE_DEFAULTS: Record<PctMode, [string, string]> = {
  of: ['10', '200'],
  is: ['45', '200'],
  change: ['80', '100'],
};

@Component({
  selector: 'app-percentage-calculator',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, RouterLink],
  templateUrl: './percentage-calculator.component.html',
  styleUrl: './percentage-calculator.component.scss',
})
export class PercentageCalculatorComponent implements OnInit, OnDestroy {
  private translate = inject(TranslateService);
  private title = inject(Title);
  private meta = inject(Meta);

  readonly slug = 'percentage-calculator';
  readonly related = ['sip-calculator', 'emi-calculator', 'bmi-calculator'];
  readonly lang = this.translate.lang;
  readonly modes: PctMode[] = ['of', 'is', 'change'];

  mode = signal<PctMode>('of');
  x = signal('10');
  y = signal('200');

  result = computed((): number | null => {
    const a = parseFloat(this.x().replace(/,/g, ''));
    const b = parseFloat(this.y().replace(/,/g, ''));
    if (isNaN(a) || isNaN(b)) return null;
    switch (this.mode()) {
      case 'of':
        return (a / 100) * b;
      case 'is':
        return b === 0 ? null : (a / b) * 100;
      case 'change':
        return a === 0 ? null : ((b - a) / a) * 100;
    }
  });

  resultSentence = computed((): string => {
    const value = this.result();
    if (value == null || !isFinite(value)) return this.t(`${this.slug}.ui.empty`);
    const tpl = this.t(`${this.slug}.ui.${this.mode()}Sentence`);
    return tpl
      .replace('{x}', this.x().trim())
      .replace('{y}', this.y().trim())
      .replace('{z}', this.fmt(value));
  });

  changeWord = computed((): string => {
    if (this.mode() !== 'change') return '';
    const value = this.result();
    if (value == null || value === 0) return '';
    return this.t(`${this.slug}.ui.${value > 0 ? 'increase' : 'decrease'}`);
  });

  keyFacts = computed(() => this.tx<string[]>(`${this.slug}.keyFacts`));
  howTo = computed(() => this.tx<string[]>(`${this.slug}.howTo`));
  benefits = computed(() => this.tx<string[]>(`${this.slug}.benefits`));
  limitations = computed(() => this.tx<string[]>(`${this.slug}.limitations`));
  faqs = computed(() => this.tx<{ q: string; a: string }[]>(`${this.slug}.faqs`));

  constructor() {
    effect(() => {
      this.translate.lang();
      this.applySeo();
    });
  }

  ngOnInit(): void {
    this.applySeo();
  }

  ngOnDestroy(): void {
    document.querySelectorAll('[data-seo-page]').forEach((el) => el.remove());
    document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  t(key: string): string {
    return String(this.translate.t(key));
  }

  setMode(mode: PctMode): void {
    this.mode.set(mode);
    const [dx, dy] = MODE_DEFAULTS[mode];
    this.x.set(dx);
    this.y.set(dy);
  }

  fmt(n: number): string {
    if (!isFinite(n)) return this.t(`${this.slug}.ui.empty`);
    return String(parseFloat(n.toPrecision(8)));
  }

  private tx<T>(key: string): T {
    return this.translate.t(key) as T;
  }

  private applySeo(): void {
    const lang = this.translate.lang();
    const base = 'https://jaurtools.com';
    this.title.setTitle(this.t(`${this.slug}.metaTitle`));
    this.meta.updateTag({ name: 'description', content: this.t(`${this.slug}.metaDescription`) });
    this.setLink('canonical', `${base}/${lang}/${this.slug}`);
    for (const l of ['en', 'hi', 'ar']) {
      this.setLink(`hreflang-${l}`, `${base}/${l}/${this.slug}`, l);
    }
    this.setLink('hreflang-default', `${base}/en/${this.slug}`, 'x-default');

    document.getElementById('faq-jsonld')?.remove();
    const faqs = this.faqs();
    if (Array.isArray(faqs) && faqs.length > 0) {
      const data = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      };
      const script = document.createElement('script');
      script.id = 'faq-jsonld';
      script.type = 'application/ld+json';
      script.setAttribute('data-seo-page', '');
      script.text = JSON.stringify(data).replace(/</g, '\\u003c');
      document.head.appendChild(script);
    }
  }

  private setLink(id: string, href: string, hreflang?: string): void {
    document.querySelector(`link[data-seo-page="seo-${id}"]`)?.remove();
    const link = document.createElement('link');
    link.setAttribute('data-seo-page', `seo-${id}`);
    link.rel = id === 'canonical' ? 'canonical' : 'alternate';
    if (hreflang) link.hreflang = hreflang;
    link.href = href;
    document.head.appendChild(link);
  }
}
