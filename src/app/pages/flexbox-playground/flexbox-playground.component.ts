import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const DIRECTIONS = ['row', 'row-reverse', 'column', 'column-reverse'];
const JUSTIFIES = ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'];
const ALIGNS = ['stretch', 'flex-start', 'center', 'flex-end', 'baseline'];
const WRAPS = ['nowrap', 'wrap', 'wrap-reverse'];
const SELF_ALIGNS = ['auto', 'flex-start', 'center', 'flex-end', 'stretch', 'baseline'];

@Component({
  selector: 'app-flexbox-playground',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './flexbox-playground.component.html',
  styleUrl: './flexbox-playground.component.scss',
})
export class FlexboxPlaygroundComponent implements OnDestroy {
  readonly slug = 'flexbox-playground';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['css-loader-generator', 'css-switch-generator', 'css-text-glitch-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly direction = signal('row');
  readonly justify = signal('center');
  readonly alignItems = signal('center');
  readonly wrap = signal('wrap');
  readonly gap = signal(16);
  readonly itemCount = signal(4);
  readonly selectedItem = signal(3);
  readonly itemAlignSelf = signal('flex-start');
  readonly itemGrow = signal(1);
  readonly copied = signal(false);

  readonly directions = DIRECTIONS;
  readonly justifies = JUSTIFIES;
  readonly aligns = ALIGNS;
  readonly wraps = WRAPS;
  readonly selfAligns = SELF_ALIGNS;

  private jsonLdEl: HTMLScriptElement | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly items = computed(() => Array.from({ length: this.itemCount() }, (_, i) => i + 1));

  readonly css = computed(() => {
    const lines = [
      '.container {',
      '  display: flex;',
      `  flex-direction: ${this.direction()};`,
      `  justify-content: ${this.justify()};`,
      `  align-items: ${this.alignItems()};`,
      `  flex-wrap: ${this.wrap()};`,
      `  gap: ${this.gap()}px;`,
      '}',
    ];
    const n = this.selectedItem();
    if (n >= 1 && n <= this.itemCount() && (this.itemAlignSelf() !== 'auto' || this.itemGrow() !== 0)) {
      lines.push('', `.item-${n} {`);
      if (this.itemAlignSelf() !== 'auto') lines.push(`  align-self: ${this.itemAlignSelf()};`);
      if (this.itemGrow() !== 0) lines.push(`  flex-grow: ${this.itemGrow()};`);
      lines.push('}');
    }
    return lines.join('\n');
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

  tc(key: string): string {
    this.translate.lang();
    const raw = (this.translate.t as unknown as (k: string) => unknown)(`common.${key}`);
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

  setDirection(v: string) { this.direction.set(v); }
  setJustify(v: string) { this.justify.set(v); }
  setAlignItems(v: string) { this.alignItems.set(v); }
  setWrap(v: string) { this.wrap.set(v); }
  setGap(v: number) { this.gap.set(this.clampNum(v, 0, 48)); }
  setItemCount(v: number) {
    const n = this.clampNum(v, 2, 8);
    this.itemCount.set(n);
    if (this.selectedItem() > n) this.selectedItem.set(n);
  }
  setSelectedItem(n: number) { this.selectedItem.set(n); }
  setItemAlignSelf(v: string) { this.itemAlignSelf.set(v); }
  setItemGrow(v: number) { this.itemGrow.set(this.clampNum(v, 0, 3)); }

  copyText(text: string) {
    const done = () => {
      this.copied.set(true);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => this.legacyCopy(text, done));
    } else {
      this.legacyCopy(text, done);
    }
  }

  ngOnDestroy() {
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private legacyCopy(text: string, done: () => void) {
    const ta = this.document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    this.document.body.appendChild(ta);
    ta.select();
    try { this.document.execCommand('copy'); } catch { /* clipboard unavailable */ }
    ta.remove();
    done();
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }

  private clampNum(v: number, min: number, max: number): number {
    if (!Number.isFinite(v)) return min;
    return Math.min(max, Math.max(min, Math.round(v * 100) / 100));
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
