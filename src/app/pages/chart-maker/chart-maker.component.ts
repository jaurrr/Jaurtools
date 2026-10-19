import { Component, computed, effect, inject, OnDestroy, signal, viewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface DataPoint {
  label: string;
  value: number;
}

@Component({
  selector: 'app-chart-maker',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './chart-maker.component.html',
  styleUrl: './chart-maker.component.scss',
})
export class ChartMakerComponent implements OnDestroy {
  readonly slug = 'chart-maker';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['code-to-image', 'text-on-photo', 'shape-cropper', 'photo-joiner'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('previewCanvas');

  readonly chartType = signal<'bar' | 'line' | 'pie'>('bar');
  readonly dataText = signal('Mon,120\nTue,200\nWed,150\nThu,180\nFri,90');
  readonly title = signal('Weekly Sales');
  readonly color = signal('#4f46e5');
  readonly parseError = signal('');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    effect(() => {
      this.chartType();
      this.dataText();
      this.title();
      this.color();
      this.render();
    });
  }

  readonly points = computed(() => this.parse().points);
  readonly pointCount = computed(() => this.points().length);
  readonly maxValue = computed(() => {
    const pts = this.points();
    return pts.length ? Math.max(...pts.map((p) => p.value)) : 0;
  });
  readonly totalValue = computed(() => this.points().reduce((s, p) => s + p.value, 0));

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

  typeLabel(ty: string): string {
    const map: Record<string, string> = { bar: 'typeBar', line: 'typeLine', pie: 'typePie' };
    return this.t(`labels.${map[ty] ?? 'typeBar'}`);
  }

  setChartType(ty: 'bar' | 'line' | 'pie'): void {
    this.chartType.set(ty);
  }

  setDataText(v: string): void {
    this.dataText.set(v);
  }

  setTitle(v: string): void {
    this.title.set(v);
  }

  setColor(c: string): void {
    this.color.set(c);
  }

  parse(): { points: DataPoint[]; badLine: number } {
    const lines = this.dataText().split('\n');
    const points: DataPoint[] = [];
    let badLine = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const comma = line.lastIndexOf(',');
      if (comma <= 0) {
        badLine = i + 1;
        break;
      }
      const label = line.slice(0, comma).trim();
      const value = Number(line.slice(comma + 1).trim());
      if (!label || !Number.isFinite(value)) {
        badLine = i + 1;
        break;
      }
      points.push({ label, value });
      if (points.length >= 24) break;
    }
    return { points, badLine };
  }

  render(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = 900;
    const H = 600;
    canvas.width = W;
    canvas.height = H;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    const { points, badLine } = this.parse();
    if (badLine > 0) {
      this.parseError.set(this.t('labels.parseError').replace('{line}', String(badLine)));
      this.drawMessage(ctx, W, H, this.parseError());
      return;
    }
    if (points.length < 2) {
      this.parseError.set('');
      this.drawMessage(ctx, W, H, this.t('labels.noData'));
      return;
    }
    this.parseError.set('');
    const main = this.color();
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 28px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.title() || 'Chart', W / 2, 48);
    if (this.chartType() === 'pie') this.renderPie(ctx, points, main, W, H);
    else if (this.chartType() === 'line') this.renderLine(ctx, points, main, W, H);
    else this.renderBars(ctx, points, main, W, H);
  }

  private drawMessage(ctx: CanvasRenderingContext2D, W: number, H: number, msg: string): void {
    ctx.fillStyle = '#64748b';
    ctx.font = '20px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(msg, W / 2, H / 2);
  }

  private renderBars(
    ctx: CanvasRenderingContext2D,
    points: DataPoint[],
    main: string,
    W: number,
    H: number
  ): void {
    const padL = 70;
    const padB = 70;
    const padT = 90;
    const plotW = W - padL - 40;
    const plotH = H - padT - padB;
    const max = Math.max(...points.map((p) => p.value));
    const min = Math.min(0, ...points.map((p) => p.value));
    const range = max - min || 1;
    const zeroY = padT + plotH * (1 - (0 - min) / range);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const y = padT + (plotH * g) / 4;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
    }
    const slot = plotW / points.length;
    const barW = Math.min(80, slot * 0.6);
    ctx.textAlign = 'center';
    points.forEach((p, i) => {
      const h = (Math.abs(p.value) / range) * plotH;
      const x = padL + slot * i + slot / 2;
      const y = p.value >= 0 ? zeroY - h : zeroY;
      ctx.fillStyle = main;
      ctx.fillRect(x - barW / 2, y, barW, Math.max(1, h));
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 16px Arial, sans-serif';
      ctx.fillText(String(p.value), x, (p.value >= 0 ? y - 8 : y + h + 20));
      ctx.fillStyle = '#64748b';
      ctx.font = '15px Arial, sans-serif';
      ctx.fillText(p.label.slice(0, 12), x, padT + plotH + 28);
    });
    ctx.strokeStyle = '#94a3b8';
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + plotH);
    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();
  }

  private renderLine(
    ctx: CanvasRenderingContext2D,
    points: DataPoint[],
    main: string,
    W: number,
    H: number
  ): void {
    const padL = 70;
    const padB = 70;
    const padT = 90;
    const plotW = W - padL - 40;
    const plotH = H - padT - padB;
    const max = Math.max(...points.map((p) => p.value));
    const min = Math.min(...points.map((p) => p.value));
    const range = max - min || 1;
    ctx.strokeStyle = '#e2e8f0';
    for (let g = 0; g <= 4; g++) {
      const y = padT + (plotH * g) / 4;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
    }
    const step = points.length > 1 ? plotW / (points.length - 1) : 0;
    const px = (i: number) => padL + step * i;
    const py = (v: number) => padT + plotH * (1 - (v - min) / range);
    ctx.strokeStyle = main;
    ctx.lineWidth = 3;
    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(px(i), py(p.value));
      else ctx.lineTo(px(i), py(p.value));
    });
    ctx.stroke();
    ctx.textAlign = 'center';
    points.forEach((p, i) => {
      ctx.fillStyle = main;
      ctx.beginPath();
      ctx.arc(px(i), py(p.value), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 15px Arial, sans-serif';
      ctx.fillText(String(p.value), px(i), py(p.value) - 12);
      ctx.fillStyle = '#64748b';
      ctx.font = '15px Arial, sans-serif';
      ctx.fillText(p.label.slice(0, 12), px(i), padT + plotH + 28);
    });
  }

  private renderPie(
    ctx: CanvasRenderingContext2D,
    points: DataPoint[],
    main: string,
    W: number,
    H: number
  ): void {
    const total = points.reduce((s, p) => s + Math.max(0, p.value), 0) || 1;
    const cx = W / 2 - 110;
    const cy = H / 2 + 30;
    const r = 190;
    let angle = -Math.PI / 2;
    const palette = this.piePalette(main, points.length);
    ctx.textAlign = 'left';
    points.forEach((p, i) => {
      const frac = Math.max(0, p.value) / total;
      const sweep = frac * Math.PI * 2;
      ctx.fillStyle = palette[i % palette.length];
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, angle, angle + sweep);
      ctx.closePath();
      ctx.fill();
      angle += sweep;
      const pct = Math.round(frac * 1000) / 10;
      const ly = 150 + i * 34;
      ctx.fillStyle = palette[i % palette.length];
      ctx.fillRect(W - 300, ly - 12, 18, 18);
      ctx.fillStyle = '#0f172a';
      ctx.font = '16px Arial, sans-serif';
      ctx.fillText(`${p.label.slice(0, 14)} — ${pct}%`, W - 274, ly + 2);
    });
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  private piePalette(main: string, n: number): string[] {
    const base = [main, '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
    const out: string[] = [];
    for (let i = 0; i < n; i++) out.push(base[i % base.length]);
    return out;
  }

  download(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas || this.pointCount() < 2) return;
    const a = this.document.createElement('a');
    a.download = 'chart.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
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
