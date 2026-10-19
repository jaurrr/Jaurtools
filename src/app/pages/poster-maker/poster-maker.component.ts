import { AfterViewInit, Component, computed, effect, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type PosterTemplate = 'sunset' | 'minimal' | 'festive';

@Component({
  selector: 'app-poster-maker',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './poster-maker.component.html',
  styleUrl: './poster-maker.component.scss',
})
export class PosterMakerComponent implements OnDestroy, AfterViewInit {
  readonly slug = 'poster-maker';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['invitation-maker', 'business-card-maker', 'online-notepad'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('posterCanvas');

  readonly template = signal<PosterTemplate>('sunset');
  readonly titleText = signal('Mega Sale');
  readonly subtitle = signal('Up to 50% off everything');
  readonly details = signal('Saturday, 24 October, 10 AM onwards\nCity Mall, Main Road');
  readonly footer = signal('Visit our store today');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  ngAfterViewInit(): void {
    this.draw();
  }

  readonly templateName = computed(() => this.t('templates.' + this.template()));

  setTemplate(tpl: PosterTemplate): void {
    this.template.set(tpl);
    this.draw();
  }
  setTitle(v: string): void {
    this.titleText.set(v.slice(0, 80));
    this.draw();
  }
  setSubtitle(v: string): void {
    this.subtitle.set(v.slice(0, 120));
    this.draw();
  }
  setDetails(v: string): void {
    this.details.set(v.slice(0, 300));
    this.draw();
  }
  setFooter(v: string): void {
    this.footer.set(v.slice(0, 80));
    this.draw();
  }

  downloadPng(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return;
    const a = this.document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'jaurtools-poster.png';
    a.click();
  }

  private draw(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (this.template() === 'sunset') this.drawSunset(ctx, W, H);
    else if (this.template() === 'minimal') this.drawMinimal(ctx, W, H);
    else this.drawFestive(ctx, W, H);
  }

  private drawSunset(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#4f46e5');
    g.addColorStop(0.55, '#7c3aed');
    g.addColorStop(1, '#db2777');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    this.circle(ctx, 150, 200, 260);
    this.circle(ctx, 950, 1080, 320);
    this.circle(ctx, 880, 170, 140);
    ctx.fillStyle = '#fbbf24';
    this.roundRect(ctx, 140, 250, 130, 16, 8);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    const titleLines = this.wrapText(ctx, this.titleText() || 'Your Title', 800);
    ctx.font = '800 128px system-ui, -apple-system, sans-serif';
    this.centerLines(ctx, titleLines, W / 2, 560, 150);
    ctx.font = '600 62px system-ui, -apple-system, sans-serif';
    const subLines = this.wrapText(ctx, this.subtitle(), 840);
    this.centerLines(ctx, subLines, W / 2, 560 + titleLines.length * 150 + 60, 80);
    ctx.font = '500 50px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    const detLines = this.wrapText(ctx, this.details(), 840);
    this.centerLines(ctx, detLines, W / 2, H - 320, 70);
    ctx.font = '700 46px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(this.footer(), W / 2, H - 140);
  }

  private drawMinimal(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = 6;
    ctx.strokeRect(56, 56, W - 112, H - 112);
    ctx.fillStyle = '#4f46e5';
    ctx.fillRect(140, 170, 110, 110);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f172a';
    ctx.font = '800 124px system-ui, -apple-system, sans-serif';
    const titleLines = this.wrapText(ctx, this.titleText() || 'Your Title', 760);
    this.leftLines(ctx, titleLines, 140, 560, 146);
    ctx.fillStyle = '#4f46e5';
    ctx.fillRect(140, 560 + titleLines.length * 146 + 30, 220, 8);
    ctx.fillStyle = '#334155';
    ctx.font = '600 60px system-ui, -apple-system, sans-serif';
    const subLines = this.wrapText(ctx, this.subtitle(), 760);
    this.leftLines(ctx, subLines, 140, 560 + titleLines.length * 146 + 130, 78);
    ctx.fillStyle = '#64748b';
    ctx.font = '500 48px system-ui, -apple-system, sans-serif';
    const detLines = this.wrapText(ctx, this.details(), 760);
    this.leftLines(ctx, detLines, 140, H - 330, 66);
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 46px system-ui, -apple-system, sans-serif';
    ctx.fillText(this.footer(), 140, H - 140);
  }

  private drawFestive(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, W, H);
    const colors = ['#4f46e5', '#db2777', '#fbbf24', '#22c55e', '#38bdf8'];
    for (let i = 0; i < 70; i++) {
      const x = (i * 197 + 53) % W;
      const y = (i * 311 + 97) % H;
      const r = ((i * 13) % 6) + 3;
      ctx.fillStyle = colors[i % colors.length] + '55';
      this.circle(ctx, x, y, r);
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fbbf24';
    ctx.font = '800 132px system-ui, -apple-system, sans-serif';
    const titleLines = this.wrapText(ctx, this.titleText() || 'Your Title', 820);
    this.centerLines(ctx, titleLines, W / 2, 540, 154);
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 64px system-ui, -apple-system, sans-serif';
    const subLines = this.wrapText(ctx, this.subtitle(), 840);
    this.centerLines(ctx, subLines, W / 2, 540 + titleLines.length * 154 + 70, 82);
    ctx.fillStyle = '#d1d5db';
    ctx.font = '500 50px system-ui, -apple-system, sans-serif';
    const detLines = this.wrapText(ctx, this.details(), 840);
    this.centerLines(ctx, detLines, W / 2, H - 320, 70);
    ctx.fillStyle = '#111827';
    this.roundRect(ctx, W / 2 - 330, H - 210, 660, 96, 48);
    ctx.fillStyle = '#fbbf24';
    ctx.font = '700 46px system-ui, -apple-system, sans-serif';
    ctx.fillText(this.footer(), W / 2, H - 146);
  }

  private wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [' '];
  }

  private centerLines(ctx: CanvasRenderingContext2D, lines: string[], cx: number, y: number, lh: number): void {
    lines.forEach((ln, i) => ctx.fillText(ln, cx, y + i * lh));
  }

  private leftLines(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, lh: number): void {
    lines.forEach((ln, i) => ctx.fillText(ln, x, y + i * lh));
  }

  private circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
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
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
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
