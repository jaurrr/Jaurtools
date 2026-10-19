import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta, DomSanitizer } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-svg-blob-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './svg-blob-generator.component.html',
  styleUrl: './svg-blob-generator.component.scss',
})
export class SvgBlobGeneratorComponent implements OnDestroy {
  readonly slug = 'svg-blob-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['svg-pattern-generator', 'svg-editor', 'text-to-image-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly sanitizer = inject(DomSanitizer);

  readonly points = signal(8);
  readonly irregularity = signal(30);
  readonly smoothness = signal(80);
  readonly size = signal(400);
  readonly fill = signal('#4f46e5');
  readonly rotation = signal(0);
  readonly seed = signal(7);
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private rand(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  readonly blobPath = computed(() => {
    const n = this.points();
    const irr = this.irregularity() / 100;
    const rng = this.rand(this.seed());
    const c = this.size() / 2;
    const r = this.size() * 0.4;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i += 1) {
      const angle = (i / n) * Math.PI * 2 + (rng() - 0.5) * 0.4;
      const rad = r * (1 + (rng() * 2 - 1) * irr);
      pts.push({ x: c + Math.cos(angle) * rad, y: c + Math.sin(angle) * rad });
    }
    const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    });
    let d = '';
    const smooth = this.smoothness() / 100;
    if (smooth <= 0) {
      d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
      for (let i = 1; i < n; i += 1) d += ` L ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`;
      d += ' Z';
    } else {
      const m0 = mid(pts[0], pts[1]);
      d = `M ${m0.x.toFixed(1)} ${m0.y.toFixed(1)}`;
      for (let i = 1; i <= n; i += 1) {
        const p = pts[i % n];
        const m = mid(p, pts[(i + 1) % n]);
        d += ` Q ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${m.x.toFixed(1)} ${m.y.toFixed(1)}`;
      }
      d += ' Z';
    }
    return d;
  });

  readonly svgCode = computed(
    () =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.size()} ${this.size()}" width="${this.size()}" height="${this.size()}">\n` +
      `  <path d="${this.blobPath()}" fill="${this.fill()}" transform="rotate(${this.rotation()} ${this.size() / 2} ${this.size() / 2})" />\n</svg>`
  );

  readonly preview = computed(() => this.sanitizer.bypassSecurityTrustHtml(this.svgCode()));

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

  setPoints(v: number) { this.points.set(Math.round(this.clampNum(v, 5, 14))); }
  setIrregularity(v: number) { this.irregularity.set(this.clampNum(v, 0, 80)); }
  setSmoothness(v: number) { this.smoothness.set(this.clampNum(v, 0, 100)); }
  setSize(v: number) { this.size.set(Math.round(this.clampNum(v, 100, 800))); }
  setFill(v: string) { this.fill.set(v); }
  setRotation(v: number) { this.rotation.set(this.clampNum(v, 0, 360)); }

  randomize() {
    this.seed.set(Math.floor(Math.random() * 100000));
  }

  downloadSvg() {
    const blob = new Blob([this.svgCode()], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'blob.svg';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  copySvg() {
    const code = this.svgCode();
    const done = () => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).then(done).catch(() => this.fallbackCopy(code, done));
    } else {
      this.fallbackCopy(code, done);
    }
  }

  private fallbackCopy(text: string, done: () => void) {
    const ta = this.document.createElement('textarea');
    ta.value = text;
    this.document.body.appendChild(ta);
    ta.select();
    try {
      this.document.execCommand('copy');
      done();
    } catch {
      /* clipboard unavailable */
    }
    ta.remove();
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
