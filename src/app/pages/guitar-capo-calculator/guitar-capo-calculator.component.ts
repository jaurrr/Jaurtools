import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SUFFIX: Record<string, string> = { maj: '', min: 'm', dom7: '7' };
const QUAL_ORDER = ['maj', 'min', 'dom7'];

@Component({
  selector: 'app-guitar-capo-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './guitar-capo-calculator.component.html',
  styleUrl: './guitar-capo-calculator.component.scss',
})
export class GuitarCapoCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.shapeChord() + "+" + this.t('labels.capoAt') + this.capo() + "=" + this.actualChord());
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

  readonly slug = 'guitar-capo-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['guitar-chord-transposer', 'guitar-chord-finder', 'chord-progression-generator', 'instrument-tuner'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly mode = signal<'shape' | 'target'>('shape');
  readonly shapeRoot = signal(7);
  readonly shapeQual = signal('maj');
  readonly capo = signal(2);
  readonly targetRoot = signal(9);
  readonly targetQual = signal('maj');

  readonly noteNames = NOTE_NAMES;
  readonly qualOrder = QUAL_ORDER;

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private shift(rootIdx: number, semitones: number): string {
    return NOTE_NAMES[(((rootIdx + semitones) % 12) + 12) % 12];
  }

  readonly shapeChord = computed(() => NOTE_NAMES[this.shapeRoot()] + (SUFFIX[this.shapeQual()] ?? ''));
  readonly targetChord = computed(() => NOTE_NAMES[this.targetRoot()] + (SUFFIX[this.targetQual()] ?? ''));

  readonly actualChord = computed(
    () => this.shift(this.shapeRoot(), this.capo()) + (SUFFIX[this.shapeQual()] ?? ''),
  );

  readonly playShape = computed(
    () => this.shift(this.targetRoot(), -this.capo()) + (SUFFIX[this.targetQual()] ?? ''),
  );

  readonly capoMap = computed(() => {
    const r = this.shapeRoot();
    const sfx = SUFFIX[this.shapeQual()] ?? '';
    return Array.from({ length: 12 }, (_, fret) => ({
      fret,
      chord: this.shift(r, fret) + sfx,
    }));
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

  setMode(m: 'shape' | 'target'): void {
    this.mode.set(m);
  }

  setShapeRoot(i: number): void {
    this.shapeRoot.set(i);
  }

  setShapeQual(q: string): void {
    this.shapeQual.set(q);
  }

  setCapo(v: number): void {
    this.capo.set(this.clampNum(v, 0, 11));
  }

  setTargetRoot(i: number): void {
    this.targetRoot.set(i);
  }

  setTargetQual(q: string): void {
    this.targetQual.set(q);
  }

  ngOnDestroy(): void {
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

  private updateSeo(): void {
    const lang = this.translate.lang();
    this.pageTitle.setTitle(this.t('metaTitle'));
    this.meta.updateTag({ name: 'description', content: this.t('metaDescription') });
    this.meta.updateTag({ name: 'keywords', content: this.t('keywords') });
    this.setLink('canonical', `https://jaurtools.com/${lang}/${this.slug}`);
    for (const l of ['en', 'hi', 'ar']) {
      this.setLink('alternate', `https://jaurtools.com/${l}/${this.slug}`, l);
    }
  }

  private setLink(rel: string, href: string, hreflang?: string): void {
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

  private refreshJsonLd(): void {
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
