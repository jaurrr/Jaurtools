import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

type Unit = 'paragraphs' | 'sentences' | 'words';
type Style = 'classic' | 'tech' | 'nature';

const CLASSIC = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
  'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum.',
  'Excepteur sint occaecat cupidatat non proident, sunt in culpa.',
  'Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit.',
  'Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet.',
  'Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis.',
  'Quis autem vel eum iure reprehenderit qui in ea voluptate velit.',
  'At vero eos et accusamus et iusto odio dignissimos ducimus.',
];

const TECH = [
  'The serverless function scales automatically under sudden traffic spikes.',
  'Developers ship features faster with continuous integration pipelines.',
  'Encrypted backups protect critical data against ransomware attacks.',
  'Responsive layouts adapt gracefully from phones to wide monitors.',
  'Caching layers reduce database load during peak shopping hours.',
  'Type-safe APIs catch integration bugs before they reach production.',
  'Container orchestration keeps microservices healthy around the clock.',
  'Dark mode interfaces reduce eye strain during late-night coding sessions.',
  'Automated tests guard every pull request against regressions.',
  'Edge networks deliver static assets from the nearest data centre.',
];

const NATURE = [
  'Morning mist settles softly over the quiet pine forest.',
  'Rivers carve winding paths through ancient stone valleys.',
  'Wildflowers bloom in waves across the spring meadow.',
  'Snow-capped peaks glow pink at the edge of dawn.',
  'Ocean waves polish smooth stones along the empty shore.',
  'Fireflies drift like lanterns through the summer night.',
  'Autumn leaves spiral down in crisp golden showers.',
  'Desert dunes shift shapes under the restless wind.',
  'Thunderheads gather dark over the distant savanna.',
  'Coral gardens shelter a thousand darting silver fish.',
];

@Component({
  selector: 'app-lorem-ipsum-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './lorem-ipsum-generator.component.html',
  styleUrl: './lorem-ipsum-generator.component.scss',
})
export class LoremIpsumGeneratorComponent implements OnDestroy {
  readonly slug = 'lorem-ipsum-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['bionic-reading-converter', 'citation-generator', 'line-counter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly count = signal(3);
  readonly unit = signal<Unit>('paragraphs');
  readonly style = signal<Style>('classic');
  readonly startWithLorem = signal(true);
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly output = computed(() => {
    const bank = this.style() === 'tech' ? TECH : this.style() === 'nature' ? NATURE : CLASSIC;
    const n = this.count();
    const unit = this.unit();
    const loremFirst = this.startWithLorem() && this.style() === 'classic';

    if (unit === 'words') {
      const pool = bank.join(' ').split(' ');
      const words: string[] = [];
      if (loremFirst) {
        for (const w of CLASSIC[0].split(' ')) {
          if (words.length >= n) break;
          words.push(w);
        }
      }
      let i = 0;
      while (words.length < n) {
        words.push(pool[i % pool.length]);
        i++;
      }
      const text = words.join(' ');
      return text.charAt(0).toUpperCase() + text.slice(1) + '.';
    }

    const total = unit === 'sentences' ? n : n * 5;
    const sentences: string[] = [];
    for (let i = 0; i < total; i++) sentences.push(bank[i % bank.length]);
    if (loremFirst && sentences.length > 0) sentences[0] = CLASSIC[0];

    if (unit === 'sentences') return sentences.join(' ');
    const paras: string[] = [];
    for (let p = 0; p < n; p++) paras.push(sentences.slice(p * 5, p * 5 + 5).join(' '));
    return paras.join('\n\n');
  });

  readonly wordCount = computed(() => {
    const t = this.output().trim();
    return t === '' ? 0 : t.split(/\s+/).length;
  });

  readonly charCount = computed(() => this.output().length);

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

  setCount(v: number) {
    this.count.set(this.clampNum(v, 1, 50));
  }
  setUnit(u: Unit) {
    this.unit.set(u);
  }
  setStyle(s: Style) {
    this.style.set(s);
  }
  toggleStartWithLorem() {
    this.startWithLorem.update((v) => !v);
  }

  copy() {
    if (!this.output()) return;
    navigator.clipboard.writeText(this.output()).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }).catch(() => undefined);
  }

  download() {
    if (!this.output()) return;
    const blob = new Blob([this.output()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'lorem-ipsum.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private clampNum(v: number, min: number, max: number): number {
    if (!Number.isFinite(v)) return min;
    return Math.min(max, Math.max(min, Math.round(v)));
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
    const selector = hreflang
      ? `link[rel="${rel}"][hreflang="${hreflang}"]`
      : `link[rel="${rel}"]:not([hreflang])`;
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
