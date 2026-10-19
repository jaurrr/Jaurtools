import { Component, computed, effect, inject, OnDestroy, signal, HostListener} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

type Side = 'heads' | 'tails';

@Component({
  selector: 'app-coin-flip',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './coin-flip.component.html',
  styleUrl: './coin-flip.component.scss',
})
export class CoinFlipComponent implements OnDestroy {
  readonly slug = 'coin-flip';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['dice-roller', 'list-randomizer', 'gaussian-random-number-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly result = signal<Side | null>(null);
  readonly flipping = signal(false);
  readonly headsCount = signal(0);
  readonly tailsCount = signal(0);
  readonly streakSide = signal<Side | null>(null);
  readonly streakCount = signal(0);
  readonly history = signal<Side[]>([]);

  private jsonLdEl: HTMLScriptElement | null = null;
  private flipTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly total = computed(() => this.headsCount() + this.tailsCount());

  readonly headsPct = computed(() => {
    const t = this.total();
    return t === 0 ? 0 : Math.round((this.headsCount() / t) * 100);
  });

  readonly resultLabel = computed(() => {
    const r = this.result();
    return r ? this.t('labels.' + r) : this.t('labels.noFlipYet');
  });

  readonly streakLabel = computed(() => {
    const s = this.streakSide();
    return s ? `${this.streakCount()} x ${this.t('labels.' + s)}` : '';
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

  flip(): void {
    if (this.flipping()) return;
    this.flipping.set(true);
    if (this.flipTimer) clearTimeout(this.flipTimer);
    this.flipTimer = setTimeout(() => {
      const side: Side = Math.random() < 0.5 ? 'heads' : 'tails';
      this.result.set(side);
      if (side === 'heads') this.headsCount.update((c) => c + 1);
      else this.tailsCount.update((c) => c + 1);
      if (this.streakSide() === side) this.streakCount.update((c) => c + 1);
      else {
        this.streakSide.set(side);
        this.streakCount.set(1);
      }
      this.history.update((h) => [side, ...h].slice(0, 20));
      this.flipping.set(false);
    }, 900);
  }

  reset(): void {
    if (this.flipTimer) clearTimeout(this.flipTimer);
    this.flipping.set(false);
    this.result.set(null);
    this.headsCount.set(0);
    this.tailsCount.set(0);
    this.streakSide.set(null);
    this.streakCount.set(0);
    this.history.set([]);
  }


  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const el = e.target as HTMLElement | null;
    const tag = el?.tagName ?? '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'r') this.flip();
  }

  ngOnDestroy() {
    if (this.flipTimer) clearTimeout(this.flipTimer);
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
