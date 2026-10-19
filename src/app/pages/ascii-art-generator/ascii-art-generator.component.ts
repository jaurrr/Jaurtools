import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

type ArtMode = 'image' | 'text';

@Component({
  selector: 'app-ascii-art-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './ascii-art-generator.component.html',
  styleUrl: './ascii-art-generator.component.scss',
})
export class AsciiArtGeneratorComponent implements OnDestroy {
  readonly slug = 'ascii-art-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['logo-maker', 'handwriting-to-font-converter', 'case-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly mode = signal<ArtMode>('text');
  readonly text = signal('HELLO');
  readonly width = signal(70);
  readonly invert = signal(false);
  readonly art = signal('');
  readonly imageLoaded = signal(false);
  readonly error = signal('');
  readonly copied = signal(false);

  private imageEl: HTMLImageElement | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    this.render();
  }

  readonly dims = computed(() => {
    const a = this.art();
    if (!a) return '';
    const lines = a.split('\n');
    return `${lines.length} x ${lines[0]?.length ?? 0}`;
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

  setMode(m: ArtMode) {
    this.mode.set(m);
    this.render();
  }
  setText(v: string): void {
    this.text.set(v.slice(0, 2000));
    this.scheduleRender();
  }

  /** Debounced canvas re-render so typing stays smooth. */
  private renderTimer: ReturnType<typeof setTimeout> | null = null;

  private scheduleRender(): void {
    if (this.renderTimer) clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => this.render(), 250);
  }
  setWidth(v: number) {
    this.width.set(this.clampNum(v, 20, 140));
    this.render();
  }
  toggleInvert() {
    this.invert.update((v) => !v);
    this.render();
  }

  onImageSelected(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.error.set(this.t('labels.badTypeError'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.error.set(this.t('labels.tooBigError'));
      return;
    }
    this.error.set('');
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        this.imageEl = img;
        this.imageLoaded.set(true);
        this.mode.set('image');
        this.render();
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  copy() {
    if (!this.art()) return;
    navigator.clipboard.writeText(this.art()).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }).catch(() => undefined);
  }

  download() {
    if (!this.art()) return;
    const blob = new Blob([this.art()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'ascii-art.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  ngOnDestroy() {
    if (this.renderTimer) clearTimeout(this.renderTimer);
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private render() {
    const cols = this.width();
    const ramp = this.invert() ? ' .:-=+*#%@' : '@%#*+=-:. ';
    const canvas = this.document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rows: number;
    let cellW: number;
    let cellH: number;

    if (this.mode() === 'text') {
      cellW = 10;
      cellH = 20;
      canvas.width = cols * cellW;
      canvas.height = 200;
      rows = Math.floor(canvas.height / cellH);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = this.text().trim() === '' ? '?' : this.text();
      let size = 150;
      ctx.font = `700 ${size}px ui-monospace, monospace`;
      while (size > 12 && ctx.measureText(label).width > canvas.width - cellW) {
        size -= 6;
        ctx.font = `700 ${size}px ui-monospace, monospace`;
      }
      ctx.fillText(label, canvas.width / 2, canvas.height / 2);
    } else {
      const img = this.imageEl;
      if (!img || !img.naturalWidth) {
        this.art.set('');
        return;
      }
      rows = Math.max(4, Math.round(((cols * img.naturalHeight) / img.naturalWidth / 2) * 100) / 100);
      canvas.width = cols;
      canvas.height = Math.round(rows);
      rows = canvas.height;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      cellW = 1;
      cellH = 1;
    }

    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const lines: string[] = [];
    for (let r = 0; r < rows; r++) {
      let line = '';
      for (let c = 0; c < cols; c++) {
        let sum = 0;
        let n = 0;
        for (let y = r * cellH; y < (r + 1) * cellH && y < canvas.height; y++) {
          for (let x = c * cellW; x < (c + 1) * cellW && x < canvas.width; x++) {
            const i = (y * canvas.width + x) * 4;
            sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
            n++;
          }
        }
        const avg = n > 0 ? sum / n : 255;
        const idx = Math.min(ramp.length - 1, Math.floor((avg / 255) * ramp.length));
        line += ramp[idx];
      }
      lines.push(line);
    }
    this.art.set(lines.join('\n'));
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }

  private clampNum(v: number, min: number, max: number): number {
    if (!Number.isFinite(v)) return min;
    return Math.min(max, Math.max(min, Math.round(v)));
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
