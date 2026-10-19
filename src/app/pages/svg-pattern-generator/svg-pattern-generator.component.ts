import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta, DomSanitizer } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type ShapeKind = 'circle' | 'square' | 'triangle' | 'diamond' | 'stripes';

@Component({
  selector: 'app-svg-pattern-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './svg-pattern-generator.component.html',
  styleUrl: './svg-pattern-generator.component.scss',
})
export class SvgPatternGeneratorComponent implements OnDestroy {
  readonly slug = 'svg-pattern-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['svg-blob-generator', 'css-sprite-generator', 'svg-editor'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly sanitizer = inject(DomSanitizer);

  readonly shape = signal<ShapeKind>('circle');
  readonly tile = signal(80);
  readonly shapeSize = signal(50);
  readonly bgColor = signal('#ffffff');
  readonly shapeColor = signal('#4f46e5');
  readonly rotation = signal(0);
  readonly shapes: ShapeKind[] = ['circle', 'square', 'triangle', 'diamond', 'stripes'];

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private shapeMarkup(t: number, s: number, color: string): string {
    const c = t / 2;
    const half = s / 2;
    const f = (n: number) => n.toFixed(1);
    switch (this.shape()) {
      case 'circle':
        return `<circle cx="${f(c)}" cy="${f(c)}" r="${f(half)}" fill="${color}"/>`;
      case 'square':
        return `<rect x="${f(c - half)}" y="${f(c - half)}" width="${f(s)}" height="${f(s)}" fill="${color}"/>`;
      case 'triangle':
        return `<polygon points="${f(c)},${f(c - half)} ${f(c + half)},${f(c + half)} ${f(c - half)},${f(c + half)}" fill="${color}"/>`;
      case 'diamond':
        return `<polygon points="${f(c)},${f(c - half)} ${f(c + half)},${f(c)} ${f(c)},${f(c + half)} ${f(c - half)},${f(c)}" fill="${color}"/>`;
      case 'stripes':
        return `<rect x="0" y="${f(c - half / 2)}" width="${f(t)}" height="${f(half)}" fill="${color}"/>`;
    }
  }

  readonly tileSvg = computed(() => {
    const t = this.tile();
    const s = (t * this.shapeSize()) / 100;
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t} ${t}" width="${t}" height="${t}">\n` +
      `  <rect width="${t}" height="${t}" fill="${this.bgColor()}"/>\n` +
      `  <g transform="rotate(${this.rotation()} ${t / 2} ${t / 2})">${this.shapeMarkup(t, s, this.shapeColor())}</g>\n</svg>`
    );
  });

  readonly fullSvg = computed(() => {
    const t = this.tile();
    const s = (t * this.shapeSize()) / 100;
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">\n` +
      `  <defs>\n` +
      `    <pattern id="p" width="${t}" height="${t}" patternUnits="userSpaceOnUse">\n` +
      `      <rect width="${t}" height="${t}" fill="${this.bgColor()}"/>\n` +
      `      <g transform="rotate(${this.rotation()} ${t / 2} ${t / 2})">${this.shapeMarkup(t, s, this.shapeColor())}</g>\n` +
      `    </pattern>\n` +
      `  </defs>\n` +
      `  <rect width="800" height="600" fill="url(#p)"/>\n</svg>`
    );
  });

  readonly preview = computed(() => this.sanitizer.bypassSecurityTrustHtml(this.fullSvg()));

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

  setShape(s: ShapeKind) { this.shape.set(s); }
  setTile(v: number) { this.tile.set(Math.round(this.clampNum(v, 40, 200))); }
  setShapeSize(v: number) { this.shapeSize.set(this.clampNum(v, 10, 100)); }
  setBgColor(v: string) { this.bgColor.set(v); }
  setShapeColor(v: string) { this.shapeColor.set(v); }
  setRotation(v: number) { this.rotation.set(this.clampNum(v, 0, 360)); }

  downloadTile() {
    const url = URL.createObjectURL(new Blob([this.tileSvg()], { type: 'image/svg+xml' }));
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'pattern-tile.svg';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  downloadFull() {
    const url = URL.createObjectURL(new Blob([this.fullSvg()], { type: 'image/svg+xml' }));
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'pattern.svg';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  downloadPng() {
    const svgText = this.fullSvg();
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      const canvas = this.document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, 800, 600);
        const a = this.document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = 'pattern.png';
        a.click();
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
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
