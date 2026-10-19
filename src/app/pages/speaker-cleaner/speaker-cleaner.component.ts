import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type CleanPattern = 'eject' | 'dust';
const DURATIONS: Record<CleanPattern, number> = { eject: 30, dust: 20 };

@Component({
  selector: 'app-speaker-cleaner',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './speaker-cleaner.component.html',
  styleUrl: './speaker-cleaner.component.scss',
})
export class SpeakerCleanerComponent implements OnDestroy {
  readonly slug = 'speaker-cleaner';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['speaker-test', 'mic-test', 'device-test', 'webcam-test'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly pattern = signal<CleanPattern>('eject');
  readonly volume = signal(80);
  readonly running = signal(false);
  readonly elapsed = signal(0);
  readonly finished = signal(false);

  private ctx: AudioContext | null = null;
  private tickId: ReturnType<typeof setInterval> | null = null;
  private endId: ReturnType<typeof setTimeout> | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly duration = computed(() => DURATIONS[this.pattern()]);
  readonly progress = computed(() =>
    this.duration() === 0 ? 0 : Math.min(100, Math.round((this.elapsed() / this.duration()) * 100))
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

  setPattern(p: CleanPattern) {
    if (this.running()) return;
    this.pattern.set(p);
    this.finished.set(false);
    this.elapsed.set(0);
  }

  setVolume(v: number) {
    if (!Number.isFinite(v)) return;
    this.volume.set(Math.min(100, Math.max(0, Math.round(v))));
  }

  startCleaning() {
    this.stopAll();
    const ctx = new AudioContext();
    this.ctx = ctx;
    const gain = ctx.createGain();
    gain.gain.value = (this.volume() / 100) * 0.6;
    gain.connect(ctx.destination);

    if (this.pattern() === 'eject') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 165;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 4;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.35;
      lfo.connect(lfoGain).connect(gain.gain);
      osc.connect(gain);
      osc.start();
      lfo.start();
    } else {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(12000, now + DURATIONS.dust);
      osc.connect(gain);
      osc.start();
    }

    this.running.set(true);
    this.finished.set(false);
    this.elapsed.set(0);
    const started = Date.now();
    const total = DURATIONS[this.pattern()];
    this.tickId = setInterval(() => {
      this.elapsed.set(Math.min(total, Math.round((Date.now() - started) / 1000)));
    }, 250);
    this.endId = setTimeout(() => {
      this.stopAll();
      this.finished.set(true);
    }, total * 1000);
  }

  stopAll() {
    if (this.tickId) clearInterval(this.tickId);
    if (this.endId) clearTimeout(this.endId);
    this.tickId = null;
    this.endId = null;
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
    this.running.set(false);
  }

  ngOnDestroy() {
    this.stopAll();
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
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
