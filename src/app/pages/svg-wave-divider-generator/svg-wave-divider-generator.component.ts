import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type WaveType = 'sine' | 'double' | 'zigzag' | 'square';

interface WaveLayer {
  d: string;
  fill: string;
  opacity: string;
}

const WIDTH = 1440;
const STEP = 12;

@Component({
  selector: 'app-svg-wave-divider-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './svg-wave-divider-generator.component.html',
  styleUrl: './svg-wave-divider-generator.component.scss',
})
export class SvgWaveDividerGeneratorComponent implements OnDestroy {
  readonly slug = 'svg-wave-divider-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['svg-to-jsx-converter', 'sqlite-database-viewer', 'unit-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly waveType = signal<WaveType>('sine');
  readonly amplitude = signal(60);
  readonly wavelength = signal(360);
  readonly dividerHeight = signal(240);
  readonly layers = signal(2);
  readonly opacity = signal(85);
  readonly flip = signal(false);
  readonly color1 = signal('#4f46e5');
  readonly color2 = signal('#818cf8');
  readonly color3 = signal('#c7d2fe');
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly waveLayers = computed((): WaveLayer[] => {
    const count = this.layers();
    const height = this.dividerHeight();
    const fills = [this.color1(), this.color2(), this.color3()];
    const out: WaveLayer[] = [];
    for (let i = 0; i < count; i++) {
      const phase = (i * 2 * Math.PI) / count;
      const layerOpacity = (this.opacity() / 100) * (1 - 0.22 * i);
      out.push({
        d: this.buildPath(height, phase),
        fill: fills[i],
        opacity: layerOpacity.toFixed(2),
      });
    }
    return out;
  });

  readonly svgCode = computed((): string => {
    this.translate.lang();
    const height = this.dividerHeight();
    const paths = this.waveLayers()
      .map((layer) => `  <path d="${layer.d}" fill="${layer.fill}" fill-opacity="${layer.opacity}"/>`)
      .join('\n');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}" preserveAspectRatio="none">\n${paths}\n</svg>`;
  });

  readonly pointCount = computed(() => Math.floor(WIDTH / STEP) + 1);

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

  setWaveType(value: string): void {
    if (value === 'sine' || value === 'double' || value === 'zigzag' || value === 'square') {
      this.waveType.set(value);
    }
  }

  setAmplitude(v: number): void { this.amplitude.set(this.clampNum(v, 0, 200)); }
  setWavelength(v: number): void { this.wavelength.set(this.clampNum(v, 60, 1440)); }
  setDividerHeight(v: number): void { this.dividerHeight.set(this.clampNum(v, 120, 600)); }
  setLayers(v: number): void { this.layers.set(this.clampNum(Math.round(v), 1, 3)); }
  setOpacity(v: number): void { this.opacity.set(this.clampNum(v, 10, 100)); }
  toggleFlip(): void { this.flip.set(!this.flip()); }

  setColor(index: number, value: string): void {
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) return;
    if (index === 0) this.color1.set(value);
    else if (index === 1) this.color2.set(value);
    else this.color3.set(value);
  }

  activeFills(): string[] {
    return [this.color1(), this.color2(), this.color3()].slice(0, this.layers());
  }

  async copyCode(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.svgCode()).catch(() => undefined);
      this.copied.set(true);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(false), 1500);
    } catch {
      this.copied.set(false);
    }
  }

  downloadSvg(): void {
    const blob = new Blob([this.svgCode()], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = this.document.createElement('a');
    anchor.href = url;
    anchor.download = 'wave-divider.svg';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  ngOnDestroy() {
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private waveValue(x: number, phase: number): number {
    const height = this.dividerHeight();
    const mid = height / 2;
    const amp = this.amplitude();
    const lambda = this.wavelength();
    const dir = this.flip() ? -1 : 1;
    let shape: number;
    if (this.waveType() === 'zigzag') {
      const t = ((x / lambda + phase / (2 * Math.PI)) % 1 + 1) % 1;
      shape = t < 0.5 ? 4 * t - 1 : 3 - 4 * t;
    } else if (this.waveType() === 'square') {
      const t = ((x / lambda + phase / (2 * Math.PI)) % 1 + 1) % 1;
      shape = t < 0.5 ? -1 : 1;
    } else if (this.waveType() === 'double') {
      shape =
        (Math.sin((2 * Math.PI * x) / lambda + phase) +
          0.5 * Math.sin((4 * Math.PI * x) / lambda + phase)) /
        1.5;
    } else {
      shape = Math.sin((2 * Math.PI * x) / lambda + phase);
    }
    const y = mid + dir * amp * shape;
    return Math.min(height, Math.max(0, Math.round(y * 10) / 10));
  }

  private buildPath(height: number, phase: number): string {
    const points: string[] = [];
    for (let x = 0; x <= WIDTH; x += STEP) {
      points.push(`L${x},${this.waveValue(x, phase)}`);
    }
    return `M0,${height} ${points.join(' ')} L${WIDTH},${height} Z`;
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
