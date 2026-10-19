import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-tap-tempo',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './tap-tempo.component.html',
  styleUrl: './tap-tempo.component.scss',
})
export class TapTempoComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.bpm() > 0 ? this.oneDec().format(this.bpm()) + ' ' + this.t('labels.bpmUnit') : '—');
  copyMain(): void {
    const text = this.copyText();
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

  readonly slug = 'tap-tempo';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['tone-generator', 'scale-trainer', 'ear-training', 'instrument-tuner'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly taps = signal<number[]>([]);
  readonly metronome = signal(false);
  readonly flash = signal(false);

  private audioCtx: AudioContext | null = null;
  private metroTimer: ReturnType<typeof setInterval> | null = null;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  private readonly keyHandler = (e: KeyboardEvent): void => {
    if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      this.tap();
    }
  };

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    this.document.addEventListener('keydown', this.keyHandler);
  }

  readonly intervals = computed(() => {
    const t = this.taps().slice(-9);
    const out: number[] = [];
    for (let i = 1; i < t.length; i++) out.push(t[i] - t[i - 1]);
    return out;
  });

  readonly bpm = computed(() => {
    const iv = this.intervals();
    if (iv.length === 0) return 0;
    const avg = iv.reduce((a, b) => a + b, 0) / iv.length;
    return avg > 0 ? 60000 / avg : 0;
  });

  readonly msPerBeat = computed(() => {
    const b = this.bpm();
    return b > 0 ? 60000 / b : 0;
  });

  readonly tapCount = computed(() => this.taps().length);

  readonly oneDec = computed(
    () => new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  );
  readonly zeroDec = computed(
    () => new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 0 }),
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

  tap(): void {
    const now = Date.now();
    const prev = this.taps();
    if (prev.length > 0 && now - prev[prev.length - 1] > 2500) {
      this.taps.set([now]);
    } else {
      this.taps.set([...prev.slice(-11), now]);
    }
    const active = this.document.activeElement as HTMLElement | null;
    if (active && typeof active.blur === 'function') active.blur();
    this.restartMetro();
  }

  reset(): void {
    this.taps.set([]);
    this.stopMetro();
  }

  setMetronome(v: boolean): void {
    this.metronome.set(v);
    if (v) this.restartMetro();
    else this.stopMetro();
  }

  private restartMetro(): void {
    this.stopMetro();
    if (!this.metronome()) return;
    const b = this.bpm();
    if (b <= 0) return;
    const ms = 60000 / b;
    this.metroTimer = setInterval(() => this.tick(), ms);
    this.tick();
  }

  private stopMetro(): void {
    if (this.metroTimer) {
      clearInterval(this.metroTimer);
      this.metroTimer = null;
    }
    if (this.flashTimer) {
      clearTimeout(this.flashTimer);
      this.flashTimer = null;
    }
    this.flash.set(false);
  }

  private tick(): void {
    const ctx = this.ensureCtx();
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 2000;
    const g = ctx.createGain();
    const t0 = ctx.currentTime;
    g.gain.setValueAtTime(0.15, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.08);
    this.flash.set(true);
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => this.flash.set(false), 120);
  }

  ngOnDestroy(): void {
    this.document.removeEventListener('keydown', this.keyHandler);
    this.stopMetro();
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
