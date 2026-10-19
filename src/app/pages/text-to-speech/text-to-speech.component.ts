import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const MAX_CHARS = 5000;

@Component({
  selector: 'app-text-to-speech',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './text-to-speech.component.html',
  styleUrl: './text-to-speech.component.scss',
})
export class TextToSpeechComponent implements OnDestroy {
  readonly slug = 'text-to-speech';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['subtitle-converter', 'word-counter', 'text-case-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly text = signal('');
  readonly voiceURI = signal('');
  readonly rate = signal(1);
  readonly pitch = signal(1);
  readonly volume = signal(1);
  readonly status = signal<'idle' | 'speaking' | 'paused'>('idle');
  readonly supported = signal(true);
  readonly error = signal('');

  private voicesTick = signal(0);
  private jsonLdEl: HTMLScriptElement | null = null;
  private readonly voicesHandler = () => this.voicesTick.update((n) => n + 1);

  constructor() {
    const ok = typeof window !== 'undefined' && 'speechSynthesis' in window;
    this.supported.set(ok);
    if (ok) {
      window.speechSynthesis.onvoiceschanged = this.voicesHandler;
      this.voicesTick.update((n) => n + 1);
    }
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly voices = computed((): SpeechSynthesisVoice[] => {
    this.voicesTick();
    if (!this.supported()) return [];
    const list = window.speechSynthesis.getVoices();
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly wordCount = computed(() => {
    const words = this.text().trim().split(/\s+/).filter((w) => w.length > 0);
    return this.text().trim() ? words.length : 0;
  });

  readonly estSeconds = computed(() => {
    const wpm = 150 * this.rate();
    return Math.round((this.wordCount() / Math.max(1, wpm)) * 60);
  });

  readonly statusKey = computed(() => {
    const s = this.status();
    return s === 'speaking' ? 'statusSpeaking' : s === 'paused' ? 'statusPaused' : 'statusIdle';
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

  setRate(v: number) {
    this.rate.set(this.clampNum(v, 0.5, 2));
  }
  setPitch(v: number) {
    this.pitch.set(this.clampNum(v, 0.5, 2));
  }
  setVolume(v: number) {
    this.volume.set(this.clampNum(v, 0, 1));
  }

  speak() {
    if (!this.supported()) {
      this.error.set(this.t('labels.errUnsupported'));
      return;
    }
    const text = this.text().trim().slice(0, MAX_CHARS);
    if (!text) {
      this.error.set(this.t('labels.errEmpty'));
      return;
    }
    this.error.set('');
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = this.voices().find((v) => v.voiceURI === this.voiceURI());
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    utterance.rate = this.rate();
    utterance.pitch = this.pitch();
    utterance.volume = this.volume();
    utterance.onend = () => this.status.set('idle');
    utterance.onerror = () => this.status.set('idle');
    this.status.set('speaking');
    synth.speak(utterance);
  }

  pause() {
    if (this.supported() && this.status() === 'speaking') {
      window.speechSynthesis.pause();
      this.status.set('paused');
    }
  }

  resume() {
    if (this.supported() && this.status() === 'paused') {
      window.speechSynthesis.resume();
      this.status.set('speaking');
    }
  }

  stop() {
    if (this.supported()) window.speechSynthesis.cancel();
    this.status.set('idle');
  }

  voiceLabel(v: SpeechSynthesisVoice): string {
    return `${v.name} (${v.lang})`;
  }

  trackVoice(_: number, v: SpeechSynthesisVoice): string {
    return v.voiceURI;
  }

  ngOnDestroy() {
    if (this.supported()) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.onvoiceschanged = null;
    }
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
    return Math.min(max, Math.max(min, Math.round(v * 100) / 100));
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
