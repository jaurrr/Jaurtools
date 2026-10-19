import {
  AfterViewInit,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

interface Pt {
  x: number;
  y: number;
}

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?\'-';

@Component({
  selector: 'app-handwriting-to-font-converter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './handwriting-to-font-converter.component.html',
  styleUrl: './handwriting-to-font-converter.component.scss',
})
export class HandwritingToFontConverterComponent implements OnDestroy, AfterViewInit {
  readonly slug = 'handwriting-to-font-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['logo-maker', 'ascii-art-generator', 'case-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly glyphs = GLYPHS.split('');
  readonly glyphIndex = signal(0);
  readonly penWidth = signal(5);
  readonly penColor = signal('#0f172a');
  readonly previewText = signal('Hello World');
  readonly previewSize = signal(56);
  readonly strokesVersion = signal(0);

  private padRef = viewChild<ElementRef<HTMLCanvasElement>>('pad');
  private previewRef = viewChild<ElementRef<HTMLCanvasElement>>('preview');

  private strokes: Record<string, Pt[][]> = {};
  private drawing = false;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly currentChar = computed(() => this.glyphs[this.glyphIndex()]);

  readonly drawnCount = computed(() => {
    this.strokesVersion();
    return this.glyphs.filter((g) => (this.strokes[g]?.length ?? 0) > 0).length;
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

  isDrawn(g: string): boolean {
    this.strokesVersion();
    return (this.strokes[g]?.length ?? 0) > 0;
  }

  selectGlyph(i: number) {
    this.glyphIndex.set(i);
    this.drawPad();
  }
  setPenWidth(v: number) {
    this.penWidth.set(this.clampNum(v, 1, 12));
  }
  setPenColor(v: string) {
    this.penColor.set(v);
    this.drawPad();
  }
  setPreviewText(v: string) {
    this.previewText.set(v);
    this.drawPreview();
  }
  setPreviewSize(v: number) {
    this.previewSize.set(this.clampNum(v, 24, 96));
    this.drawPreview();
  }

  onPadDown(ev: PointerEvent) {
    const canvas = this.padRef()?.nativeElement;
    if (!canvas) return;
    canvas.setPointerCapture(ev.pointerId);
    this.drawing = true;
    const ch = this.currentChar();
    if (!this.strokes[ch]) this.strokes[ch] = [];
    this.strokes[ch].push([this.toPt(ev, canvas)]);
    this.drawPad();
  }

  onPadMove(ev: PointerEvent) {
    if (!this.drawing) return;
    const canvas = this.padRef()?.nativeElement;
    if (!canvas) return;
    const ch = this.currentChar();
    const list = this.strokes[ch];
    if (!list || list.length === 0) return;
    list[list.length - 1].push(this.toPt(ev, canvas));
    this.drawPad();
  }

  onPadUp() {
    if (!this.drawing) return;
    this.drawing = false;
    this.strokesVersion.update((v) => v + 1);
    this.drawPreview();
  }

  undoStroke() {
    const ch = this.currentChar();
    this.strokes[ch]?.pop();
    this.strokesVersion.update((v) => v + 1);
    this.drawPad();
    this.drawPreview();
  }

  clearGlyph() {
    delete this.strokes[this.currentChar()];
    this.strokesVersion.update((v) => v + 1);
    this.drawPad();
    this.drawPreview();
  }

  clearAll() {
    this.strokes = {};
    this.strokesVersion.update((v) => v + 1);
    this.drawPad();
    this.drawPreview();
  }

  redrawAll() {
    this.drawPad();
    this.drawPreview();
  }

  exportPng() {
    const canvas = this.previewRef()?.nativeElement;
    if (!canvas) return;
    const a = this.document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'handwriting-preview.png';
    a.click();
  }

  exportSvg() {
    const cell = 120;
    const cols = 8;
    const drawn = this.glyphs.filter((g) => (this.strokes[g]?.length ?? 0) > 0);
    const rows = Math.max(1, Math.ceil(drawn.length / cols));
    let inner = '';
    drawn.forEach((c, i) => {
      const gx = (i % cols) * cell;
      const gy = Math.floor(i / cols) * cell;
      const paths = (this.strokes[c] ?? [])
        .map(
          (s) =>
            `<polyline points="${s
              .map((p) => `${(p.x * 100).toFixed(1)},${(p.y * 100).toFixed(1)}`)
              .join(' ')}" fill="none" stroke="black" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`
        )
        .join('');
      inner += `<g transform="translate(${gx + 10},${gy + 10})">${paths}<text x="0" y="114" font-size="11" fill="#64748b">${this.escapeXml(c)}</text></g>`;
    });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cell}" height="${rows * cell}" viewBox="0 0 ${cols * cell} ${rows * cell}">${inner}</svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'handwriting-alphabet.svg';
    a.click();
    URL.revokeObjectURL(url);
  }

  ngAfterViewInit() {
    this.drawPad();
    this.drawPreview();
  }

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private toPt(ev: PointerEvent, canvas: HTMLCanvasElement): Pt {
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)),
    };
  }

  private drawPad() {
    const canvas = this.padRef()?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#e2e8f0';
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(0, h * 0.75);
    ctx.lineTo(w, h * 0.75);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '150px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.currentChar(), w / 2, h / 2);
    const strokes = this.strokes[this.currentChar()] ?? [];
    ctx.strokeStyle = this.penColor();
    ctx.lineWidth = this.penWidth();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of strokes) {
      ctx.beginPath();
      s.forEach((p, i) => {
        const x = p.x * w;
        const y = p.y * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }

  private drawPreview() {
    const canvas = this.previewRef()?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const fs = this.previewSize();
    const lineH = fs * 1.4;
    const lines = this.previewText().split('\n');
    canvas.width = 900;
    canvas.height = Math.max(140, Math.ceil(lines.length * lineH + 48));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, fs * 0.07);
    let y = 24 + fs;
    for (const line of lines) {
      let x = 24;
      for (const ch of line) {
        const strokes = this.strokes[ch];
        if (strokes && strokes.length > 0) {
          ctx.strokeStyle = '#0f172a';
          for (const s of strokes) {
            ctx.beginPath();
            s.forEach((p, i) => {
              const px = x + p.x * fs;
              const py = y - fs + p.y * fs;
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            });
            ctx.stroke();
          }
        } else if (ch !== ' ') {
          ctx.fillStyle = '#94a3b8';
          ctx.font = `${fs}px serif`;
          ctx.fillText(ch, x, y);
        }
        x += fs * 0.72;
      }
      y += lineH;
    }
  }

  private escapeXml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private clampNum(v: number, min: number, max: number): number {
    if (!Number.isFinite(v)) return min;
    return Math.min(max, Math.max(min, Math.round(v)));
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
    const selector = hreflang
      ? `link[rel="${rel}"][hreflang="${hreflang}"]`
      : `link[rel="${rel}"]:not([hreflang])`;
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
