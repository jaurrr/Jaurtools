import { Component, computed, effect, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type NoiseKind = 'white' | 'pink' | 'brown';

@Component({
  selector: 'app-white-noise-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './white-noise-generator.component.html',
  styleUrl: './white-noise-generator.component.scss',
})
export class WhiteNoiseGeneratorComponent implements OnDestroy {
  readonly slug = 'white-noise-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['metronome', 'online-timer'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvasRef');

  readonly kind = signal<NoiseKind>('white');
  readonly volume = signal(40);
  readonly timerMin = signal(0); // 0 = off
  readonly playing = signal(false);
  readonly remainingSec = signal(0);

  readonly kindOptions: NoiseKind[] = ['white', 'pink', 'brown'];
  readonly timerOptions = [0, 5, 10, 15, 30, 60];

  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private rafId: number | null = null;
  private timerId: number | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly remainingText = computed(() => {
    const s = Math.max(0, Math.ceil(this.remainingSec()));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
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

  setKind(k: NoiseKind) {
    const wasPlaying = this.playing();
    if (wasPlaying) this.stop();
    this.kind.set(k);
    if (wasPlaying) this.play();
  }
  setVolume(v: number) {
    this.volume.set(this.clampNum(v, 0, 100));
    const g = this.gainNode;
    const ctx = this.ctx;
    if (g && ctx && this.playing()) {
      g.gain.cancelScheduledValues(ctx.currentTime);
      g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
      g.gain.linearRampToValueAtTime(this.volume() / 100, ctx.currentTime + 0.1);
    }
  }
  setTimer(m: number) {
    this.timerMin.set(m);
  }

  toggle() {
    if (this.playing()) this.stop();
    else this.play();
  }

  private play() {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    void ctx.resume();
    const buffer = this.makeNoiseBuffer(ctx, this.kind());
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(gain);
    gain.connect(analyser);
    analyser.connect(ctx.destination);
    this.source = src;
    this.gainNode = gain;
    this.analyser = analyser;
    src.start();
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, this.volume() / 100), ctx.currentTime + 1.2);
    this.playing.set(true);
    const total = this.timerMin() * 60;
    this.remainingSec.set(total);
    if (total > 0) {
      this.timerId = window.setInterval(() => {
        const left = this.remainingSec() - 1;
        this.remainingSec.set(left);
        if (left <= 0) this.stop();
      }, 1000);
    }
    this.drawVisualizer();
  }

  private stop() {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    const ctx = this.ctx;
    const gain = this.gainNode;
    const src = this.source;
    this.source = null;
    this.gainNode = null;
    this.analyser = null;
    if (ctx && gain && src) {
      const t = ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      window.setTimeout(() => {
        try {
          src.stop();
        } catch {
          /* ignore */
        }
        void ctx.close();
      }, 700);
    } else if (ctx) {
      void ctx.close();
    }
    this.ctx = null;
    this.playing.set(false);
    this.remainingSec.set(0);
  }

  private makeNoiseBuffer(ctx: AudioContext, kind: NoiseKind): AudioBuffer {
    const len = 2 * ctx.sampleRate;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buffer.getChannelData(0);
    if (kind === 'white') {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } else if (kind === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        b6 = white * 0.115926;
        d[i] = pink * 0.11;
      }
    } else {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        d[i] = last * 3.5;
      }
    }
    return buffer;
  }

  private drawVisualizer() {
    const canvas = this.canvasRef()?.nativeElement;
    const analyser = this.analyser;
    if (!canvas || !analyser) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      if (!this.playing()) {
        this.rafId = null;
        return;
      }
      analyser.getByteFrequencyData(data);
      const w = canvas.width;
      const h = canvas.height;
      ctx2d.clearRect(0, 0, w, h);
      const bars = 48;
      const bw = w / bars;
      const accent = getComputedStyle(this.document.documentElement).getPropertyValue('--accent').trim() || '#4f46e5';
      ctx2d.fillStyle = accent;
      for (let i = 0; i < bars; i++) {
        const v = data[Math.floor((i / bars) * data.length)] / 255;
        const bh = Math.max(2, v * h);
        ctx2d.fillRect(i * bw + 1, h - bh, bw - 2, bh);
      }
      this.rafId = requestAnimationFrame(draw);
    };
    this.rafId = requestAnimationFrame(draw);
  }

  ngOnDestroy() {
    this.stop();
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
    return Math.min(max, Math.max(min, Math.round(v)));
  }
  private locale(): string {
    const lang = this.translate.lang();
    return lang === 'ar' ? 'ar-SA' : lang === 'hi' ? 'hi-IN' : 'en-IN';
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
