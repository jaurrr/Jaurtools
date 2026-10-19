import { Component, computed, effect, HostListener, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const SAMPLE_TEXT =
  'Speed reading with RSVP shows you one word at a time, right where your eyes already look. ' +
  'Because your eyes never move, you can read much faster than normal. Start at two hundred and fifty ' +
  'words per minute, then raise the speed a little each day. Your brain adapts quickly, and soon ' +
  'three hundred words per minute will feel comfortable. Paste any article above and press play.';

@Component({
  selector: 'app-speed-reader',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './speed-reader.component.html',
  styleUrl: './speed-reader.component.scss',
})
export class SpeedReaderComponent implements OnDestroy {
  readonly slug = 'speed-reader';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['kindle-highlights-exporter', 'online-notepad', 'keyword-density-checker'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly text = signal(SAMPLE_TEXT);
  readonly wpm = signal(250);
  readonly playing = signal(false);
  readonly index = signal(0);

  private jsonLdEl: HTMLScriptElement | null = null;
  private timerId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    this.document.addEventListener('fullscreenchange', this.onFsChange);
  }

  readonly words = computed(() => this.text().split(/\s+/).filter((w) => w.length > 0));
  readonly wordCount = computed(() => this.words().length);

  readonly parts = computed(() => {
    const ws = this.words();
    if (ws.length === 0) return { left: '', pivot: '', right: '' };
    const word = ws[Math.min(this.index(), ws.length - 1)];
    const p = word.length <= 1 ? 0 : word.length <= 5 ? 1 : word.length <= 9 ? 2 : word.length <= 13 ? 3 : 4;
    return { left: word.slice(0, p), pivot: word[p] || '', right: word.slice(p + 1) };
  });

  readonly progress = computed(() => {
    const total = this.wordCount();
    if (total === 0) return 0;
    return Math.min(100, (this.index() / total) * 100);
  });

  readonly timeLeft = computed(() => {
    const remaining = Math.max(0, this.wordCount() - this.index());
    const secs = Math.ceil((remaining / Math.max(60, this.wpm())) * 60);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m + ':' + String(s).padStart(2, '0');
  });

  readonly position = computed(() =>
    Math.min(this.index() + 1, Math.max(1, this.wordCount()))
  );

  readonly oneDecimal = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  );

  setText(v: string): void {
    this.text.set(v.slice(0, 100000));
    this.pause();
    this.index.set(0);
  }

  loadSample(): void {
    this.setText(SAMPLE_TEXT);
  }

  setWpm(v: number): void {
    const next = this.clampNum(v, 60, 1000);
    this.wpm.set(next);
    if (this.playing()) this.restartTimer();
  }

  play(): void {
    if (this.wordCount() === 0) return;
    if (this.index() >= this.wordCount()) this.index.set(0);
    this.playing.set(true);
    this.restartTimer();
  }

  pause(): void {
    this.playing.set(false);
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  restart(): void {
    this.pause();
    this.index.set(0);
  }

  private restartTimer(): void {
    if (this.timerId) clearTimeout(this.timerId);
    const tick = (): void => {
      if (!this.playing()) return;
      if (this.index() >= this.wordCount() - 1) {
        this.index.set(this.wordCount());
        this.pause();
        return;
      }
      this.index.update((i) => i + 1);
      this.timerId = setTimeout(tick, 60000 / this.wpm());
    };
    this.timerId = setTimeout(tick, 60000 / this.wpm());
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

  ngOnDestroy(): void {
    this.pause();
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
    this.document.removeEventListener('fullscreenchange', this.onFsChange);
  }

  readonly isFullscreen = signal(false);
  private readonly onFsChange = () => this.isFullscreen.set(this.document.fullscreenElement != null);

  toggleFullscreen(): void {
    const el = this.document.getElementById('reader-stage');
    if (!el) return;
    if (this.document.fullscreenElement) {
      this.document.exitFullscreen().catch(() => undefined);
    } else {
      el.requestFullscreen?.().catch(() => undefined);
    }
  }

  readonly bubbleLeft = computed(() => ((this.wpm() - 60) / (1000 - 60)) * 100);

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (this.playing()) this.pause();
      else if (this.wordCount() > 0) this.play();
    } else if (e.key === 'ArrowRight') {
      this.setWpm(this.wpm() + 10);
    } else if (e.key === 'ArrowLeft') {
      this.setWpm(this.wpm() - 10);
    } else if (e.key === 'f' || e.key === 'F') {
      this.toggleFullscreen();
    }
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
