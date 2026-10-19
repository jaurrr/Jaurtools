import { Component, computed, effect, inject, OnDestroy, signal, HostListener} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

interface Roll {
  dice: number[];
  total: number;
}

const SIDE_OPTIONS = [4, 6, 8, 10, 12, 20, 100];

@Component({
  selector: 'app-dice-roller',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './dice-roller.component.html',
  styleUrl: './dice-roller.component.scss',
})
export class DiceRollerComponent implements OnDestroy {
  readonly slug = 'dice-roller';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['coin-flip', 'list-randomizer', 'gaussian-random-number-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly diceCount = signal(2);
  readonly sides = signal(6);
  readonly dice = signal<number[]>([]);
  readonly rolling = signal(false);
  readonly history = signal<Roll[]>([]);

  readonly sideOptions = SIDE_OPTIONS;

  private jsonLdEl: HTMLScriptElement | null = null;
  private rollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly total = computed(() => this.dice().reduce((a, b) => a + b, 0));
  readonly minPossible = computed(() => this.diceCount());
  readonly maxPossible = computed(() => this.diceCount() * this.sides());
  readonly expected = computed(() => (this.diceCount() * (this.sides() + 1)) / 2);

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

  setDiceCount(v: number): void {
    this.diceCount.set(Math.min(6, Math.max(1, Math.round(v) || 1)));
  }

  setSides(v: number): void {
    this.sides.set(v);
  }

  roll(): void {
    if (this.rolling()) return;
    this.rolling.set(true);
    if (this.rollTimer) clearTimeout(this.rollTimer);
    this.rollTimer = setTimeout(() => {
      const values = Array.from({ length: this.diceCount() }, () => 1 + Math.floor(Math.random() * this.sides()));
      this.dice.set(values);
      this.history.update((h) => [{ dice: values, total: values.reduce((a, b) => a + b, 0) }, ...h].slice(0, 20));
      this.rolling.set(false);
    }, 600);
  }

  clear(): void {
    this.history.set([]);
    this.dice.set([]);
  }


  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const el = e.target as HTMLElement | null;
    const tag = el?.tagName ?? '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'r') this.roll();
  }

  ngOnDestroy() {
    if (this.rollTimer) clearTimeout(this.rollTimer);
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
