import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type Kind = 'truth' | 'dare';

@Component({
  selector: 'app-truth-or-dare-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './truth-or-dare-generator.component.html',
  styleUrl: './truth-or-dare-generator.component.scss',
})
export class TruthOrDareGeneratorComponent implements OnDestroy {
  readonly slug = 'truth-or-dare-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['tic-tac-toe', 'snake-game', 'spin-the-bottle', 'spin-the-wheel'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly player = signal('');
  readonly kind = signal<Kind | ''>('');
  readonly prompt = signal('');
  readonly truthsDone = signal(0);
  readonly daresDone = signal(0);

  private truthDeck: number[] = [];
  private dareDeck: number[] = [];
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
      this.resetDecks();
    });
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

  draw(requested: Kind | 'random'): void {
    const kind: Kind = requested === 'random' ? (Math.random() < 0.5 ? 'truth' : 'dare') : requested;
    const pool = this.list(kind === 'truth' ? 'truths' : 'dares');
    if (pool.length === 0) return;
    let deck = kind === 'truth' ? this.truthDeck : this.dareDeck;
    if (deck.length === 0) {
      deck = this.shuffled(pool.length);
      if (kind === 'truth') this.truthDeck = deck;
      else this.dareDeck = deck;
    }
    const idx = deck.pop() as number;
    this.kind.set(kind);
    this.prompt.set(pool[idx]);
    if (kind === 'truth') this.truthsDone.set(this.truthsDone() + 1);
    else this.daresDone.set(this.daresDone() + 1);
  }

  newSession(): void {
    this.player.set('');
    this.kind.set('');
    this.prompt.set('');
    this.truthsDone.set(0);
    this.daresDone.set(0);
    this.resetDecks();
  }

  ngOnDestroy(): void {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private resetDecks(): void {
    const tLen = this.list('truths').length;
    const dLen = this.list('dares').length;
    this.truthDeck = this.shuffled(tLen);
    this.dareDeck = this.shuffled(dLen);
  }

  private shuffled(n: number): number[] {
    const deck = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
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
