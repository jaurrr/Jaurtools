import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type Channel = 'left' | 'right' | 'center';
const TONE_SECONDS = 5;
const SWEEP_SECONDS = 20;

@Component({
  selector: 'app-speaker-test',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './speaker-test.component.html',
  styleUrl: './speaker-test.component.scss',
})
export class SpeakerTestComponent implements OnDestroy {
  readonly slug = 'speaker-test';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['mic-test', 'speaker-cleaner', 'webcam-test', 'device-test'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly freq = signal(440);
  readonly volume = signal(70);
  readonly channel = signal<Channel>('center');
  readonly playing = signal(false);
  readonly sweepProgress = signal(0);

  private ctx: AudioContext | null = null;
  private stopId: ReturnType<typeof setTimeout> | null = null;
  private progId: ReturnType<typeof setInterval> | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly frequencies = [100, 440, 1000, 8000];

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

  setFreq(f: number) { this.freq.set(f); }
  setChannel(c: Channel) { this.channel.set(c); }
  setVolume(v: number) {
    if (!Number.isFinite(v)) return;
    this.volume.set(Math.min(100, Math.max(0, Math.round(v))));
  }

  playTone() {
    this.stopAll();
    const ctx = new AudioContext();
    this.ctx = ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = this.freq();
    const gain = ctx.createGain();
    gain.gain.value = (this.volume() / 100) * 0.5;
    const pan = ctx.createStereoPanner();
    pan.pan.value = this.channel() === 'left' ? -1 : this.channel() === 'right' ? 1 : 0;
    osc.connect(gain).connect(pan).connect(ctx.destination);
    osc.start();
    this.playing.set(true);
    this.scheduleStop(TONE_SECONDS);
  }

  playSweep() {
    this.stopAll();
    const ctx = new AudioContext();
    this.ctx = ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(8000, now + SWEEP_SECONDS);
    const gain = ctx.createGain();
    gain.gain.value = (this.volume() / 100) * 0.4;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    this.playing.set(true);
    this.sweepProgress.set(0);
    const started = Date.now();
    this.progId = setInterval(() => {
      const p = Math.min(100, ((Date.now() - started) / (SWEEP_SECONDS * 1000)) * 100);
      this.sweepProgress.set(Math.round(p));
    }, 200);
    this.scheduleStop(SWEEP_SECONDS);
  }

  stopAll() {
    if (this.stopId) clearTimeout(this.stopId);
    if (this.progId) clearInterval(this.progId);
    this.stopId = null;
    this.progId = null;
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
    this.playing.set(false);
    this.sweepProgress.set(0);
  }

  private scheduleStop(seconds: number) {
    this.stopId = setTimeout(() => this.stopAll(), seconds * 1000);
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
