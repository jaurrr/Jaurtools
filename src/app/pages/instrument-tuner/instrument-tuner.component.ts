import { Component, computed, effect, HostListener, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface TunerString {
  name: string;
  freq: number;
}

const INSTRUMENTS: Record<string, TunerString[]> = {
  guitar: [
    { name: 'E2', freq: 82.41 },
    { name: 'A2', freq: 110.0 },
    { name: 'D3', freq: 146.83 },
    { name: 'G3', freq: 196.0 },
    { name: 'B3', freq: 246.94 },
    { name: 'E4', freq: 329.63 },
  ],
  bass: [
    { name: 'E1', freq: 41.2 },
    { name: 'A1', freq: 55.0 },
    { name: 'D2', freq: 73.42 },
    { name: 'G2', freq: 98.0 },
  ],
  ukulele: [
    { name: 'G4', freq: 392.0 },
    { name: 'C4', freq: 261.63 },
    { name: 'E4', freq: 329.63 },
    { name: 'A4', freq: 440.0 },
  ],
  violin: [
    { name: 'G3', freq: 196.0 },
    { name: 'D4', freq: 293.66 },
    { name: 'A4', freq: 440.0 },
    { name: 'E5', freq: 659.25 },
  ],
};

@Component({
  selector: 'app-instrument-tuner',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './instrument-tuner.component.html',
  styleUrl: './instrument-tuner.component.scss',
})
export class InstrumentTunerComponent implements OnDestroy {
  readonly slug = 'instrument-tuner';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['tone-generator', 'note-frequency-calculator', 'ear-training', 'guitar-chord-finder'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly instrumentKeys = Object.keys(INSTRUMENTS);
  readonly instrument = signal('guitar');
  readonly stringIdx = signal(0);
  readonly wave = signal<OscillatorType>('sine');
  readonly volume = signal(70);
  readonly sustain = signal(true);
  readonly playing = signal(false);

  private audioCtx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly strings = computed(() => INSTRUMENTS[this.instrument()] ?? INSTRUMENTS['guitar']);

  readonly currentString = computed(() => {
    const list = this.strings();
    return list[Math.min(this.stringIdx(), list.length - 1)];
  });

  readonly twoDec = computed(
    () => new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
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

  selectInstrument(key: string): void {
    this.stopTone();
    this.instrument.set(key);
    this.stringIdx.set(0);
  }

  setWave(v: string): void {
    const w = v as OscillatorType;
    this.wave.set(w);
    if (this.playing()) this.playString(this.stringIdx());
  }

  setVolume(v: number): void {
    this.volume.set(this.clampNum(v, 0, 100));
    if (this.gainNode) this.gainNode.gain.value = (this.volume() / 100) * 0.4;
  }

  setSustain(v: boolean): void {
    this.sustain.set(v);
  }

  readonly volBubbleLeft = computed(() => this.volume());

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      this.stopTone();
      return;
    }
    const n = parseInt(e.key, 10);
    if (!isNaN(n) && n >= 1 && n <= this.strings().length) {
      this.playString(n - 1);
    }
  }

  playString(i: number): void {
    this.stringIdx.set(i);
    this.stopTone();
    const ctx = this.ensureCtx();
    const osc = ctx.createOscillator();
    osc.type = this.wave();
    osc.frequency.value = this.currentString().freq;
    const gain = ctx.createGain();
    gain.gain.value = (this.volume() / 100) * 0.4;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    this.osc = osc;
    this.gainNode = gain;
    this.playing.set(true);
    if (!this.sustain()) {
      osc.stop(ctx.currentTime + 3);
      this.stopTimer = setTimeout(() => {
        this.playing.set(false);
        this.osc = null;
        this.gainNode = null;
      }, 3100);
    }
  }

  stopTone(): void {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    try {
      this.osc?.stop();
    } catch {
      /* already stopped */
    }
    this.osc?.disconnect();
    this.gainNode?.disconnect();
    this.osc = null;
    this.gainNode = null;
    this.playing.set(false);
  }

  ngOnDestroy(): void {
    this.stopTone();
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
