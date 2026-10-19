import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-react-native-shadow-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './react-native-shadow-generator.component.html',
  styleUrl: './react-native-shadow-generator.component.scss',
})
export class ReactNativeShadowGeneratorComponent implements OnDestroy {
  readonly slug = 'react-native-shadow-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['box-shadow-generator', 'css-gradient-generator', 'border-radius-generator', 'react-native-style-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly shadowColor = signal('#000000');
  readonly offsetX = signal(0);
  readonly offsetY = signal(4);
  readonly radius = signal(6);
  readonly opacity = signal(25);
  readonly elevation = signal(4);
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly rgba = computed(() => {
    const hex = this.shadowColor();
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${this.opacity() / 100})`;
  });

  readonly cssPreview = computed(() =>
    `box-shadow: ${this.offsetX()}px ${this.offsetY()}px ${this.radius()}px ${this.rgba()};`
  );

  readonly rnCode = computed(() =>
`// iOS shadow
shadowColor: '${this.shadowColor()}',
shadowOffset: { width: ${this.offsetX()}, height: ${this.offsetY()} },
shadowOpacity: ${(this.opacity() / 100).toFixed(2)},
shadowRadius: ${this.radius()},

// Android shadow
elevation: ${this.elevation()},`
  );

  readonly stylesheetCode = computed(() =>
`import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
${this.rnCode().split('\n').map((l) => '    ' + l).join('\n')}
  },
});`
  );

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

  setShadowColor(v: string) { this.shadowColor.set(/^#[0-9a-fA-F]{6}$/.test(v) ? v : '#000000'); }
  setOffsetX(v: number) { this.offsetX.set(this.clampNum(v, -40, 40)); }
  setOffsetY(v: number) { this.offsetY.set(this.clampNum(v, -40, 40)); }
  setRadius(v: number) { this.radius.set(this.clampNum(v, 0, 40)); }
  setOpacity(v: number) { this.opacity.set(this.clampNum(v, 0, 100)); }
  setElevation(v: number) { this.elevation.set(this.clampNum(v, 0, 24)); }

  async copyCode() {
    try {
      await navigator.clipboard.writeText(this.stylesheetCode()).catch(() => undefined);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } catch {
      this.copied.set(false);
    }
  }

  downloadCode() {
    const blob = new Blob([this.stylesheetCode()], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'shadow-styles.js';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
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
