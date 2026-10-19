import { AfterViewInit, Component, computed, effect, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type CardTemplate = 'dark' | 'light' | 'band';

@Component({
  selector: 'app-business-card-maker',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './business-card-maker.component.html',
  styleUrl: './business-card-maker.component.scss',
})
export class BusinessCardMakerComponent implements OnDestroy, AfterViewInit {
  readonly slug = 'business-card-maker';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['poster-maker', 'invitation-maker', 'keyword-density-checker'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('cardCanvas');

  readonly template = signal<CardTemplate>('dark');
  readonly fullName = signal('Jauhar Ayyub');
  readonly jobTitle = signal('Frontend Developer');
  readonly company = signal('JaurTools Studio');
  readonly phone = signal('+91 98765 43210');
  readonly email = signal('hello@example.com');
  readonly website = signal('www.example.com');

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

  setTemplate(tpl: CardTemplate): void {
    this.template.set(tpl);
    this.draw();
  }
  setFullName(v: string): void { this.fullName.set(v.slice(0, 60)); this.draw(); }
  setJobTitle(v: string): void { this.jobTitle.set(v.slice(0, 60)); this.draw(); }
  setCompany(v: string): void { this.company.set(v.slice(0, 60)); this.draw(); }
  setPhone(v: string): void { this.phone.set(v.slice(0, 30)); this.draw(); }
  setEmail(v: string): void { this.email.set(v.slice(0, 60)); this.draw(); }
  setWebsite(v: string): void { this.website.set(v.slice(0, 60)); this.draw(); }

  downloadPng(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return;
    const a = this.document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'jaurtools-business-card.png';
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
    if (this.template() === 'dark') this.drawDark(ctx, W, H);
    else if (this.template() === 'light') this.drawLight(ctx, W, H);
    else this.drawBand(ctx, W, H);
  }

  private drawDark(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#4f46e5';
    ctx.fillRect(0, 0, 26, H);
    ctx.fillStyle = 'rgba(79,70,229,0.12)';
    this.circle(ctx, W - 90, 90, 150);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 84px system-ui, sans-serif';
    ctx.fillText(this.fullName() || 'Your Name', 90, 220);
    ctx.fillStyle = '#a5b4fc';
    ctx.font = '600 48px system-ui, sans-serif';
    ctx.fillText(this.jobTitle(), 90, 300);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '700 44px system-ui, sans-serif';
    ctx.fillText(this.company(), 90, 380);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 38px system-ui, sans-serif';
    ctx.fillText(this.phone(), 90, 460);
    ctx.fillText(this.email(), 90, 515);
    ctx.fillStyle = '#a5b4fc';
    ctx.font = '600 38px system-ui, sans-serif';
    ctx.fillText(this.website(), 90, 570);
  }

  private drawLight(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#4f46e5';
    ctx.fillRect(90, 60, W - 180, 10);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f172a';
    ctx.font = '800 84px system-ui, sans-serif';
    ctx.fillText(this.fullName() || 'Your Name', 90, 230);
    ctx.fillStyle = '#4f46e5';
    ctx.font = '600 48px system-ui, sans-serif';
    ctx.fillText(this.jobTitle(), 90, 310);
    ctx.fillStyle = '#334155';
    ctx.font = '700 44px system-ui, sans-serif';
    ctx.fillText(this.company(), 90, 390);
    ctx.fillStyle = '#64748b';
    ctx.font = '500 38px system-ui, sans-serif';
    ctx.fillText(this.phone() + '   |   ' + this.email(), 90, 470);
    ctx.fillStyle = '#4f46e5';
    ctx.font = '600 38px system-ui, sans-serif';
    ctx.fillText(this.website(), 90, 530);
  }

  private drawBand(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#4f46e5');
    g.addColorStop(1, '#7c3aed');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, 190);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.font = '800 72px system-ui, sans-serif';
    ctx.fillText(this.fullName() || 'Your Name', 90, 95);
    ctx.font = '600 42px system-ui, sans-serif';
    ctx.fillStyle = '#e0e7ff';
    ctx.fillText(this.jobTitle(), 90, 155);
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 52px system-ui, sans-serif';
    ctx.fillText(this.company(), 90, 300);
    ctx.fillStyle = '#475569';
    ctx.font = '500 40px system-ui, sans-serif';
    ctx.fillText(this.phone(), 90, 390);
    ctx.fillText(this.email(), 90, 450);
    ctx.fillStyle = '#4f46e5';
    ctx.font = '700 40px system-ui, sans-serif';
    ctx.fillText(this.website(), 90, 530);
  }

  private circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
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
