import { Component, computed, effect, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface BuiltinIcon {
  key: string;
  path: string;
}

const ICONS: BuiltinIcon[] = [
  { key: 'heart', path: 'M12 21c-4.8-3.6-8-6.6-8-10a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 11c0 3.4-3.2 6.4-8 10z' },
  { key: 'star', path: 'M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z' },
  { key: 'home', path: 'M12 3l9 8h-3v9h-4v-6h-4v6H6v-9H3z' },
  { key: 'bell', path: 'M12 22c1.4 0 2.5-1.1 2.5-2.5h-5C9.5 20.9 10.6 22 12 22zm6-6v-5a6 6 0 0 0-4.5-5.8V4.5a1.5 1.5 0 0 0-3 0v.7A6 6 0 0 0 6 11v5l-2 2v1h16v-1z' },
  { key: 'user', path: 'M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5z' },
  { key: 'search', path: 'M10 2a8 8 0 1 0 4.9 14.3l5 5a1.4 1.4 0 0 0 2-2l-5-5A8 8 0 0 0 10 2zm0 2a6 6 0 1 1-6 6 6 6 0 0 1 6-6z' },
  { key: 'camera', path: 'M4 7h3l2-2h6l2 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zm8 9.5A3.8 3.8 0 1 0 12 8.7a3.8 3.8 0 0 0 0 7.8z' },
  { key: 'music', path: 'M9 18.5A2.5 2.5 0 1 1 6.5 16c.6 0 1.2.2 1.6.6V4h11v13.5a2.5 2.5 0 1 1-1.5-2.3V6H10v12.5z' },
  { key: 'envelope', path: 'M2 5a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1zm2 2.3V18h16V7.3l-8 5.3z' },
  { key: 'phone', path: 'M6.6 3h3l1.5 5-2 1.5a12 12 0 0 0 5.4 5.4l1.5-2 5 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.2 2 2 0 0 1 6.6 3z' },
  { key: 'lock', path: 'M12 2a5 5 0 0 0-5 5v4H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-1V7a5 5 0 0 0-5-5zm-3 9V7a3 3 0 0 1 6 0v4z' },
  { key: 'check', path: 'M9.5 16.2L5.8 12.5 4.4 13.9l5.1 5.1L19.6 8.9 18.2 7.5z' },
  { key: 'close', path: 'M6.4 5L5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z' },
  { key: 'plus', path: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z' },
  { key: 'download', path: 'M11 3h2v10.2l3.6-3.6 1.4 1.4-6 6-6-6 1.4-1.4 3.6 3.6zm-7 16h16v2H4z' },
  { key: 'upload', path: 'M11 11.8L7.4 15.4 6 14l6-6 6 6-1.4 1.4L13 11.8V3h-2zM4 19h16v2H4z' },
  { key: 'image', path: 'M3 4h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm4 3.5A1.8 1.8 0 1 0 7 11a1.8 1.8 0 0 0 0-3.5zM4 17l5-5 3.5 3.5L16 12l4 4z' },
  { key: 'folder', path: 'M2 5a1 1 0 0 1 1-1h6l2 2h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z' },
  { key: 'arrowRight', path: 'M4 11h12.2l-4.6-4.6L13 5l7 7-7 7-1.4-1.4 4.6-4.6H4z' },
  { key: 'moon', path: 'M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z' },
];

@Component({
  selector: 'app-icon-to-png-converter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './icon-to-png-converter.component.html',
  styleUrl: './icon-to-png-converter.component.scss',
})
export class IconToPngConverterComponent implements OnDestroy {
  readonly slug = 'icon-to-png-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['favicon-generator', 'image-to-ico-converter', 'ico-editor', 'image-color-extractor'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly icons = ICONS;
  readonly selected = signal('heart');
  readonly customPath = signal('');
  readonly useCustom = signal(false);
  readonly iconColor = signal('#0f172a');
  readonly bgEnabled = signal(false);
  readonly bgColor = signal('#ffffff');
  readonly size = signal(256);
  readonly padding = signal(10);
  readonly pathError = signal('');

  private readonly stage = viewChild<ElementRef<HTMLCanvasElement>>('stage');
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    effect(() => {
      this.selected();
      this.customPath();
      this.useCustom();
      this.iconColor();
      this.bgEnabled();
      this.bgColor();
      this.size();
      this.padding();
      this.render();
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

  iconName(key: string): string {
    return this.t(`labels.names.${key}`);
  }

  selectIcon(key: string): void {
    this.selected.set(key);
    this.useCustom.set(false);
  }
  setCustomPath(v: string): void {
    this.customPath.set(v);
    if (v.trim()) this.useCustom.set(true);
  }
  setColor(v: string): void { this.iconColor.set(v); }
  setBg(v: string): void { this.bgColor.set(v); }
  setSize(v: number): void { this.size.set(this.clampNum(v, 16, 1024)); }
  setPadding(v: number): void { this.padding.set(this.clampNum(v, 0, 40)); }
  toggleBg(): void { this.bgEnabled.update((v) => !v); }

  download(): void {
    const canvas = this.stage()?.nativeElement;
    if (!canvas || this.pathError()) return;
    const a = this.document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    const name = this.useCustom() ? 'custom-icon' : this.selected();
    a.download = `${name}-${this.size()}px.png`;
    this.document.body.appendChild(a);
    a.click();
    a.remove();
  }

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private currentPath(): string {
    if (this.useCustom()) return this.customPath().trim();
    return this.icons.find((i) => i.key === this.selected())?.path ?? '';
  }

  private render(): void {
    const canvas = this.stage()?.nativeElement;
    if (!canvas) return;
    const size = this.size();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (this.bgEnabled()) {
      ctx.fillStyle = this.bgColor();
      ctx.fillRect(0, 0, size, size);
    } else {
      ctx.clearRect(0, 0, size, size);
    }
    const d = this.currentPath();
    if (!d) {
      this.pathError.set(this.t('labels.emptyPath'));
      return;
    }
    let path: Path2D;
    try {
      path = new Path2D(d);
    } catch {
      this.pathError.set(this.t('labels.badPath'));
      return;
    }
    this.pathError.set('');
    const pad = (size * this.padding()) / 100;
    const content = size - pad * 2;
    ctx.save();
    ctx.translate(pad, pad);
    ctx.scale(content / 24, content / 24);
    ctx.fillStyle = this.iconColor();
    ctx.fill(path);
    ctx.restore();
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }
  private clampNum(v: number, min: number, max: number): number {
    if (!Number.isFinite(v)) return min;
    return Math.min(max, Math.max(min, Math.round(v * 100) / 100));
  }
  private locale(): string {
    const lang = this.translate.lang();
    return lang === 'ar' ? 'ar-SA' : lang === 'hi' ? 'hi-IN' : 'en-IN';
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
