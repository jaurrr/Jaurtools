import { Component, computed, effect, HostListener, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const WIN_LINES: number[][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

type Mark = '' | 'X' | 'O';
type Mode = 'two' | 'easy' | 'hard';

@Component({
  selector: 'app-tic-tac-toe',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './tic-tac-toe.component.html',
  styleUrl: './tic-tac-toe.component.scss',
})
export class TicTacToeComponent implements OnDestroy {
  readonly slug = 'tic-tac-toe';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['snake-game', 'truth-or-dare-generator', 'spin-the-bottle', 'spin-the-wheel'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly board = signal<Mark[]>(Array(9).fill(''));
  readonly turn = signal<'X' | 'O'>('X');
  readonly mode = signal<Mode>('two');
  readonly winner = signal<'' | 'X' | 'O' | 'draw'>('');
  readonly winLine = signal<number[]>([]);
  readonly scores = signal({ x: 0, o: 0, draw: 0 });
  readonly aiThinking = signal(false);

  private aiTimer: number | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly statusText = computed(() => {
    this.translate.lang();
    const w = this.winner();
    if (w === 'X') return this.t('labels.xWinsMsg');
    if (w === 'O') return this.t('labels.oWinsMsg');
    if (w === 'draw') return this.t('labels.drawMsg');
    return `${this.t('labels.turnMsg')} ${this.turn()}`;
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

  makeMove(i: number): void {
    if (this.winner() !== '' || this.board()[i] !== '') return;
    if (this.mode() !== 'two' && this.turn() === 'O') return;
    this.place(i);
    this.afterMove();
  }

  setMode(m: Mode): void {
    this.mode.set(m);
    this.newRound();
  }

  newRound(): void {
    this.clearAiTimer();
    this.board.set(Array(9).fill(''));
    this.turn.set('X');
    this.winner.set('');
    this.winLine.set([]);
    this.aiThinking.set(false);
  }

  resetAll(): void {
    this.newRound();
    this.scores.set({ x: 0, o: 0, draw: 0 });
  }

  readonly totalGames = computed(() => this.scores().x + this.scores().o + this.scores().draw);
  readonly xShare = computed(() => {
    const t = this.totalGames();
    return t === 0 ? 0 : (this.scores().x / t) * 100;
  });
  readonly oShare = computed(() => {
    const t = this.totalGames();
    return t === 0 ? 0 : (this.scores().o / t) * 100;
  });

  readonly copied = signal(false);
  copyResult(): void {
    const s = this.scores();
    const text = `${this.t('name')} — X: ${s.x}, O: ${s.o}, ${this.t('labels.draws')}: ${s.draw}`;
    const done = () => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1600);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, () => done());
    } else {
      done();
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'r' || e.key === 'R') {
      this.newRound();
      return;
    }
    const n = parseInt(e.key, 10);
    if (!isNaN(n) && n >= 1 && n <= 9) this.makeMove(n - 1);
  }

  cellAria(i: number): string {
    const v = this.board()[i];
    return `${this.t('labels.cell')} ${i + 1}${v ? ': ' + v : ''}`;
  }

  ngOnDestroy(): void {
    this.clearAiTimer();
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private place(i: number): void {
    const b = [...this.board()];
    b[i] = this.turn();
    this.board.set(b);
  }

  private afterMove(): void {
    const b = this.board();
    const line = TicTacToeComponent.findLine(b);
    if (line) {
      this.winLine.set(line);
      this.finish(line.map((i) => b[i])[0] as 'X' | 'O');
      return;
    }
    if (!b.includes('')) {
      this.finish('draw');
      return;
    }
    this.turn.set(this.turn() === 'X' ? 'O' : 'X');
    this.maybeAi();
  }

  private finish(w: 'X' | 'O' | 'draw'): void {
    this.winner.set(w);
    const s = { ...this.scores() };
    if (w === 'X') s.x += 1;
    else if (w === 'O') s.o += 1;
    else s.draw += 1;
    this.scores.set(s);
  }

  private maybeAi(): void {
    if (this.mode() === 'two' || this.turn() !== 'O' || this.winner() !== '') return;
    this.aiThinking.set(true);
    this.aiTimer = window.setTimeout(() => {
      this.aiThinking.set(false);
      this.aiTimer = null;
      if (this.winner() !== '') return;
      const move = this.mode() === 'easy' ? this.randomMove() : this.bestMove();
      if (move >= 0) {
        this.place(move);
        this.afterMove();
      }
    }, 650);
  }

  private clearAiTimer(): void {
    if (this.aiTimer !== null) {
      window.clearTimeout(this.aiTimer);
      this.aiTimer = null;
    }
  }

  private emptyCells(b: string[]): number[] {
    const out: number[] = [];
    for (let i = 0; i < 9; i++) if (b[i] === '') out.push(i);
    return out;
  }

  private randomMove(): number {
    const empties = this.emptyCells(this.board());
    return empties[Math.floor(Math.random() * empties.length)];
  }

  private bestMove(): number {
    const b = [...this.board()];
    const empties = this.emptyCells(b);
    let bestScore = -Infinity;
    let move = empties[0];
    for (const i of empties) {
      b[i] = 'O';
      const score = this.minimax(b, 0, false);
      b[i] = '';
      if (score > bestScore) {
        bestScore = score;
        move = i;
      }
    }
    return move;
  }

  private minimax(b: string[], depth: number, isMax: boolean): number {
    const line = TicTacToeComponent.findLine(b);
    if (line) {
      const mark = b[line[0]];
      if (mark === 'O') return 10 - depth;
      return depth - 10;
    }
    if (!b.includes('')) return 0;
    if (isMax) {
      let best = -Infinity;
      for (let i = 0; i < 9; i++) {
        if (b[i] !== '') continue;
        b[i] = 'O';
        best = Math.max(best, this.minimax(b, depth + 1, false));
        b[i] = '';
      }
      return best;
    }
    let best = Infinity;
    for (let i = 0; i < 9; i++) {
      if (b[i] !== '') continue;
      b[i] = 'X';
      best = Math.min(best, this.minimax(b, depth + 1, true));
      b[i] = '';
    }
    return best;
  }

  private static findLine(b: string[]): number[] | null {
    for (const line of WIN_LINES) {
      const [a, c, d] = line;
      if (b[a] !== '' && b[a] === b[c] && b[a] === b[d]) return line;
    }
    return null;
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
