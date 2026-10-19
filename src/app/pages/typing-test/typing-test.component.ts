import { Component, computed, effect, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type Phase = 'idle' | 'running' | 'done';

@Component({
  selector: 'app-typing-test',
  standalone: true,
  imports: [IconComponent, RouterLink],
  templateUrl: './typing-test.component.html',
  styleUrl: './typing-test.component.scss',
})
export class TypingTestComponent implements OnDestroy {
  readonly slug = 'typing-test';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['online-whiteboard', 'flyer-maker'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly arena = viewChild<ElementRef<HTMLDivElement>>('arena');

  readonly duration = signal(60);
  readonly sampleIndex = signal(0);
  readonly phase = signal<Phase>('idle');
  readonly typed = signal('');
  readonly keystrokes = signal(0);
  readonly errors = signal(0);
  readonly elapsed = signal(0);

  private jsonLdEl: HTMLScriptElement | null = null;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private startEpoch = 0;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly samples = computed(() => {
    this.translate.lang();
    const raw = this.lookup('labels.samples');
    return Array.isArray(raw) ? (raw as string[]) : [];
  });

  readonly sample = computed(() => {
    const s = this.samples();
    if (s.length === 0) return '';
    return s[this.sampleIndex() % s.length];
  });

  readonly durationOptions = [15, 30, 60, 120];

  readonly correctChars = computed(() => {
    const target = this.sample();
    const t = this.typed();
    let correct = 0;
    for (let i = 0; i < t.length && i < target.length; i++) {
      if (t[i] === target[i]) correct++;
    }
    return correct;
  });

  readonly minutes = computed(() => Math.max(this.elapsed() / 60, 1 / 60));

  readonly wpm = computed(() => Math.round((this.correctChars() / 5) / this.minutes()));

  readonly accuracy = computed(() => {
    const k = this.keystrokes();
    if (k === 0) return 100;
    return Math.max(0, Math.round(((k - this.errors()) / k) * 100));
  });

  readonly remaining = computed(() => Math.max(0, this.duration() - this.elapsed()));

  readonly timeProgress = computed(() =>
    Math.min(100, Math.max(0, (this.elapsed() / Math.max(1, this.duration())) * 100))
  );

  readonly copied = signal(false);
  copyScore(): void {
    const text = `${this.t('name')}: ${this.wpm()} WPM, ${this.accuracy()}% ${this.t('labels.finalAcc')}`;
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

  charClass(i: number): string {
    const target = this.sample();
    const t = this.typed();
    if (i >= t.length) return i === t.length && this.phase() === 'running' ? 'current' : 'pending';
    return t[i] === target[i] ? 'correct' : 'wrong';
  }

  onKeyDown(e: KeyboardEvent) {
    if (this.phase() === 'done') return;
    if (e.key === 'Tab') { e.preventDefault(); return; }
    if (this.phase() === 'idle') this.startTest();
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (this.typed().length > 0) this.typed.update((t) => t.slice(0, -1));
      return;
    }
    if (e.key.length !== 1) return;
    e.preventDefault();
    const target = this.sample();
    const pos = this.typed().length;
    if (pos >= target.length) return;
    this.keystrokes.update((k) => k + 1);
    if (e.key !== target[pos]) this.errors.update((n) => n + 1);
    this.typed.update((t) => t + e.key);
    if (this.typed().length >= target.length) this.finishTest();
  }

  private startTest() {
    this.phase.set('running');
    this.startEpoch = Date.now();
    this.timerId = setInterval(() => {
      const s = Math.floor((Date.now() - this.startEpoch) / 1000);
      this.elapsed.set(s);
      if (s >= this.duration()) this.finishTest();
    }, 250);
  }

  private finishTest() {
    if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
    this.phase.set('done');
  }

  reset() {
    if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
    this.phase.set('idle');
    this.typed.set('');
    this.keystrokes.set(0);
    this.errors.set(0);
    this.elapsed.set(0);
    this.arena()?.nativeElement.focus();
  }

  setDuration(v: number) { this.duration.set(v); this.reset(); }
  nextSample() {
    const n = this.samples().length;
    if (n > 0) this.sampleIndex.set((this.sampleIndex() + 1) % n);
    this.reset();
  }
  focusArena() { this.arena()?.nativeElement.focus(); }

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
    if (this.timerId) clearInterval(this.timerId);
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
