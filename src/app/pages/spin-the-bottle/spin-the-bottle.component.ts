import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const SPIN_MS = 3400;

@Component({
  selector: 'app-spin-the-bottle',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './spin-the-bottle.component.html',
  styleUrl: './spin-the-bottle.component.scss',
})
export class SpinTheBottleComponent implements OnDestroy {
  readonly slug = 'spin-the-bottle';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['tic-tac-toe', 'snake-game', 'truth-or-dare-generator', 'spin-the-wheel'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly players = signal<string[]>([]);
  readonly newName = signal('');
  readonly spinCounts = signal<number[]>([]);
  readonly bottleAngle = signal(0);
  readonly spinning = signal(false);
  readonly selected = signal<number | null>(null);

  private spinTimer: number | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly canSpin = computed(() => this.players().length >= 2 && !this.spinning());

  readonly statusText = computed(() => {
    this.translate.lang();
    if (this.spinning()) return this.t('labels.spinningMsg');
    const s = this.selected();
    if (s !== null && this.players()[s]) return `${this.t('labels.selectedMsg')} ${this.players()[s]}`;
    if (this.players().length < 2) return this.t('labels.minPlayersMsg');
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

  addPlayer(): void {
    const name = this.newName().trim().slice(0, 20);
    if (name === '' || this.players().length >= 12) return;
    this.players.set([...this.players(), name]);
    this.spinCounts.set([...this.spinCounts(), 0]);
    this.newName.set('');
    this.selected.set(null);
  }

  removePlayer(i: number): void {
    this.players.set(this.players().filter((_, k) => k !== i));
    this.spinCounts.set(this.spinCounts().filter((_, k) => k !== i));
    this.selected.set(null);
  }

  spin(): void {
    if (!this.canSpin()) return;
    const n = this.players().length;
    const target = Math.floor(Math.random() * n);
    const step = 360 / n;
    const targetAngle = target * step;
    const cur = ((this.bottleAngle() % 360) + 360) % 360;
    const delta = ((targetAngle - cur) % 360 + 360) % 360;
    const fullSpins = 5 + Math.floor(Math.random() * 3);
    this.spinning.set(true);
    this.selected.set(null);
    this.bottleAngle.set(this.bottleAngle() + fullSpins * 360 + delta);
    this.spinTimer = window.setTimeout(() => {
      this.spinTimer = null;
      this.spinning.set(false);
      this.selected.set(target);
      const counts = [...this.spinCounts()];
      counts[target] += 1;
      this.spinCounts.set(counts);
    }, SPIN_MS);
  }

  resetSpins(): void {
    this.spinCounts.set(this.players().map(() => 0));
    this.selected.set(null);
  }

  chipAngle(i: number): number {
    const n = this.players().length;
    return n === 0 ? 0 : (i * 360) / n;
  }

  removeAria(name: string): string {
    return `${this.t('labels.removeAria')} ${name}`;
  }

  ngOnDestroy(): void {
    if (this.spinTimer !== null) {
      window.clearTimeout(this.spinTimer);
      this.spinTimer = null;
    }
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
