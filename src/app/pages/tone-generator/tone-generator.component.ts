import { Component, computed, effect, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-tone-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './tone-generator.component.html',
  styleUrl: './tone-generator.component.scss',
})
export class ToneGeneratorComponent implements OnDestroy {
  readonly slug = 'tone-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['instrument-tuner', 'note-frequency-calculator', 'tap-tempo', 'ear-training'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly freq = signal(440);
  readonly wave = signal<OscillatorType>('sine');
  readonly volume = signal(70);
  readonly duration = signal(2);
  readonly playing = signal(false);

  readonly presets = [
    { name: 'C4', freq: 261.63 },
    { name: 'A4', freq: 440 },
    { name: 'C5', freq: 523.25 },
    { name: '1 kHz', freq: 1000 },
    { name: '8 kHz', freq: 8000 },
    { name: '15 kHz', freq: 15000 },
  ];

  private audioCtx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private rafId: number | null = null;
  readonly scope = viewChild<ElementRef<HTMLCanvasElement>>('scope');

  readonly freqBubbleLeft = computed(() => {
    const min = Math.log(20), max = Math.log(20000);
    return ((Math.log(Math.max(20, this.freq())) - min) / (max - min)) * 100;
  });
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly period = computed(() => (this.freq() > 0 ? 1000 / this.freq() : 0));
  readonly wavelength = computed(() => (this.freq() > 0 ? 343 / this.freq() : 0));

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

  setFreq(v: number): void {
    this.freq.set(this.clampNum(v, 20, 20000));
    if (this.playing() && this.osc) this.osc.frequency.setValueAtTime(this.freq(), this.ensureCtx().currentTime);
  }

  setWave(v: string): void {
    this.wave.set(v as OscillatorType);
    if (this.playing() && this.osc) this.osc.type = this.wave();
  }

  setVolume(v: number): void {
    this.volume.set(this.clampNum(v, 0, 100));
    if (this.gainNode) this.gainNode.gain.value = (this.volume() / 100) * 0.4;
  }

  setDuration(v: number): void {
    this.duration.set(v);
  }

  applyPreset(f: number): void {
    this.setFreq(f);
  }

  play(): void {
    this.stopTone();
    const ctx = this.ensureCtx();
    const osc = ctx.createOscillator();
    osc.type = this.wave();
    osc.frequency.value = this.freq();
    const gain = ctx.createGain();
    gain.gain.value = (this.volume() / 100) * 0.4;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    osc.connect(gain);
    gain.connect(analyser);
    analyser.connect(ctx.destination);
    osc.start();
    this.osc = osc;
    this.gainNode = gain;
    this.analyser = analyser;
    this.playing.set(true);
    this.drawScope();
    if (this.duration() > 0) {
      osc.stop(ctx.currentTime + this.duration());
      this.stopTimer = setTimeout(() => {
        this.playing.set(false);
        this.osc = null;
        this.gainNode = null;
        this.analyser = null;
      }, this.duration() * 1000 + 100);
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
    this.analyser?.disconnect();
    this.osc = null;
    this.gainNode = null;
    this.analyser = null;
    this.playing.set(false);
    this.stopScope();
  }

  private drawScope(): void {
    this.stopScope();
    const canvas = this.scope()?.nativeElement;
    const analyser = this.analyser;
    if (!canvas || !analyser) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    const data = new Uint8Array(analyser.fftSize);
    const render = () => {
      this.rafId = requestAnimationFrame(render);
      const w = (canvas.width = canvas.clientWidth * 2);
      const h = (canvas.height = 160);
      analyser.getByteTimeDomainData(data);
      ctx2d.fillStyle = '#0f172a';
      ctx2d.fillRect(0, 0, w, h);
      ctx2d.strokeStyle = 'rgba(148,163,184,0.25)';
      ctx2d.beginPath();
      ctx2d.moveTo(0, h / 2);
      ctx2d.lineTo(w, h / 2);
      ctx2d.stroke();
      ctx2d.strokeStyle = '#a5b4fc';
      ctx2d.lineWidth = 3;
      ctx2d.beginPath();
      const step = w / data.length;
      for (let i = 0; i < data.length; i++) {
        const y = (data[i] / 255) * h;
        if (i === 0) ctx2d.moveTo(0, y);
        else ctx2d.lineTo(i * step, y);
      }
      ctx2d.stroke();
    };
    render();
  }

  private stopScope(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
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
