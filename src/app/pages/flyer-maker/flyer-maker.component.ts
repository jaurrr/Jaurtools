import { AfterViewInit, Component, computed, effect, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type FlyerTemplate = 'sale' | 'event' | 'opening';
type FlyerSize = 'portrait' | 'square';

const ACCENTS = ['#4f46e5', '#e11d48', '#059669', '#d97706', '#0284c7', '#7c3aed'];

@Component({
  selector: 'app-flyer-maker',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './flyer-maker.component.html',
  styleUrl: './flyer-maker.component.scss',
})
export class FlyerMakerComponent implements AfterViewInit, OnDestroy {
  readonly slug = 'flyer-maker';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['online-whiteboard', 'typing-test'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('flyer');

  readonly template = signal<FlyerTemplate>('sale');
  readonly title = signal('Mega Sale');
  readonly subtitle = signal('Up to 50% off everything in store');
  readonly dateLine = signal('Saturday, 25 October · 10 AM – 8 PM');
  readonly contactLine = signal('Call 98765 43210 · Main Street, Hyderabad');
  readonly accent = signal('#4f46e5');
  readonly size = signal<FlyerSize>('portrait');

  readonly accents = ACCENTS;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    effect(() => {
      this.template(); this.title(); this.subtitle(); this.dateLine();
      this.contactLine(); this.accent(); this.size(); this.translate.lang();
      this.render();
    });
  }

  ngAfterViewInit() {
    this.render();
  }

  private dims(): { w: number; h: number } {
    return this.size() === 'portrait' ? { w: 1080, h: 1350 } : { w: 1080, h: 1080 };
  }

  private wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const trial = line ? line + ' ' + word : word;
      if (ctx.measureText(trial).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = trial;
      }
    }
    if (line) lines.push(line);
    return lines.slice(0, 4);
  }

  private render() {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return;
    const { w, h } = this.dims();
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rtl = this.translate.lang() === 'ar';
    ctx.direction = rtl ? 'rtl' : 'ltr';
    const accent = this.accent();
    const tpl = this.template();
    const pad = 90;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    // subtle decorative circles
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(w - 120, 140, 220, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(100, h - 160, 180, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // top band varies by template
    if (tpl === 'sale') {
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, w, 300);
    } else if (tpl === 'opening') {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w, 220); ctx.lineTo(0, 330); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, w, 14);
      ctx.fillRect(pad, 250, w - pad * 2, 4);
    }

    const badge = this.t('labels.templates.' + tpl).toUpperCase();
    ctx.textAlign = 'center';
    let y = tpl === 'sale' ? 150 : tpl === 'opening' ? 150 : 170;
    ctx.font = '700 44px system-ui, sans-serif';
    ctx.fillStyle = tpl === 'event' ? accent : '#ffffff';
    ctx.fillText(badge, w / 2, y);

    // title
    y = tpl === 'sale' ? 470 : tpl === 'opening' ? 470 : 400;
    ctx.fillStyle = '#0f172a';
    ctx.font = '800 96px system-ui, sans-serif';
    const titleLines = this.wrap(ctx, this.title() || this.t('labels.titlePlaceholder'), w - pad * 2);
    for (const line of titleLines) {
      ctx.fillText(line, w / 2, y);
      y += 112;
    }

    // subtitle
    ctx.fillStyle = '#64748b';
    ctx.font = '400 44px system-ui, sans-serif';
    const subLines = this.wrap(ctx, this.subtitle(), w - pad * 2);
    y += 20;
    for (const line of subLines) {
      ctx.fillText(line, w / 2, y);
      y += 60;
    }

    // date pill
    const dateText = this.dateLine().trim();
    if (dateText) {
      y += 50;
      ctx.font = '600 40px system-ui, sans-serif';
      const pillW = Math.min(w - pad * 2, ctx.measureText(dateText).width + 90);
      ctx.fillStyle = accent;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(w / 2 - pillW / 2, y - 48, pillW, 84, 42);
      } else {
        ctx.rect(w / 2 - pillW / 2, y - 48, pillW, 84);
      }
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(dateText, w / 2, y + 12);
      y += 110;
    }

    // contact footer
    const contact = this.contactLine().trim();
    if (contact) {
      ctx.fillStyle = '#0f172a';
      ctx.font = '600 38px system-ui, sans-serif';
      const cLines = this.wrap(ctx, contact, w - pad * 2);
      const cy = h - 60 - (cLines.length - 1) * 52;
      cLines.forEach((line, i) => ctx.fillText(line, w / 2, cy + i * 52));
    }

    // thin bottom accent bar
    ctx.fillStyle = accent;
    ctx.fillRect(0, h - 12, w, 12);
  }

  downloadPng() {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return;
    const a = this.document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `flyer-${this.template()}-${this.size()}.png`;
    this.document.body.appendChild(a);
    a.click();
    a.remove();
  }

  setTemplate(v: FlyerTemplate) { this.template.set(v); }
  setSize(v: FlyerSize) { this.size.set(v); }
  setTitle(v: string) { this.title.set(v.slice(0, 80)); }
  setSubtitle(v: string) { this.subtitle.set(v.slice(0, 140)); }
  setDateLine(v: string) { this.dateLine.set(v.slice(0, 100)); }
  setContactLine(v: string) { this.contactLine.set(v.slice(0, 140)); }
  setAccent(v: string) { if (/^#[0-9a-fA-F]{6}$/.test(v)) this.accent.set(v); }

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
