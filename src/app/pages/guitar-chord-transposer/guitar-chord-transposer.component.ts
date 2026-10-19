import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

@Component({
  selector: 'app-guitar-chord-transposer',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './guitar-chord-transposer.component.html',
  styleUrl: './guitar-chord-transposer.component.scss',
})
export class GuitarChordTransposerComponent implements OnDestroy {
  readonly slug = 'guitar-chord-transposer';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['guitar-chord-finder', 'chord-progression-generator', 'guitar-capo-calculator', 'note-frequency-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly input = signal('C G Am F');
  readonly semitones = signal(2);
  readonly useFlats = signal(false);
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private transposeRoot(letter: string, acc: string, shift: number, flats: boolean): string {
    const base = SHARPS.indexOf(letter);
    if (base < 0) return letter + acc;
    const adj = acc === '#' ? 1 : acc === 'b' ? -1 : 0;
    const idx = (((base + adj + shift) % 12) + 12) % 12;
    return flats ? FLATS[idx] : SHARPS[idx];
  }

  private transposeToken(token: string, shift: number, flats: boolean): string {
    const m = token.match(/^([A-G])([#b]?)([^/]*?)(?:\/([A-G])([#b]?))?$/);
    if (!m) return token;
    const root = this.transposeRoot(m[1], m[2] ?? '', shift, flats);
    const suffix = m[3] ?? '';
    if (m[4]) {
      const bass = this.transposeRoot(m[4], m[5] ?? '', shift, flats);
      return `${root}${suffix}/${bass}`;
    }
    return `${root}${suffix}`;
  }

  readonly output = computed(() => {
    const shift = this.semitones();
    const flats = this.useFlats();
    return this.input()
      .split(/[\s,;|]+/)
      .filter((t) => t.length > 0)
      .map((t) => this.transposeToken(t, shift, flats))
      .join(' ');
  });

  readonly chordCount = computed(
    () => this.input().split(/[\s,;|]+/).filter((t) => t.length > 0).length,
  );

  readonly shiftLabel = computed(() => {
    const s = this.semitones();
    return s > 0 ? `+${s}` : `${s}`;
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

  setInput(v: string): void {
    this.input.set(v.slice(0, 2000));
  }

  setSemitones(v: number): void {
    this.semitones.set(this.clampNum(v, -11, 11));
  }

  nudge(d: number): void {
    this.setSemitones(this.semitones() + d);
  }

  setFlats(v: boolean): void {
    this.useFlats.set(v);
  }

  copy(): void {
    const text = this.output();
    if (!text) return;
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 2000);
      })
      ;
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
