import { AfterViewInit, Component, computed, effect, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type InviteTemplate = 'classic' | 'modern' | 'elegant';

@Component({
  selector: 'app-invitation-maker',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './invitation-maker.component.html',
  styleUrl: './invitation-maker.component.scss',
})
export class InvitationMakerComponent implements OnDestroy, AfterViewInit {
  readonly slug = 'invitation-maker';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['poster-maker', 'business-card-maker', 'tasbih-dhikr-counter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('inviteCanvas');

  readonly template = signal<InviteTemplate>('classic');
  readonly eventName = signal('Aarav\'s Birthday Party');
  readonly hostName = signal('Hosted by the Sharma family');
  readonly dateText = signal('Sunday, 25 October 2026');
  readonly timeText = signal('6:00 PM onwards');
  readonly venue = signal('Green View Banquet Hall, MG Road');
  readonly message = signal('Join us for cake, music, and celebration!');

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

  setTemplate(tpl: InviteTemplate): void {
    this.template.set(tpl);
    this.draw();
  }
  setEventName(v: string): void { this.eventName.set(v.slice(0, 80)); this.draw(); }
  setHostName(v: string): void { this.hostName.set(v.slice(0, 80)); this.draw(); }
  setDateText(v: string): void { this.dateText.set(v.slice(0, 60)); this.draw(); }
  setTimeText(v: string): void { this.timeText.set(v.slice(0, 60)); this.draw(); }
  setVenue(v: string): void { this.venue.set(v.slice(0, 100)); this.draw(); }
  setMessage(v: string): void { this.message.set(v.slice(0, 200)); this.draw(); }

  downloadPng(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return;
    const a = this.document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'jaurtools-invitation.png';
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
    if (this.template() === 'classic') this.drawClassic(ctx, W, H);
    else if (this.template() === 'modern') this.drawModern(ctx, W, H);
    else this.drawElegant(ctx, W, H);
  }

  private drawClassic(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    ctx.fillStyle = '#fefce8';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#a16207';
    ctx.lineWidth = 8;
    ctx.strokeRect(36, 36, W - 72, H - 72);
    ctx.lineWidth = 2;
    ctx.strokeRect(58, 58, W - 116, H - 116);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#a16207';
    ctx.font = 'italic 600 44px Georgia, serif';
    ctx.fillText(this.hostName(), W / 2, 190);
    ctx.fillStyle = '#422006';
    ctx.font = '700 92px Georgia, serif';
    const ev = this.wrapText(ctx, this.eventName() || 'Your Event', 900);
    this.centerLines(ctx, ev, W / 2, 340, 108);
    ctx.fillStyle = '#a16207';
    this.rule(ctx, W / 2 - 160, 340 + ev.length * 108 + 30, 320);
    ctx.fillStyle = '#57534e';
    ctx.font = '600 48px Georgia, serif';
    ctx.fillText(this.dateText(), W / 2, 340 + ev.length * 108 + 110);
    ctx.fillText(this.timeText(), W / 2, 340 + ev.length * 108 + 175);
    ctx.fillStyle = '#422006';
    ctx.font = 'italic 500 44px Georgia, serif';
    const venue = this.wrapText(ctx, this.venue(), 900);
    this.centerLines(ctx, venue, W / 2, 340 + ev.length * 108 + 250, 58);
    ctx.fillStyle = '#78716c';
    ctx.font = 'italic 500 40px Georgia, serif';
    const msg = this.wrapText(ctx, this.message(), 880);
    this.centerLines(ctx, msg, W / 2, H - 190, 54);
  }

  private drawModern(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#312e81');
    g.addColorStop(1, '#4f46e5');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    this.circle(ctx, 150, 150, 200);
    this.circle(ctx, 1080, 780, 240);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#c7d2fe';
    ctx.font = '600 42px system-ui, sans-serif';
    ctx.fillText(this.hostName(), W / 2, 170);
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 96px system-ui, sans-serif';
    const ev = this.wrapText(ctx, this.eventName() || 'Your Event', 920);
    this.centerLines(ctx, ev, W / 2, 330, 112);
    ctx.fillStyle = '#fbbf24';
    this.roundRect(ctx, W / 2 - 340, 330 + ev.length * 112 + 20, 680, 90, 45);
    ctx.fillStyle = '#312e81';
    ctx.font = '700 44px system-ui, sans-serif';
    ctx.fillText(this.dateText() + '  |  ' + this.timeText(), W / 2, 330 + ev.length * 112 + 80);
    ctx.fillStyle = '#e0e7ff';
    ctx.font = '500 46px system-ui, sans-serif';
    const venue = this.wrapText(ctx, this.venue(), 920);
    this.centerLines(ctx, venue, W / 2, 330 + ev.length * 112 + 200, 62);
    ctx.fillStyle = '#c7d2fe';
    ctx.font = '500 42px system-ui, sans-serif';
    const msg = this.wrapText(ctx, this.message(), 900);
    this.centerLines(ctx, msg, W / 2, H - 130, 56);
  }

  private drawElegant(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#d4a94e';
    ctx.lineWidth = 3;
    ctx.strokeRect(44, 44, W - 88, H - 88);
    for (const [cx, cy] of [[120, 120], [W - 120, 120], [120, H - 120], [W - 120, H - 120]] as const) {
      ctx.fillStyle = '#d4a94e';
      this.circle(ctx, cx, cy, 10);
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#d4a94e';
    ctx.font = '600 40px Georgia, serif';
    ctx.fillText(this.hostName().toUpperCase(), W / 2, 200);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 92px Georgia, serif';
    const ev = this.wrapText(ctx, this.eventName() || 'Your Event', 900);
    this.centerLines(ctx, ev, W / 2, 350, 108);
    ctx.fillStyle = '#d4a94e';
    this.rule(ctx, W / 2 - 120, 350 + ev.length * 108 + 24, 240);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '500 48px Georgia, serif';
    ctx.fillText(this.dateText(), W / 2, 350 + ev.length * 108 + 104);
    ctx.fillText(this.timeText(), W / 2, 350 + ev.length * 108 + 168);
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'italic 500 44px Georgia, serif';
    const venue = this.wrapText(ctx, this.venue(), 900);
    this.centerLines(ctx, venue, W / 2, 350 + ev.length * 108 + 244, 58);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'italic 500 40px Georgia, serif';
    const msg = this.wrapText(ctx, this.message(), 880);
    this.centerLines(ctx, msg, W / 2, H - 150, 54);
  }

  private rule(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
    ctx.fillRect(x, y, w, 4);
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
