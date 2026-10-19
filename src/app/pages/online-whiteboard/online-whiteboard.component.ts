import { AfterViewInit, Component, computed, effect, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type DrawTool = 'pen' | 'eraser' | 'line' | 'rect' | 'circle';

@Component({
  selector: 'app-online-whiteboard',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './online-whiteboard.component.html',
  styleUrl: './online-whiteboard.component.scss',
})
export class OnlineWhiteboardComponent implements AfterViewInit, OnDestroy {
  readonly slug = 'online-whiteboard';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['flyer-maker', 'typing-test', 'zodiac-sign-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly board = viewChild<ElementRef<HTMLCanvasElement>>('board');

  readonly color = signal('#4f46e5');
  readonly brushSize = signal(6);
  readonly drawTool = signal<DrawTool>('pen');
  readonly strokes = signal(0);

  private jsonLdEl: HTMLScriptElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private drawing = false;
  private startX = 0;
  private startY = 0;
  private snapshot: ImageData | null = null;
  private undoStack: string[] = [];
  private readonly resizeHandler = () => this.setupCanvas(true);

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    window.addEventListener('resize', this.resizeHandler);
  }

  ngAfterViewInit() {
    this.setupCanvas(false);
  }

  private setupCanvas(keepDrawing: boolean) {
    const canvas = this.board()?.nativeElement;
    if (!canvas) return;
    const previous = keepDrawing ? canvas.toDataURL() : null;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssWidth = canvas.clientWidth || 600;
    const cssHeight = 420;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) return;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, cssWidth, cssHeight);
    if (previous) {
      const img = new Image();
      img.onload = () => this.ctx?.drawImage(img, 0, 0, cssWidth, cssHeight);
      img.src = previous;
    }
  }

  private styleCtx() {
    if (!this.ctx) return;
    this.ctx.lineWidth = this.brushSize();
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = this.drawTool() === 'eraser' ? '#ffffff' : this.color();
  }

  private pos(e: PointerEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  onPointerDown(e: PointerEvent) {
    const canvas = this.board()?.nativeElement;
    if (!canvas || !this.ctx) return;
    e.preventDefault();
    this.pushUndo();
    this.drawing = true;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* noop */ }
    const p = this.pos(e, canvas);
    this.startX = p.x;
    this.startY = p.y;
    this.styleCtx();
    if (this.drawTool() === 'pen' || this.drawTool() === 'eraser') {
      this.ctx.beginPath();
      this.ctx.moveTo(p.x, p.y);
      this.ctx.lineTo(p.x + 0.5, p.y + 0.5);
      this.ctx.stroke();
    } else {
      this.snapshot = this.ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
  }

  onPointerMove(e: PointerEvent) {
    const canvas = this.board()?.nativeElement;
    if (!this.drawing || !canvas || !this.ctx) return;
    e.preventDefault();
    const p = this.pos(e, canvas);
    this.styleCtx();
    if (this.drawTool() === 'pen' || this.drawTool() === 'eraser') {
      this.ctx.lineTo(p.x, p.y);
      this.ctx.stroke();
    } else if (this.snapshot) {
      this.ctx.putImageData(this.snapshot, 0, 0);
      this.drawShape(this.startX, this.startY, p.x, p.y);
    }
  }

  onPointerUp() {
    if (!this.drawing) return;
    this.drawing = false;
    this.snapshot = null;
    this.strokes.update((s) => s + 1);
  }

  private drawShape(x1: number, y1: number, x2: number, y2: number) {
    if (!this.ctx) return;
    this.ctx.beginPath();
    const tool = this.drawTool();
    if (tool === 'line') {
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
    } else if (tool === 'rect') {
      this.ctx.rect(x1, y1, x2 - x1, y2 - y1);
    } else if (tool === 'circle') {
      const r = Math.hypot(x2 - x1, y2 - y1);
      this.ctx.arc(x1, y1, r, 0, Math.PI * 2);
    }
    this.ctx.stroke();
  }

  private pushUndo() {
    const canvas = this.board()?.nativeElement;
    if (!canvas) return;
    if (this.undoStack.length >= 20) this.undoStack.shift();
    this.undoStack.push(canvas.toDataURL());
  }

  undo() {
    const canvas = this.board()?.nativeElement;
    if (!canvas || !this.ctx || this.undoStack.length === 0) return;
    const url = this.undoStack.pop() as string;
    const img = new Image();
    img.onload = () => {
      if (!this.ctx) return;
      this.ctx.save();
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.clearRect(0, 0, canvas.width, canvas.height);
      this.ctx.restore();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.ctx.drawImage(img, 0, 0, canvas.clientWidth || 600, 420);
    };
    img.src = url;
  }

  clearBoard() {
    const canvas = this.board()?.nativeElement;
    if (!canvas || !this.ctx) return;
    this.pushUndo();
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.ctx.restore();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.strokes.set(0);
  }

  downloadPng() {
    const canvas = this.board()?.nativeElement;
    if (!canvas) return;
    const a = this.document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'whiteboard.png';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
  }

  setColor(v: string) { this.color.set(/^#[0-9a-fA-F]{6}$/.test(v) ? v : '#4f46e5'); }
  setBrushSize(v: number) { this.brushSize.set(this.clampNum(v, 1, 50)); }
  setTool(t: DrawTool) { this.drawTool.set(t); }

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
    window.removeEventListener('resize', this.resizeHandler);
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
    return Math.min(max, Math.max(min, Math.round(v)));
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
