import { AfterViewInit, Component, computed, effect, ElementRef, inject, OnDestroy, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const GRID = 20;
const SIZE = 400;
const CELL = SIZE / GRID;

interface Point { x: number; y: number }
type Dir = 'up' | 'down' | 'left' | 'right';
type GameState = 'ready' | 'playing' | 'paused' | 'over';
type Speed = 'slow' | 'normal' | 'fast';

const SPEEDS: Record<Speed, number> = { slow: 180, normal: 130, fast: 90 };

@Component({
  selector: 'app-snake-game',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './snake-game.component.html',
  styleUrl: './snake-game.component.scss',
})
export class SnakeGameComponent implements AfterViewInit, OnDestroy {
  readonly slug = 'snake-game';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['tic-tac-toe', 'truth-or-dare-generator', 'spin-the-bottle', 'spin-the-wheel'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  @ViewChild('board') private readonly canvasRef!: ElementRef<HTMLCanvasElement>;

  readonly state = signal<GameState>('ready');
  readonly score = signal(0);
  readonly highScore = signal(0);
  readonly speed = signal<Speed>('normal');
  readonly finalScore = signal(0);

  private snake: Point[] = [];
  private dir: Dir = 'right';
  private queuedDir: Dir = 'right';
  private food: Point = { x: 5, y: 5 };
  private timer: number | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;
  private readonly onKey = (e: KeyboardEvent): void => this.handleKey(e);

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  ngAfterViewInit(): void {
    this.resetSnake();
    this.draw();
    window.addEventListener('keydown', this.onKey);
  }

  readonly nextTarget = computed(() => (Math.floor(this.score() / 10) + 1) * 10);
  readonly targetProgress = computed(() =>
    Math.min(100, Math.max(0, (this.score() / Math.max(1, this.nextTarget())) * 100))
  );

  readonly statusText = computed(() => {
    this.translate.lang();
    const s = this.state();
    if (s === 'playing') return this.t('labels.playingMsg');
    if (s === 'paused') return this.t('labels.pausedMsg');
    if (s === 'over') return `${this.t('labels.overMsg')} ${this.finalScore()}`;
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

  start(): void {
    this.stopTimer();
    this.resetSnake();
    this.score.set(0);
    this.state.set('playing');
    this.timer = window.setInterval(() => this.tick(), SPEEDS[this.speed()]);
    this.draw();
  }

  pause(): void {
    if (this.state() !== 'playing') return;
    this.stopTimer();
    this.state.set('paused');
  }

  resume(): void {
    if (this.state() !== 'paused') return;
    this.state.set('playing');
    this.timer = window.setInterval(() => this.tick(), SPEEDS[this.speed()]);
  }

  setSpeed(s: Speed): void {
    this.speed.set(s);
    if (this.state() === 'playing') {
      this.stopTimer();
      this.timer = window.setInterval(() => this.tick(), SPEEDS[s]);
    }
  }

  turn(d: Dir): void {
    const opposite: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
    if (d === opposite[this.dir] || d === opposite[this.queuedDir]) return;
    this.queuedDir = d;
  }

  ngOnDestroy(): void {
    this.stopTimer();
    window.removeEventListener('keydown', this.onKey);
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private resetSnake(): void {
    const y = Math.floor(GRID / 2);
    this.snake = [{ x: 7, y }, { x: 6, y }, { x: 5, y }];
    this.dir = 'right';
    this.queuedDir = 'right';
    this.placeFood();
  }

  private tick(): void {
    this.dir = this.queuedDir;
    const head = { ...this.snake[0] };
    if (this.dir === 'up') head.y -= 1;
    if (this.dir === 'down') head.y += 1;
    if (this.dir === 'left') head.x -= 1;
    if (this.dir === 'right') head.x += 1;

    const hitWall = head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID;
    const hitSelf = this.snake.some((p) => p.x === head.x && p.y === head.y);
    if (hitWall || hitSelf) {
      this.gameOver();
      return;
    }

    this.snake.unshift(head);
    if (head.x === this.food.x && head.y === this.food.y) {
      this.score.set(this.score() + 10);
      this.placeFood();
    } else {
      this.snake.pop();
    }
    this.draw();
  }

  private placeFood(): void {
    let p: Point;
    do {
      p = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
    } while (this.snake.some((s) => s.x === p.x && s.y === p.y));
    this.food = p;
  }

  private gameOver(): void {
    this.stopTimer();
    const s = this.score();
    this.finalScore.set(s);
    if (s > this.highScore()) this.highScore.set(s);
    this.state.set('over');
    this.draw();
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private handleKey(e: KeyboardEvent): void {
    const map: Record<string, Dir> = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right',
      W: 'up', S: 'down', A: 'left', D: 'right',
    };
    const d = map[e.key];
    if (d) {
      if (this.state() === 'playing') {
        e.preventDefault();
        this.turn(d);
      }
      return;
    }
    if (e.key === ' ') {
      if (this.state() === 'playing') { e.preventDefault(); this.pause(); }
      else if (this.state() === 'paused') { e.preventDefault(); this.resume(); }
    }
  }

  private draw(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dark = this.document.documentElement.getAttribute('data-theme') === 'dark';

    ctx.fillStyle = dark ? '#0f172a' : '#f1f5f9';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.strokeStyle = dark ? 'rgba(148,163,184,0.12)' : 'rgba(100,116,139,0.15)';
    ctx.lineWidth = 1;
    for (let i = 1; i < GRID; i++) {
      ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(SIZE, i * CELL); ctx.stroke();
    }

    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.arc(this.food.x * CELL + CELL / 2, this.food.y * CELL + CELL / 2, CELL * 0.38, 0, Math.PI * 2);
    ctx.fill();

    this.snake.forEach((p, i) => {
      const r = CELL * 0.44;
      const cx = p.x * CELL + CELL / 2;
      const cy = p.y * CELL + CELL / 2;
      ctx.fillStyle = i === 0 ? '#4f46e5' : (dark ? '#818cf8' : '#6366f1');
      ctx.beginPath();
      ctx.arc(cx, cy, i === 0 ? r + 1 : r - 1, 0, Math.PI * 2);
      ctx.fill();
      if (i === 0) {
        ctx.fillStyle = '#ffffff';
        const eo = CELL * 0.18;
        const fo = CELL * 0.08;
        let ex1 = cx - eo, ey1 = cy - fo, ex2 = cx + eo, ey2 = cy - fo;
        if (this.dir === 'up') { ey1 = cy - eo; ey2 = cy - eo; ex1 = cx - fo; ex2 = cx + fo; }
        if (this.dir === 'down') { ey1 = cy + eo; ey2 = cy + eo; ex1 = cx - fo; ex2 = cx + fo; }
        if (this.dir === 'left') { ex1 = cx - eo; ex2 = cx - eo; ey1 = cy - fo; ey2 = cy + fo; }
        if (this.dir === 'right') { ex1 = cx + eo; ex2 = cx + eo; ey1 = cy - fo; ey2 = cy + fo; }
        ctx.beginPath(); ctx.arc(ex1, ey1, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex2, ey2, 2.2, 0, Math.PI * 2); ctx.fill();
      }
    });

    if (this.state() === 'over') {
      ctx.fillStyle = 'rgba(15,23,42,0.55)';
      ctx.fillRect(0, 0, SIZE, SIZE);
    }
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
