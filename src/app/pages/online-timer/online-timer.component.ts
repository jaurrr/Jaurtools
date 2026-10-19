import { Component, computed, effect, HostListener, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-online-timer',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './online-timer.component.html',
  styleUrl: './online-timer.component.scss',
})
export class OnlineTimerComponent implements OnDestroy {
  readonly slug = 'online-timer';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['time-duration-calculator', 'world-clock'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly tab = signal<'countdown' | 'stopwatch'>('countdown');

  readonly inH = signal(0);
  readonly inM = signal(5);
  readonly inS = signal(0);
  readonly cdState = signal<'idle' | 'running' | 'paused' | 'done'>('idle');
  readonly remainingMs = signal(0);
  readonly totalMs = signal(0);

  readonly swState = signal<'idle' | 'running' | 'paused'>('idle');
  readonly swMs = signal(0);
  readonly laps = signal<number[]>([]);

  private jsonLdEl: HTMLScriptElement | null = null;
  private cdId: ReturnType<typeof setInterval> | null = null;
  private swId: ReturnType<typeof setInterval> | null = null;
  private swStartTime = 0;
  private swAccum = 0;
  private audioCtx: AudioContext | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly cdDisplay = computed(() => this.fmtClock(Math.max(0, this.remainingMs())));
  readonly swDisplay = computed(() => this.fmtSw(this.swMs()));
  readonly progress = computed(() => {
    const total = this.totalMs();
    if (total <= 0) return 0;
    return Math.min(100, Math.max(0, (1 - this.remainingMs() / total) * 100));
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

  setTab(tb: 'countdown' | 'stopwatch') { this.tab.set(tb); }
  setInH(v: number) { this.inH.set(this.clampNum(v, 0, 99)); }
  setInM(v: number) { this.inM.set(this.clampNum(v, 0, 59)); }
  setInS(v: number) { this.inS.set(this.clampNum(v, 0, 59)); }

  readonly presets = [1, 5, 10, 15, 25, 30, 45, 60];
  setPreset(min: number) {
    this.inH.set(0);
    this.inM.set(min);
    this.inS.set(0);
    if (this.cdState() === 'done') this.cdReset();
  }

  readonly ringC = 2 * Math.PI * 88;
  readonly ringOffset = computed(() => this.ringC * (1 - this.progress() / 100));

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.code !== 'Space') return;
    e.preventDefault();
    if (this.tab() === 'countdown') {
      const s = this.cdState();
      if (s === 'idle' || s === 'done') this.cdStart();
      else if (s === 'running') this.cdPause();
      else this.cdResume();
    } else {
      if (this.swState() === 'running') this.swPause();
      else this.swStart();
    }
  }

  private cdEndAt = 0;

  cdStart() {
    const total = (this.inH() * 3600 + this.inM() * 60 + this.inS()) * 1000;
    if (total <= 0) return;
    this.totalMs.set(total);
    this.remainingMs.set(total);
    this.cdEndAt = Date.now() + total;
    this.cdState.set('running');
    this.runCdLoop();
  }

  cdPause() {
    if (this.cdState() !== 'running') return;
    this.remainingMs.set(Math.max(0, this.cdEndAt - Date.now()));
    this.clearCd();
    this.cdState.set('paused');
  }

  cdResume() {
    if (this.cdState() !== 'paused') return;
    this.cdEndAt = Date.now() + this.remainingMs();
    this.cdState.set('running');
    this.runCdLoop();
  }

  cdReset() {
    this.clearCd();
    this.cdState.set('idle');
    this.remainingMs.set(0);
  }

  private runCdLoop() {
    this.clearCd();
    this.cdId = setInterval(() => {
      const left = this.cdEndAt - Date.now();
      if (left <= 0) {
        this.remainingMs.set(0);
        this.clearCd();
        this.cdState.set('done');
        this.beep();
      } else {
        this.remainingMs.set(left);
      }
    }, 100);
  }

  swStart() {
    if (this.swState() === 'running') return;
    this.swStartTime = performance.now();
    this.swState.set('running');
    this.swId = setInterval(() => {
      this.swMs.set(this.swAccum + (performance.now() - this.swStartTime));
    }, 50);
  }

  swPause() {
    if (this.swState() !== 'running') return;
    this.swAccum = this.swMs();
    this.clearSw();
    this.swState.set('paused');
  }

  swReset() {
    this.clearSw();
    this.swAccum = 0;
    this.swMs.set(0);
    this.laps.set([]);
    this.swState.set('idle');
  }

  swLap() {
    if (this.swState() !== 'running') return;
    this.laps.update((l) => [this.swMs(), ...l].slice(0, 50));
  }

  swClearLaps() {
    this.laps.set([]);
  }

  ngOnDestroy() {
    this.clearCd();
    this.clearSw();
    if (this.audioCtx) {
      void this.audioCtx.close();
      this.audioCtx = null;
    }
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private clearCd() {
    if (this.cdId !== null) {
      clearInterval(this.cdId);
      this.cdId = null;
    }
  }

  private clearSw() {
    if (this.swId !== null) {
      clearInterval(this.swId);
      this.swId = null;
    }
  }

  private beep() {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!this.audioCtx) this.audioCtx = new AC();
      const ctx = this.audioCtx;
      if (ctx.state === 'suspended') void ctx.resume();
      [0, 0.35, 0.7].forEach((delay) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        const at = ctx.currentTime + delay;
        gain.gain.setValueAtTime(0.001, at);
        gain.gain.exponentialRampToValueAtTime(0.4, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.3);
        osc.start(at);
        osc.stop(at + 0.32);
      });
    } catch {
      // audio not available — the visual "time's up" state still shows
    }
  }

  private fmtClock(ms: number): string {
    const totalSec = Math.ceil(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const p = (n: number) => `${n}`.padStart(2, '0');
    return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
  }

  fmtSwPublic(ms: number): string {
    return this.fmtSw(ms);
  }

  private fmtSw(ms: number): string {    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const cs = Math.floor((ms % 1000) / 10);
    const p = (n: number) => `${n}`.padStart(2, '0');
    return `${p(m)}:${p(s)}.${p(cs)}`;
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }

  private clampNum(v: number, min: number, max: number): number {
    if (!Number.isFinite(v)) return min;
    return Math.min(max, Math.max(min, Math.round(v)));
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
