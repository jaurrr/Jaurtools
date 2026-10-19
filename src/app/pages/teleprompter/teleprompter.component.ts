import { Component, computed, effect, inject, signal, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

@Component({
  selector: 'app-teleprompter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './teleprompter.component.html',
  styleUrl: './teleprompter.component.scss',
})
export class TeleprompterComponent implements OnDestroy {
  readonly slug = 'teleprompter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['online-text-editor', 'token-counter', 'text-repeater'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  @ViewChild('stage') stageRef?: ElementRef<HTMLDivElement>;

  readonly script = signal('');
  readonly mode = signal<'edit' | 'prompt'>('edit');
  readonly playing = signal(false);
  readonly speed = signal(3);
  readonly fontSize = signal(32);
  readonly flipped = signal(false);

  private timer: number | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly wordCount = computed(() => this.countWords(this.script()));
  private segmenter: Intl.Segmenter | null | undefined;

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

  readonly rawScript = signal('');
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  setScript(v: string) {
    const val = v.slice(0, 100000);
    this.rawScript.set(val);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.script.set(val), 250);
  }

  private countWords(value: string): number {
    const seg = this.getSegmenter();
    if (!seg) {
      const t = value.trim();
      return t === '' ? 0 : t.split(/\s+/).length;
    }
    let n = 0;
    for (const part of seg.segment(value)) {
      if (part.isWordLike) n++;
    }
    return n;
  }

  private getSegmenter(): Intl.Segmenter | null {
    if (this.segmenter === undefined) {
      try {
        const lang = this.translate.lang();
        const tag = lang === 'hi' ? 'hi' : lang === 'ar' ? 'ar' : 'en';
        this.segmenter = new Intl.Segmenter(tag, { granularity: 'word' });
      } catch {
        this.segmenter = null;
      }
    }
    return this.segmenter;
  }

  startPrompt() {
    if (!this.script().trim()) return;
    this.mode.set('prompt');
    this.playing.set(false);
    setTimeout(() => {
      const el = this.stageRef?.nativeElement;
      if (el) el.scrollTop = 0;
    }, 0);
  }

  backToEdit() {
    this.pause();
    this.mode.set('edit');
  }

  togglePlay() {
    if (this.playing()) this.pause();
    else this.play();
  }

  play() {
    const el = this.stageRef?.nativeElement;
    if (!el) return;
    this.playing.set(true);
    this.stopTimer();
    this.timer = window.setInterval(() => {
      const stage = this.stageRef?.nativeElement;
      if (!stage) return;
      stage.scrollTop += this.speed();
      if (stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 2) {
        this.pause();
      }
    }, 50);
  }

  pause() {
    this.playing.set(false);
    this.stopTimer();
  }

  private stopTimer() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  setSpeed(v: number) { this.speed.set(Math.min(10, Math.max(1, Math.round(v)))); }
  increaseFont() { this.fontSize.update((v) => Math.min(72, v + 4)); }
  decreaseFont() { this.fontSize.update((v) => Math.max(16, v - 4)); }
  toggleFlip() { this.flipped.update((v) => !v); }

  ngOnDestroy() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.stopTimer();
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
