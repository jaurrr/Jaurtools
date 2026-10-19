import { Component, computed, effect, inject, signal, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

type HandStyle = 'classic' | 'casual' | 'elegant';

const FONTS: Record<HandStyle, string> = {
  classic: "'Segoe Script','Bradley Hand','Chalkboard SE','Segoe Print','Comic Sans MS',cursive",
  casual: "'Comic Sans MS','Chalkboard SE','Segoe Print',cursive",
  elegant: "'Snell Roundhand','Brush Script MT','Segoe Script',cursive",
};

@Component({
  selector: 'app-text-to-handwriting',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './text-to-handwriting.component.html',
  styleUrl: './text-to-handwriting.component.scss',
})
export class TextToHandwritingComponent implements AfterViewInit, OnDestroy {
  readonly slug = 'text-to-handwriting';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['fancy-text-generator', 'online-text-editor', 'text-repeater'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  @ViewChild('paper') paperRef?: ElementRef<HTMLCanvasElement>;

  readonly text = signal('Dear diary,\nToday was a good day.');
  readonly style = signal<HandStyle>('classic');
  readonly ink = signal('#1e3a8a');
  readonly size = signal(48);
  readonly ruled = signal(true);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  ngAfterViewInit() {
    this.render();
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

  setText(v: string): void {
    this.text.set(v.slice(0, 2000));
    this.scheduleRender();
  }

  /** Debounced canvas re-render so typing stays smooth. */
  private renderTimer: ReturnType<typeof setTimeout> | null = null;

  private scheduleRender(): void {
    if (this.renderTimer) clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => this.render(), 250);
  }
  setStyle(v: HandStyle) { this.style.set(v); this.render(); }
  setInk(v: string) { this.ink.set(v); this.render(); }
  setSize(v: number) {
    if (!Number.isFinite(v)) v = 48;
    this.size.set(Math.min(96, Math.max(24, Math.round(v))));
    this.render();
  }
  toggleRuled() { this.ruled.update((v) => !v); this.render(); }

  downloadPng() {
    this.render();
    const canvas = this.paperRef?.nativeElement;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'handwriting.png';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
  }

  private render() {
    const canvas = this.paperRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size = this.size();
    const lineH = Math.round(size * 1.7);
    const W = 1240;
    const pad = 60;
    const maxW = W - pad * 2 - 80;
    ctx.font = `${size}px ${FONTS[this.style()]}`;

    const lines: string[] = [];
    for (const para of this.text().split('\n')) {
      if (!para) { lines.push(''); continue; }
      let cur = '';
      for (const word of para.split(/\s+/)) {
        const trial = cur ? `${cur} ${word}` : word;
        if (ctx.measureText(trial).width > maxW && cur) {
          lines.push(cur);
          cur = word;
        } else {
          cur = trial;
        }
      }
      lines.push(cur);
    }
    if (!lines.length) lines.push('');

    const H = pad * 2 + lines.length * lineH + 20;
    canvas.width = W;
    canvas.height = H;

    ctx.fillStyle = '#fffdf5';
    ctx.fillRect(0, 0, W, H);

    if (this.ruled()) {
      ctx.strokeStyle = '#bfdbfe';
      ctx.lineWidth = 2;
      for (let y = pad + Math.round(lineH * 0.78); y < H - 10; y += lineH) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      ctx.strokeStyle = '#fca5a5';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(pad + 30, 0);
      ctx.lineTo(pad + 30, H);
      ctx.stroke();
    }

    ctx.font = `${size}px ${FONTS[this.style()]}`;
    ctx.fillStyle = this.ink();
    ctx.textBaseline = 'alphabetic';
    lines.forEach((line, i) => {
      ctx.fillText(line, pad + 50, pad + i * lineH + Math.round(lineH * 0.62));
    });
  }

  ngOnDestroy() {
    if (this.renderTimer) clearTimeout(this.renderTimer);
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
