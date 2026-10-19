import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

@Component({
  selector: 'app-note-frequency-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './note-frequency-calculator.component.html',
  styleUrl: './note-frequency-calculator.component.scss',
})
export class NoteFrequencyCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.twoDec().format(this.freqOfNote()) + "Hz");
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

  readonly slug = 'note-frequency-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['instrument-tuner', 'tone-generator', 'guitar-chord-finder', 'piano-note-checker'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly mode = signal<'note' | 'freq'>('note');
  readonly root = signal(9);
  readonly octave = signal(4);
  readonly hzInput = signal(440);

  readonly noteNames = NOTE_NAMES;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private freqOf(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  readonly midi = computed(() => (this.octave() + 1) * 12 + this.root());
  readonly noteLabel = computed(() => `${NOTE_NAMES[this.root()]}${this.octave()}`);
  readonly freqOfNote = computed(() => this.freqOf(this.midi()));

  readonly nearest = computed(() => {
    const hz = this.hzInput();
    if (!(hz > 0)) return { midi: 69, freq: 440, cents: 0 };
    const m = Math.round(69 + (12 * Math.log(hz / 440)) / Math.LN2);
    const fNote = this.freqOf(m);
    const cents = (1200 * Math.log(hz / fNote)) / Math.LN2;
    return { midi: m, freq: fNote, cents };
  });

  readonly nearestName = computed(() => {
    const m = this.nearest().midi;
    const idx = ((m % 12) + 12) % 12;
    return `${NOTE_NAMES[idx]}${Math.floor(m / 12) - 1}`;
  });

  readonly centsDirection = computed(() => {
    const c = this.nearest().cents;
    if (c > 0.5) return 'sharp';
    if (c < -0.5) return 'flat';
    return 'inTune';
  });

  readonly twoDec = computed(
    () => new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  );
  readonly oneDec = computed(
    () => new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  );

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

  setMode(m: 'note' | 'freq'): void {
    this.mode.set(m);
  }

  setRoot(i: number): void {
    this.root.set(i);
  }

  setOctave(v: number): void {
    this.octave.set(this.clampNum(v, 0, 8));
  }

  setHz(v: number): void {
    this.hzInput.set(this.clampNum(v, 1, 20000));
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
