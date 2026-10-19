import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const MAJOR_DEGREES = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const MAJOR_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
const MAJOR_QUAL = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'];

const MINOR_DEGREES = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];
const MINOR_OFFSETS = [0, 2, 3, 5, 7, 8, 10];
const MINOR_QUAL = ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'];

const TRIAD = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6] } as Record<string, number[]>;

const STYLES: Record<string, { major: number[][]; minor: number[][] }> = {
  pop: { major: [[0, 4, 5, 3], [0, 3, 5, 4], [5, 3, 0, 4]], minor: [[0, 5, 2, 6], [0, 5, 3, 6]] },
  rock: { major: [[0, 3, 4, 3], [4, 3, 0, 3], [0, 0, 3, 4]], minor: [[0, 6, 5, 6], [0, 5, 3, 4]] },
  jazz: { major: [[1, 4, 0, 5], [1, 4, 0, 0], [3, 6, 1, 4]], minor: [[1, 4, 0, 5], [0, 3, 1, 4]] },
  folk: { major: [[0, 3, 4, 4], [0, 5, 3, 4], [0, 0, 3, 4]], minor: [[0, 6, 3, 4], [0, 5, 6, 5]] },
};

const STYLE_ORDER = ['pop', 'rock', 'jazz', 'folk', 'random'];

@Component({
  selector: 'app-chord-progression-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './chord-progression-generator.component.html',
  styleUrl: './chord-progression-generator.component.scss',
})
export class ChordProgressionGeneratorComponent implements OnDestroy {
  readonly slug = 'chord-progression-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['guitar-chord-finder', 'guitar-chord-transposer', 'guitar-capo-calculator', 'scale-trainer'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly key = signal(0);
  readonly mode = signal<'major' | 'minor'>('major');
  readonly style = signal('pop');
  readonly length = signal(4);
  readonly seed = signal(20261018);
  readonly playing = signal(false);

  readonly noteNames = NOTE_NAMES;
  readonly styleOrder = STYLE_ORDER;

  private audioCtx: AudioContext | null = null;
  private activeOscs: OscillatorNode[] = [];
  private playTimer: ReturnType<typeof setTimeout> | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private rand(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  readonly diatonic = computed(() => {
    const key = this.key();
    const major = this.mode() === 'major';
    const offsets = major ? MAJOR_OFFSETS : MINOR_OFFSETS;
    const degrees = major ? MAJOR_DEGREES : MINOR_DEGREES;
    const quals = major ? MAJOR_QUAL : MINOR_QUAL;
    return offsets.map((o, d) => {
      const rootIdx = (key + o) % 12;
      const q = quals[d];
      return {
        degree: degrees[d],
        name: NOTE_NAMES[rootIdx] + (q === 'maj' ? '' : q === 'min' ? 'm' : 'dim'),
      };
    });
  });

  readonly progression = computed(() => {
    const key = this.key();
    const major = this.mode() === 'major';
    const style = this.style();
    const len = this.length();
    const rng = this.rand(this.seed());
    const offsets = major ? MAJOR_OFFSETS : MINOR_OFFSETS;
    const degrees = major ? MAJOR_DEGREES : MINOR_DEGREES;
    const quals = major ? MAJOR_QUAL : MINOR_QUAL;
    let degIdx: number[];
    const styleDef = STYLES[style];
    if (!styleDef) {
      const pool = major ? [0, 0, 1, 2, 3, 3, 4, 4, 5, 5, 6] : [0, 0, 1, 2, 3, 4, 5, 6, 6];
      degIdx = Array.from({ length: len }, () => pool[Math.floor(rng() * pool.length)]);
      degIdx[0] = 0;
    } else {
      const patterns = major ? styleDef.major : styleDef.minor;
      const p = patterns[Math.floor(rng() * patterns.length)];
      degIdx = [];
      while (degIdx.length < len) degIdx.push(...p);
      degIdx = degIdx.slice(0, len);
    }
    return degIdx.map((d) => {
      const rootIdx = (key + offsets[d]) % 12;
      const q = quals[d];
      return {
        degree: degrees[d],
        name: NOTE_NAMES[rootIdx] + (q === 'maj' ? '' : q === 'min' ? 'm' : 'dim'),
        rootIdx,
        qual: q,
      };
    });
  });

  readonly progressionText = computed(() => this.progression().map((c) => c.name).join(' - '));

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

  setKey(i: number): void {
    this.key.set(i);
  }

  setMode(m: 'major' | 'minor'): void {
    this.mode.set(m);
  }

  setStyle(s: string): void {
    this.style.set(s);
  }

  setLength(n: number): void {
    this.length.set(n);
  }

  regenerate(): void {
    this.stopAudio();
    this.seed.set(Math.floor(Math.random() * 2147483647));
  }

  playProgression(): void {
    this.stopAudio();
    const ctx = this.ensureCtx();
    const chords = this.progression();
    const t0 = ctx.currentTime + 0.05;
    const beat = 0.7;
    chords.forEach((c, i) => {
      const base = 48 + c.rootIdx;
      for (const iv of TRIAD[c.qual] ?? TRIAD['maj']) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = 440 * Math.pow(2, (base + iv - 69) / 12);
        const g = ctx.createGain();
        const start = t0 + i * beat;
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(0.18, start + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, start + beat * 0.95);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + beat);
        this.activeOscs.push(osc);
      }
    });
    this.playing.set(true);
    this.playTimer = setTimeout(() => this.playing.set(false), chords.length * beat * 1000 + 200);
  }

  stopAudio(): void {
    if (this.playTimer) {
      clearTimeout(this.playTimer);
      this.playTimer = null;
    }
    for (const o of this.activeOscs) {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
      o.disconnect();
    }
    this.activeOscs = [];
    this.playing.set(false);
  }

  ngOnDestroy(): void {
    this.stopAudio();
    this.audioCtx?.close();
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private ensureCtx(): AudioContext {
    if (!this.audioCtx) this.audioCtx = new AudioContext();
    if (this.audioCtx.state === 'suspended') void this.audioCtx.resume();
    return this.audioCtx;
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
