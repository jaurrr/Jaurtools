import { AfterViewInit, Component, computed, effect, ElementRef, inject, OnDestroy, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const SPIN_MS = 4200;
const PALETTE = ['#4f46e5', '#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444'];

@Component({
  selector: 'app-spin-the-wheel',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './spin-the-wheel.component.html',
  styleUrl: './spin-the-wheel.component.scss',
})
export class SpinTheWheelComponent implements AfterViewInit, OnDestroy {
  readonly slug = 'spin-the-wheel';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['tic-tac-toe', 'snake-game', 'truth-or-dare-generator', 'spin-the-bottle'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  @ViewChild('wheel') private readonly canvasRef!: ElementRef<HTMLCanvasElement>;

  readonly options = signal<string[]>([]);
  readonly newOption = signal('');
  readonly wins = signal<number[]>([]);
  readonly rotation = signal(0);
  readonly spinning = signal(false);
  readonly winnerIndex = signal<number | null>(null);

  private rafId: number | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  ngAfterViewInit(): void {
    this.drawWheel();
  }

  readonly canSpin = computed(() => this.options().length >= 2 && !this.spinning());

  readonly statusText = computed(() => {
    this.translate.lang();
    if (this.spinning()) return this.t('labels.spinningMsg');
    const w = this.winnerIndex();
    if (w !== null && this.options()[w]) return `${this.t('labels.winnerMsg')} ${this.options()[w]}`;
    if (this.options().length < 2) return this.t('labels.minOptionsMsg');
    return this.t('labels.readyMsg');
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

  addOption(): void {
    const name = this.newOption().trim().slice(0, 24);
    if (name === '' || this.options().length >= 12 || this.spinning()) return;
    this.options.set([...this.options(), name]);
    this.wins.set([...this.wins(), 0]);
    this.newOption.set('');
    this.winnerIndex.set(null);
    this.drawWheel();
  }

  removeOption(i: number): void {
    if (this.spinning()) return;
    this.options.set(this.options().filter((_, k) => k !== i));
    this.wins.set(this.wins().filter((_, k) => k !== i));
    this.winnerIndex.set(null);
    this.drawWheel();
  }

  spin(): void {
    if (!this.canSpin()) return;
    const n = this.options().length;
    const target = Math.floor(Math.random() * n);
    const arc = 360 / n;
    const targetPointer = target * arc + arc / 2;
    const needed = ((360 - targetPointer) % 360 + 360) % 360;
    const cur = ((this.rotation() % 360) + 360) % 360;
    const delta = ((needed - cur) % 360 + 360) % 360;
    const fullSpins = 5 + Math.floor(Math.random() * 3);
    const from = this.rotation();
    const to = from + fullSpins * 360 + delta;
    this.spinning.set(true);
    this.winnerIndex.set(null);
    const startTime = performance.now();
    const animate = (now: number): void => {
      const t = Math.min(1, (now - startTime) / SPIN_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      this.rotation.set(from + (to - from) * eased);
      this.drawWheel();
      if (t < 1) {
        this.rafId = requestAnimationFrame(animate);
      } else {
        this.rafId = null;
        this.spinning.set(false);
        this.winnerIndex.set(target);
        const w = [...this.wins()];
        w[target] += 1;
        this.wins.set(w);
        this.drawWheel();
      }
    };
    this.rafId = requestAnimationFrame(animate);
  }

  resetWins(): void {
    this.wins.set(this.options().map(() => 0));
    this.winnerIndex.set(null);
    this.drawWheel();
  }

  removeAria(name: string): string {
    return `${this.t('labels.removeAria')} ${name}`;
  }

  ngOnDestroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private drawWheel(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const opts = this.options();
    const n = opts.length;
    const cx = 180;
    const cy = 180;
    const r = 168;
    ctx.clearRect(0, 0, 360, 360);
    const dark = this.document.documentElement.getAttribute('data-theme') === 'dark';

    if (n === 0) {
      ctx.fillStyle = dark ? '#1e293b' : '#f1f5f9';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    const rot = (this.rotation() * Math.PI) / 180;
    const arc = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) {
      const start = rot - Math.PI / 2 + i * arc;
      const end = start + arc;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      ctx.fillStyle = PALETTE[i % PALETTE.length];
      ctx.fill();
      ctx.strokeStyle = dark ? '#0f172a' : '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      const mid = start + arc / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(mid);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 13px system-ui, sans-serif';
      const label = opts[i].length > 16 ? opts[i].slice(0, 15) + '…' : opts[i];
      ctx.fillText(label, r - 12, 5);
      ctx.restore();
    }

    ctx.fillStyle = dark ? '#e2e8f0' : '#0f172a';
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4f46e5';
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fill();
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
    for (const l of ['en', 'hi', 'ar']) this.setLink('alternate', `https://jaurtools.com/${l}/${this.slug}`, l);
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
      '@type': 'Question', name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    }));
    const json = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity })
      .replace(/</g, '\\u003c');
    const el = this.document.createElement('script');
    el.type = 'application/ld+json';
    el.textContent = json;
    this.document.head.appendChild(el);
    this.jsonLdEl = el;
  }
}
