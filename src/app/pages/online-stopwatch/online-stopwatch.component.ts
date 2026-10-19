import { Component, computed, effect, HostListener, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface LapRow { n: number; lap: number; total: number; }

@Component({
  selector: 'app-online-stopwatch',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './online-stopwatch.component.html',
  styleUrl: './online-stopwatch.component.scss',
})
export class OnlineStopwatchComponent implements OnDestroy {
  readonly slug = 'online-stopwatch';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['pomodoro-timer', 'online-timer', 'time-card-calculator', 'birthday-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  // Timestamp-anchored timing: elapsed is recomputed from performance.now()
  // so the watch stays accurate in background tabs.
  readonly elapsedMs = signal(0);
  readonly running = signal(false);
  readonly laps = signal<LapRow[]>([]);
  readonly copied = signal(false);
  readonly isFullscreen = signal(false);
  private startEpoch = 0;
  private tickId: ReturnType<typeof setInterval> | null = null;
  private readonly tickNudge = signal(0);
  private readonly onFsChange = () => this.isFullscreen.set(this.document.fullscreenElement != null);

  startWatch(): void {
    if (this.running()) return;
    this.startEpoch = performance.now();
    this.running.set(true);
    this.ensureTick();
  }
  pauseWatch(): void {
    if (!this.running()) return;
    this.elapsedMs.set(this.liveMs());
    this.running.set(false);
    this.stopTick();
  }
  resetWatch(): void {
    this.running.set(false);
    this.stopTick();
    this.elapsedMs.set(0);
    this.laps.set([]);
    this.tickNudge.update((n) => n + 1);
  }
  toggleWatch(): void {
    if (this.running()) this.pauseWatch();
    else this.startWatch();
  }
  addLap(): void {
    if (!this.running()) return;
    const total = Math.round(this.liveMs());
    const prev = this.laps().length ? this.laps()[this.laps().length - 1].total : 0;
    const n = this.laps().length + 1;
    this.laps.update((l) => [...l, { n, lap: total - prev, total }]);
  }
  toggleFullscreen(): void {
    const el = this.document.getElementById('stopwatch-stage');
    if (!el) return;
    if (this.document.fullscreenElement) {
      this.document.exitFullscreen().catch(() => undefined);
    } else {
      el.requestFullscreen?.().catch(() => undefined);
    }
  }
  exportLaps(): void {
    const lines = this.laps().map(
      (r) => `Lap ${r.n}: ${this.fmtMs(r.lap)} (total ${this.fmtMs(r.total)})`,
    );
    const text = [`Stopwatch: ${this.fmtMs(this.liveMs())}`, ...lines].join('\n');
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

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      this.toggleWatch();
    } else if (e.key === 'l' || e.key === 'L') {
      this.addLap();
    } else if (e.key === 'r' || e.key === 'R') {
      this.resetWatch();
    } else if (e.key === 'f' || e.key === 'F') {
      this.toggleFullscreen();
    }
  }

  private liveMs(): number {
    return this.elapsedMs() + (this.running() ? performance.now() - this.startEpoch : 0);
  }
  private ensureTick(): void {
    if (this.tickId === null) {
      this.tickId = setInterval(() => this.tickNudge.update((n) => n + 1), 47);
    }
  }
  private stopTick(): void {
    if (this.tickId !== null) {
      clearInterval(this.tickId);
      this.tickId = null;
    }
  }
  fmtMs(ms: number): string {
    const cs = Math.floor(ms / 10);
    const m = Math.floor(cs / 6000);
    const s = Math.floor((cs % 6000) / 100);
    const c = cs % 100;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(m)}:${pad(s)}.${pad(c)}`;
  }
  readonly display = computed(() => {
    this.tickNudge();
    return this.fmtMs(this.liveMs());
  });
  readonly fastestN = computed(() => {
    const l = this.laps();
    if (!l.length) return -1;
    let bi = 0;
    l.forEach((r, i) => { if (r.lap < l[bi].lap) bi = i; });
    return l[bi].n;
  });
  readonly slowestN = computed(() => {
    const l = this.laps();
    if (!l.length) return -1;
    let bi = 0;
    l.forEach((r, i) => { if (r.lap > l[bi].lap) bi = i; });
    return l[bi].n;
  });
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang(); // re-run on language change
      this.updateSeo();
      this.refreshJsonLd();
    });
    this.document.addEventListener('fullscreenchange', this.onFsChange);
  }

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


  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
    this.stopTick();
    this.document.removeEventListener('fullscreenchange', this.onFsChange);
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
  private parseLocalDate(s: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return null;
    return d;
  }
  private fmtDate(d: Date): string {
    return new Intl.DateTimeFormat(this.locale(), { dateStyle: 'full' }).format(d);
  }
  private fmtWeekday(d: Date): string {
    return new Intl.DateTimeFormat(this.locale(), { weekday: 'long' }).format(d);
  }
  private isoDate(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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
