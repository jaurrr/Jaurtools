import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const STRING_MIDI = [40, 45, 50, 55, 59, 64];
const INTERVAL_NAMES = ['R', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];
const STRINGS = [0, 1, 2, 3, 4, 5];

interface ChordShape {
  e: number[];
  a: number[];
}

// Fret offsets per string (low E to high E); -1 = muted string.
// E family: root on the 6th string. A family: root on the 5th string.
const SHAPES: Record<string, ChordShape> = {
  major: { e: [0, 2, 2, 1, 0, 0], a: [-1, 0, 2, 2, 2, 0] },
  minor: { e: [0, 2, 2, 0, 0, 0], a: [-1, 0, 2, 2, 1, 0] },
  dom7: { e: [0, 2, 0, 1, 0, 0], a: [-1, 0, 2, 0, 2, 0] },
  maj7: { e: [0, 2, 1, 1, 0, 0], a: [-1, 0, 2, 1, 2, 0] },
  min7: { e: [0, 2, 0, 0, 0, 0], a: [-1, 0, 2, 0, 1, 0] },
  sus4: { e: [0, 2, 2, 2, 0, 0], a: [-1, 0, 2, 2, 3, 0] },
  sus2: { e: [0, 2, 4, 4, 0, 0], a: [-1, 0, 2, 2, 0, 0] },
  dim: { e: [], a: [-1, 0, 1, 2, 1, -1] },
  power5: { e: [0, 2, 2, -1, -1, -1], a: [] },
};

const QUALITY_ORDER = ['major', 'minor', 'dom7', 'maj7', 'min7', 'sus4', 'sus2', 'dim', 'power5'];
const QUALITY_SUFFIX: Record<string, string> = {
  major: '',
  minor: 'm',
  dom7: '7',
  maj7: 'maj7',
  min7: 'm7',
  sus4: 'sus4',
  sus2: 'sus2',
  dim: 'dim',
  power5: '5',
};

@Component({
  selector: 'app-guitar-chord-finder',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './guitar-chord-finder.component.html',
  styleUrl: './guitar-chord-finder.component.scss',
})
export class GuitarChordFinderComponent implements OnDestroy {
  readonly slug = 'guitar-chord-finder';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['guitar-chord-transposer', 'chord-progression-generator', 'guitar-capo-calculator', 'instrument-tuner'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly root = signal(0);
  readonly quality = signal('major');

  readonly noteNames = NOTE_NAMES;
  readonly qualityOrder = QUALITY_ORDER;
  readonly strings = STRINGS;

  private audioCtx: AudioContext | null = null;
  private activeOscs: OscillatorNode[] = [];
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly chord = computed(() => {
    const r = this.root();
    const q = this.quality();
    const shape = SHAPES[q] ?? SHAPES['major'];
    const f6 = (r - 4 + 12) % 12;
    const f5 = (r - 9 + 12) % 12;
    const useE = shape.e.length > 0 && (f6 <= 4 || shape.a.length === 0);
    const base = useE ? f6 : f5;
    const deltas = useE ? shape.e : shape.a;
    const frets = deltas.map((d) => (d < 0 ? -1 : base + d));
    const name = NOTE_NAMES[r] + (QUALITY_SUFFIX[q] ?? '');
    const rootMidi = STRING_MIDI[useE ? 0 : 1] + base;
    const notes = frets
      .map((fret, s) => {
        if (fret < 0) return null;
        const midi = STRING_MIDI[s] + fret;
        const idx = ((midi % 12) + 12) % 12;
        return { string: s, fret, midi, name: NOTE_NAMES[idx] + (Math.floor(midi / 12) - 1) };
      })
      .filter((n): n is { string: number; fret: number; midi: number; name: string } => n !== null);
    const intervals = [...new Set(notes.map((n) => (((n.midi - rootMidi) % 12) + 12) % 12))].sort((a, b) => a - b);
    const minFret = Math.min(...notes.map((n) => n.fret));
    return {
      name,
      frets,
      notes,
      intervals,
      family: useE ? 'e' : 'a',
      base,
      displayStart: minFret === 0 ? 0 : base,
    };
  });

  readonly board = computed(() => {
    const c = this.chord();
    const fretNums = [0, 1, 2, 3, 4].map((i) => c.displayStart + i);
    const cells = STRINGS.map((s) => {
      const f = c.frets[s];
      return fretNums.map((fn) => f === fn);
    });
    const markers = c.frets.map((f) => (f === -1 ? 'x' : f === 0 ? 'o' : null));
    return { fretNums, cells, markers, start: c.displayStart };
  });

  readonly noteList = computed(() => this.chord().notes.map((n) => n.name).join(', '));
  readonly intervalList = computed(() => this.chord().intervals.map((i) => INTERVAL_NAMES[i]).join(' - '));

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

  setRoot(i: number): void {
    this.root.set(i);
  }

  setQuality(q: string): void {
    this.quality.set(q);
  }

  playChord(): void {
    this.stopAudio();
    const ctx = this.ensureCtx();
    const t0 = ctx.currentTime + 0.05;
    const played = this.chord().notes;
    played.forEach((n, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 440 * Math.pow(2, (n.midi - 69) / 12);
      const g = ctx.createGain();
      const start = t0 + i * 0.09;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 1.3);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 1.4);
      this.activeOscs.push(osc);
    });
  }

  stopAudio(): void {
    for (const o of this.activeOscs) {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
      o.disconnect();
    }
    this.activeOscs = [];
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
