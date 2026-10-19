import { Component, OnInit, OnDestroy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Title, Meta } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

interface UnitDef {
  key: string;
  abbr: string;
  factor: number; // size in the category's base unit; NaN for temperature
}

interface CategoryDef {
  key: string;
  temperature?: boolean;
  units: UnitDef[];
}

const CATEGORIES: CategoryDef[] = [
  {
    key: 'length',
    units: [
      { key: 'm', abbr: 'm', factor: 1 },
      { key: 'km', abbr: 'km', factor: 1000 },
      { key: 'cm', abbr: 'cm', factor: 0.01 },
      { key: 'mm', abbr: 'mm', factor: 0.001 },
      { key: 'mi', abbr: 'mi', factor: 1609.344 },
      { key: 'yd', abbr: 'yd', factor: 0.9144 },
      { key: 'ft', abbr: 'ft', factor: 0.3048 },
      { key: 'in', abbr: 'in', factor: 0.0254 },
    ],
  },
  {
    key: 'weight',
    units: [
      { key: 'kg', abbr: 'kg', factor: 1 },
      { key: 'g', abbr: 'g', factor: 0.001 },
      { key: 't', abbr: 't', factor: 1000 },
      { key: 'lb', abbr: 'lb', factor: 0.45359237 },
      { key: 'oz', abbr: 'oz', factor: 0.028349523125 },
    ],
  },
  {
    key: 'temperature',
    temperature: true,
    units: [
      { key: 'c', abbr: '°C', factor: NaN },
      { key: 'f', abbr: '°F', factor: NaN },
      { key: 'k', abbr: 'K', factor: NaN },
    ],
  },
  {
    key: 'area',
    units: [
      { key: 'm2', abbr: 'm²', factor: 1 },
      { key: 'km2', abbr: 'km²', factor: 1000000 },
      { key: 'ha', abbr: 'ha', factor: 10000 },
      { key: 'acre', abbr: 'ac', factor: 4046.8564224 },
      { key: 'ft2', abbr: 'ft²', factor: 0.09290304 },
      { key: 'mi2', abbr: 'mi²', factor: 2589988.110336 },
    ],
  },
  {
    key: 'volume',
    units: [
      { key: 'l', abbr: 'L', factor: 1 },
      { key: 'ml', abbr: 'mL', factor: 0.001 },
      { key: 'm3', abbr: 'm³', factor: 1000 },
      { key: 'gal', abbr: 'gal', factor: 3.785411784 },
      { key: 'floz', abbr: 'fl oz', factor: 0.0295735295625 },
    ],
  },
  {
    key: 'speed',
    units: [
      { key: 'ms', abbr: 'm/s', factor: 1 },
      { key: 'kmh', abbr: 'km/h', factor: 1 / 3.6 },
      { key: 'mph', abbr: 'mph', factor: 0.44704 },
      { key: 'knot', abbr: 'kn', factor: 0.514444 },
    ],
  },
  {
    key: 'time',
    units: [
      { key: 's', abbr: 's', factor: 1 },
      { key: 'min', abbr: 'min', factor: 60 },
      { key: 'h', abbr: 'h', factor: 3600 },
      { key: 'day', abbr: 'd', factor: 86400 },
      { key: 'week', abbr: 'wk', factor: 604800 },
      { key: 'year', abbr: 'yr', factor: 31557600 },
    ],
  },
  {
    key: 'data',
    units: [
      { key: 'b', abbr: 'B', factor: 1 },
      { key: 'kb', abbr: 'KB', factor: 1024 },
      { key: 'mb', abbr: 'MB', factor: 1048576 },
      { key: 'gb', abbr: 'GB', factor: 1073741824 },
      { key: 'tb', abbr: 'TB', factor: 1099511627776 },
    ],
  },
];

@Component({
  selector: 'app-unit-converter',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './unit-converter.component.html',
  styleUrl: './unit-converter.component.scss',
})
export class UnitConverterComponent implements OnInit, OnDestroy {
  private translate = inject(TranslateService);
  private title = inject(Title);
  private meta = inject(Meta);

  readonly slug = 'unit-converter';
  readonly related = ['word-counter', 'percentage-calculator'];
  readonly lang = this.translate.lang;
  readonly categories = CATEGORIES;

  category = signal('length');
  fromUnit = signal('km');
  toUnit = signal('mi');
  inputValue = signal('1');
  copied = signal(false);

  unitsFor(cat: string): UnitDef[] {
    return CATEGORIES.find((c) => c.key === cat)?.units ?? [];
  }

  unitName(cat: string, key: string): string {
    return this.t(`${this.slug}.units.${cat}.${key}`);
  }

  result = computed((): number | null => {
    const raw = this.inputValue().trim().replace(/,/g, '');
    if (raw === '') return null;
    const value = parseFloat(raw);
    if (isNaN(value)) return null;
    return this.convert(value, this.category(), this.fromUnit(), this.toUnit());
  });

  formulaLine = computed((): string => {
    const factor = this.convert(1, this.category(), this.fromUnit(), this.toUnit());
    if (!isFinite(factor)) return '';
    return `1 ${this.unitName(this.category(), this.fromUnit())} = ${this.fmt(factor)} ${this.unitName(
      this.category(),
      this.toUnit(),
    )}`;
  });

  keyFacts = computed(() => this.tx<string[]>(`${this.slug}.keyFacts`));
  howTo = computed(() => this.tx<string[]>(`${this.slug}.howTo`));
  benefits = computed(() => this.tx<string[]>(`${this.slug}.benefits`));
  limitations = computed(() => this.tx<string[]>(`${this.slug}.limitations`));
  mistakes = computed(() => this.tx<string[]>(`${this.slug}.ui.mistakes`));
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

  onCategoryChange(cat: string): void {
    this.category.set(cat);
    const units = this.unitsFor(cat);
    this.fromUnit.set(units[0]?.key ?? '');
    this.toUnit.set(units[1]?.key ?? units[0]?.key ?? '');
  }

  swap(): void {
    const from = this.fromUnit();
    this.fromUnit.set(this.toUnit());
    this.toUnit.set(from);
  }

  fmt(n: number): string {
    if (!isFinite(n)) return this.t(`${this.slug}.ui.empty`);
    const abs = Math.abs(n);
    if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) return n.toExponential(6).replace('e', 'E');
    return String(parseFloat(n.toPrecision(12)));
  }

  copyResult(): void {
    const value = this.result();
    if (value == null) return;
    const text = this.fmt(value);
    const done = () => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(done)
        .catch(() => this.legacyCopy(text, done));
    } else {
      this.legacyCopy(text, done);
    }
  }

  private legacyCopy(text: string, done: () => void): void {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      done();
    } catch {
      // clipboard unavailable in this browser
    }
  }

  private convert(value: number, cat: string, from: string, to: string): number {
    const def = CATEGORIES.find((c) => c.key === cat);
    if (!def) return NaN;
    if (def.temperature) {
      const celsius = from === 'c' ? value : from === 'f' ? ((value - 32) * 5) / 9 : value - 273.15;
      return to === 'c' ? celsius : to === 'f' ? (celsius * 9) / 5 + 32 : celsius + 273.15;
    }
    const fromFactor = def.units.find((u) => u.key === from)?.factor;
    const toFactor = def.units.find((u) => u.key === to)?.factor;
    if (fromFactor == null || toFactor == null || toFactor === 0) return NaN;
    return (value * fromFactor) / toFactor;
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
