import { AfterViewInit, Component, computed, effect, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-drawing-board',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './drawing-board.component.html',
  styleUrl: './drawing-board.component.scss',
})
export class DrawingBoardComponent implements AfterViewInit, OnDestroy {
  readonly slug = 'drawing-board';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['days-from-today', 'density-calculator', 'bandwidth-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly board = viewChild<ElementRef<HTMLCanvasElement>>('board');

  readonly color = signal('#4f46e5');
  readonly brushSize = signal(8);
  readonly eraser = signal(false);

  private ctx: CanvasRenderingContext2D | null = null;
  private drawing = false;
  private lastX = 0;
  private lastY = 0;
  private undoStack: string[] = [];

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  ngAfterViewInit() {
    const canvas = this.board()?.nativeElement;
    if (!canvas) return;
    canvas.width = 1000;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.ctx = ctx;
  }

  private pos(e: PointerEvent): { x: number; y: number } {
    const canvas = this.board()?.nativeElement;
    const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: 1, height: 1 };
    return {
      x: ((e.clientX - rect.left) / rect.width) * 1000,
      y: ((e.clientY - rect.top) / rect.height) * 600,
    };
  }

  private snapshot() {
    const canvas = this.board()?.nativeElement;
    if (!canvas) return;
    this.undoStack.push(canvas.toDataURL('image/png'));
    if (this.undoStack.length > 25) this.undoStack.shift();
  }

  startStroke(e: PointerEvent) {
    if (!this.ctx) return;
    e.preventDefault();
    this.snapshot();
    const p = this.pos(e);
    this.drawing = true;
    this.lastX = p.x;
    this.lastY = p.y;
    this.dot(p.x, p.y);
  }

  moveStroke(e: PointerEvent) {
    if (!this.drawing || !this.ctx) return;
    e.preventDefault();
    const p = this.pos(e);
    const ctx = this.ctx;
    ctx.globalCompositeOperation = this.eraser() ? 'destination-out' : 'source-over';
    ctx.strokeStyle = this.eraser() ? '#000000' : this.color();
    ctx.lineWidth = this.brushSize();
    ctx.beginPath();
    ctx.moveTo(this.lastX, this.lastY);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    this.lastX = p.x;
    this.lastY = p.y;
  }

  endStroke() {
    this.drawing = false;
  }

  private dot(x: number, y: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.globalCompositeOperation = this.eraser() ? 'destination-out' : 'source-over';
    ctx.fillStyle = this.eraser() ? '#000000' : this.color();
    ctx.beginPath();
    ctx.arc(x, y, this.brushSize() / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  undo() {
    const canvas = this.board()?.nativeElement;
    const prev = this.undoStack.pop();
    if (!canvas || !this.ctx || prev === undefined) return;
    const img = new Image();
    img.onload = () => {
      if (!this.ctx || !canvas) return;
      this.ctx.clearRect(0, 0, canvas.width, canvas.height);
      this.ctx.drawImage(img, 0, 0);
    };
    img.src = prev;
  }

  clearBoard() {
    const canvas = this.board()?.nativeElement;
    if (!canvas || !this.ctx) return;
    this.snapshot();
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  downloadPng() {
    const canvas = this.board()?.nativeElement;
    if (!canvas) return;
    const merged = this.document.createElement('canvas');
    merged.width = canvas.width;
    merged.height = canvas.height;
    const mctx = merged.getContext('2d');
    if (!mctx) return;
    mctx.fillStyle = '#ffffff';
    mctx.fillRect(0, 0, merged.width, merged.height);
    mctx.drawImage(canvas, 0, 0);
    const a = this.document.createElement('a');
    a.href = merged.toDataURL('image/png');
    a.download = 'drawing-board.png';
    a.click();
  }

  setColor(v: string) { this.color.set(v); this.eraser.set(false); }
  setBrushSize(v: number) { this.brushSize.set(Math.round(this.clampNum(v, 1, 60))); }
  toggleEraser() { this.eraser.update((e) => !e); }

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
    return Math.min(max, Math.max(min, v));
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
