import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-pomodoro-timer',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './pomodoro-timer.component.html',
  styleUrl: './pomodoro-timer.component.scss',
})
export class PomodoroTimerComponent implements OnDestroy {
  readonly slug = 'pomodoro-timer';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['online-stopwatch', 'online-timer', 'time-card-calculator', 'birthday-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly focusLen = signal(25);
  readonly shortLen = signal(5);
  readonly longLen = signal(15);
  readonly cycles = signal(4);
  readonly phase = signal<'idle' | 'focus' | 'short' | 'long'>('idle');
  readonly remaining = signal(0);
  readonly running = signal(false);
  readonly completed = signal(0);
  private timerId: ReturnType<typeof setInterval> | null = null;

  setFocusLen(v: number) { this.focusLen.set(this.clampNum(v, 1, 180)); }
  setShortLen(v: number) { this.shortLen.set(this.clampNum(v, 1, 60)); }
  setLongLen(v: number) { this.longLen.set(this.clampNum(v, 1, 90)); }
  setCycles(v: number) { this.cycles.set(this.clampNum(v, 2, 8)); }

  readonly total = computed(() => {
    const p = this.phase();
    if (p === 'focus') return this.focusLen() * 60;
    if (p === 'short') return this.shortLen() * 60;
    if (p === 'long') return this.longLen() * 60;
    return 0;
  });
  readonly display = computed(() => {
    const r = Math.max(0, this.remaining());
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(Math.floor(r / 60))}:${pad(r % 60)}`;
  });
  readonly progress = computed(() => {
    const t = this.total();
    return t > 0 ? (1 - this.remaining() / t) * 100 : 0;
  });
  readonly phaseLabel = computed(() => {
    const p = this.phase();
    if (p === 'focus') return this.t('labels.phaseFocus');
    if (p === 'short') return this.t('labels.phaseShort');
    if (p === 'long') return this.t('labels.phaseLong');
    return this.t('labels.phaseIdle');
  });
  readonly cyclePos = computed(() => (this.completed() % this.cycles()) + 1);

  startTimer() {
    if (this.phase() === 'idle') {
      this.phase.set('focus');
      this.remaining.set(this.focusLen() * 60);
    }
    this.running.set(true);
    this.ensureTick();
  }
  pauseTimer() {
    this.running.set(false);
    this.stopTick();
  }
  resetTimer() {
    this.running.set(false);
    this.stopTick();
    this.phase.set('idle');
    this.remaining.set(0);
    this.completed.set(0);
  }
  private ensureTick() {
    if (this.timerId === null) this.timerId = setInterval(() => this.tick(), 1000);
  }
  private stopTick() {
    if (this.timerId !== null) { clearInterval(this.timerId); this.timerId = null; }
  }
  private tick() {
    if (!this.running()) return;
    const r = this.remaining() - 1;
    if (r > 0) { this.remaining.set(r); return; }
    this.advance();
  }
  private advance() {
    const p = this.phase();
    if (p === 'focus') {
      const c = this.completed() + 1;
      this.completed.set(c);
      if (c % this.cycles() === 0) {
        this.phase.set('long');
        this.remaining.set(this.longLen() * 60);
      } else {
        this.phase.set('short');
        this.remaining.set(this.shortLen() * 60);
      }
    } else if (p === 'short' || p === 'long') {
      this.phase.set('focus');
      this.remaining.set(this.focusLen() * 60);
    } else {
      this.stopTick();
      this.running.set(false);
    }
  }
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang(); // re-run on language change
      this.updateSeo();
      this.refreshJsonLd();
    });
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
    if (this.timerId !== null) { clearInterval(this.timerId); }
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
