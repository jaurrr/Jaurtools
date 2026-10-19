import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT, UpperCasePipe } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface Cue {
  start: number;
  end: number;
  text: string[];
}

const MAX_CHARS = 500000;

@Component({
  selector: 'app-subtitle-converter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, UpperCasePipe],
  templateUrl: './subtitle-converter.component.html',
  styleUrl: './subtitle-converter.component.scss',
})
export class SubtitleConverterComponent implements OnDestroy {
  readonly slug = 'subtitle-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['text-to-speech', 'word-counter', 'text-case-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly inputText = signal('');
  readonly direction = signal<'auto' | 'srt2vtt' | 'vtt2srt'>('auto');
  readonly shiftMs = signal(0);
  readonly stripTags = signal(false);
  readonly copied = signal(false);
  readonly fileName = signal('');
  readonly error = signal('');

  private copyTimer: number | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly detected = computed((): 'srt' | 'vtt' | 'unknown' | '' => {
    const text = this.inputText().trim();
    if (!text) return '';
    if (/^WEBVTT/m.test(text)) return 'vtt';
    if (/-->/.test(text) && /\d{2}:\d{2}:\d{2},\d{2,3}\s*-->/.test(text)) return 'srt';
    if (/-->/.test(text)) return 'srt';
    return 'unknown';
  });

  readonly effectiveDirection = computed((): 'srt2vtt' | 'vtt2srt' | null => {
    const d = this.direction();
    if (d !== 'auto') return d;
    const det = this.detected();
    if (det === 'srt') return 'srt2vtt';
    if (det === 'vtt') return 'vtt2srt';
    return null;
  });

  readonly cues = computed((): Cue[] => this.parseCues(this.inputText()));

  readonly outputText = computed(() => {
    const dir = this.effectiveDirection();
    if (!dir) return '';
    const fmt = dir === 'srt2vtt' ? 'vtt' : 'srt';
    const shift = this.shiftMs();
    const strip = this.stripTags();
    const cues = this.cues().map((c) => {
      let start = Math.max(0, Math.round(c.start + shift));
      let end = Math.max(0, Math.round(c.end + shift));
      if (end <= start) end = start + 100;
      const text = strip ? c.text.map((l) => l.replace(/<[^>]*>/g, '').trim()) : c.text;
      return { start, end, text: text.filter((l) => l.length > 0) };
    }).filter((c) => c.text.length > 0);
    const out: string[] = [];
    if (fmt === 'vtt') out.push('WEBVTT', '');
    cues.forEach((c, i) => {
      if (fmt === 'srt') out.push(String(i + 1));
      out.push(`${this.formatTime(c.start, fmt)} --> ${this.formatTime(c.end, fmt)}`);
      out.push(...c.text);
      out.push('');
    });
    return out.length ? out.join('\n') : '';
  });

  readonly outputExt = computed(() => (this.effectiveDirection() === 'srt2vtt' ? '.vtt' : '.srt'));

  readonly charCount = computed(() => this.inputText().length);

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

  setDirection(d: 'auto' | 'srt2vtt' | 'vtt2srt') {
    this.direction.set(d);
  }
  setShift(v: number) {
    this.shiftMs.set(this.clampNum(v, -3600000, 3600000));
  }
  toggleStrip() {
    this.stripTags.set(!this.stripTags());
  }
  clear() {
    this.inputText.set('');
    this.fileName.set('');
    this.error.set('');
    this.copied.set(false);
  }

  onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    this.error.set('');
    if (!file) return;
    if (!/\.(srt|vtt|ass|ssa|txt)$/i.test(file.name)) {
      this.error.set(this.t('labels.errType'));
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      if (text.length > MAX_CHARS) {
        this.error.set(this.t('labels.errSize'));
        return;
      }
      this.fileName.set(file.name);
      this.inputText.set(text);
    };
    reader.onerror = () => this.error.set(this.t('labels.errRead'));
    reader.readAsText(file);
    input.value = '';
  }

  async copy() {
    const text = this.outputText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text).catch(() => undefined);
    } catch {
      const ta = this.document.createElement('textarea');
      ta.value = text;
      this.document.body.appendChild(ta);
      ta.select();
      this.document.execCommand('copy');
      ta.remove();
    }
    this.copied.set(true);
    if (this.copyTimer !== null) window.clearTimeout(this.copyTimer);
    this.copyTimer = window.setTimeout(() => this.copied.set(false), 2000);
  }

  download() {
    const text = this.outputText();
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = `subtitles${this.outputExt()}`;
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  private parseCues(text: string): Cue[] {
    const normalized = text.replace(/\r/g, '').replace(/^\uFEFF/, '');
    const blocks = normalized.split(/\n{2,}/);
    const cues: Cue[] = [];
    for (const block of blocks) {
      const lines = block.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
      if (!lines.length) continue;
      const ti = lines.findIndex((l) => l.includes('-->'));
      if (ti < 0) continue;
      const tm = lines[ti].match(/(.+?)\s*-->\s*(.+)/);
      if (!tm) continue;
      const start = this.parseTime(tm[1]);
      const end = this.parseTime(tm[2].split(/\s+/)[0]);
      if (start === null || end === null) continue;
      const textLines = lines.slice(ti + 1).filter((l) => !/^\d+$/.test(l));
      if (!textLines.length) continue;
      cues.push({ start, end, text: textLines });
    }
    cues.sort((a, b) => a.start - b.start);
    return cues;
  }

  private parseTime(t: string): number | null {
    const m = t.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/);
    if (!m) return null;
    const h = m[1] ? parseInt(m[1], 10) : 0;
    const min = parseInt(m[2], 10);
    const s = parseInt(m[3], 10);
    const ms = parseInt((m[4] + '000').slice(0, 3), 10);
    if (min > 59 || s > 59) return null;
    return (h * 3600 + min * 60 + s) * 1000 + ms;
  }

  private formatTime(ms: number, fmt: 'srt' | 'vtt'): string {
    ms = Math.max(0, Math.round(ms));
    const h = Math.floor(ms / 3600000);
    const min = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const mss = ms % 1000;
    const pad = (n: number, l = 2) => String(n).padStart(l, '0');
    return `${pad(h)}:${pad(min)}:${pad(s)}${fmt === 'srt' ? ',' : '.'}${pad(mss, 3)}`;
  }

  ngOnDestroy() {
    if (this.copyTimer !== null) window.clearTimeout(this.copyTimer);
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
