import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type SoundKind = 'click' | 'woodblock' | 'beep';

const FREQ: Record<SoundKind, { accent: number; normal: number }> = {
  click: { accent: 2000, normal: 1200 },
  woodblock: { accent: 840, normal: 620 },
  beep: { accent: 880, normal: 660 },
};

@Component({
  selector: 'app-metronome',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './metronome.component.html',
  styleUrl: './metronome.component.scss',
})
export class MetronomeComponent implements OnDestroy {
  readonly slug = 'metronome';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['white-noise-generator', 'online-timer'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly bpm = signal(120);
  readonly beatsPerBar = signal(4);
  readonly accent = signal(true);
  readonly sound = signal<SoundKind>('click');
  readonly volume = signal(80);
  readonly running = signal(false);
  readonly activeBeat = signal(-1);

  readonly beatOptions = [2, 3, 4, 5, 6, 7, 8, 12];
  readonly soundOptions: SoundKind[] = ['click', 'woodblock', 'beep'];

  private ctx: AudioContext | null = null;
  private schedulerTimer: number | null = null;
  private visualTimer: number | null = null;
  private nextNoteTime = 0;
  private currentBeat = 0;
  private beatTimes: { time: number; beat: number }[] = [];
  private tapTimes: number[] = [];
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly secondsPerBeat = computed(() => 60 / this.bpm());
  readonly barDuration = computed(() => (this.beatsPerBar() * 60) / this.bpm());

  readonly beatArray = computed(() => Array.from({ length: this.beatsPerBar() }, (_, i) => i));

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

  setBpm(v: number) {
    this.bpm.set(this.clampNum(v, 30, 240));
  }
  setBeats(b: number) {
    this.beatsPerBar.set(b);
    this.activeBeat.set(-1);
  }
  toggleAccent() {
    this.accent.set(!this.accent());
  }
  setSound(s: SoundKind) {
    this.sound.set(s);
  }
  setVolume(v: number) {
    this.volume.set(this.clampNum(v, 0, 100));
  }

  tap() {
    const now = performance.now();
    this.tapTimes.push(now);
    if (this.tapTimes.length > 6) this.tapTimes.shift();
    if (this.tapTimes.length >= 2) {
      const first = this.tapTimes[0];
      const last = this.tapTimes[this.tapTimes.length - 1];
      const gap = last - first;
      if (gap > 0 && gap < 8000) {
        const avg = gap / (this.tapTimes.length - 1);
        this.bpm.set(this.clampNum(Math.round(60000 / avg), 30, 240));
      }
    }
    window.setTimeout(() => {
      this.tapTimes = this.tapTimes.filter((tm) => performance.now() - tm < 3000);
    }, 3100);
  }

  toggle() {
    if (this.running()) this.stop();
    else this.start();
  }

  private start() {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    void ctx.resume();
    this.currentBeat = 0;
    this.beatTimes = [];
    this.nextNoteTime = ctx.currentTime + 0.08;
    this.running.set(true);
    this.activeBeat.set(-1);
    this.schedulerTimer = window.setInterval(() => this.scheduler(), 25);
    this.visualTimer = window.setInterval(() => this.updateVisual(), 40);
  }

  private stop() {
    if (this.schedulerTimer !== null) {
      window.clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    if (this.visualTimer !== null) {
      window.clearInterval(this.visualTimer);
      this.visualTimer = null;
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.running.set(false);
    this.activeBeat.set(-1);
    this.beatTimes = [];
  }

  private scheduler() {
    const ctx = this.ctx;
    if (!ctx) return;
    while (this.nextNoteTime < ctx.currentTime + 0.12) {
      this.scheduleNote(this.currentBeat, this.nextNoteTime);
      this.beatTimes.push({ time: this.nextNoteTime, beat: this.currentBeat });
      if (this.beatTimes.length > 64) this.beatTimes.shift();
      this.nextNoteTime += 60 / this.bpm();
      this.currentBeat = (this.currentBeat + 1) % this.beatsPerBar();
    }
  }

  private scheduleNote(beat: number, time: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const isAccent = beat === 0 && this.accent();
    const kind = this.sound();
    const freq = isAccent ? FREQ[kind].accent : FREQ[kind].normal;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = kind === 'click' ? 'square' : 'sine';
    osc.frequency.setValueAtTime(freq, time);
    const vol = (this.volume() / 100) * (isAccent ? 1 : 0.7);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + (kind === 'woodblock' ? 0.09 : 0.05));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.12);
  }

  private updateVisual() {
    const ctx = this.ctx;
    if (!ctx || !this.running()) return;
    const now = ctx.currentTime;
    let beat = -1;
    for (const b of this.beatTimes) {
      if (b.time <= now) beat = b.beat;
      else break;
    }
    if (beat !== this.activeBeat()) this.activeBeat.set(beat);
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
