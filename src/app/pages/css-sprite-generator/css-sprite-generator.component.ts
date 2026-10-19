import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

interface SpriteImage {
  name: string;
  url: string;
  width: number;
  height: number;
}

@Component({
  selector: 'app-css-sprite-generator',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './css-sprite-generator.component.html',
  styleUrl: './css-sprite-generator.component.scss',
})
export class CssSpriteGeneratorComponent implements OnDestroy {
  readonly slug = 'css-sprite-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['svg-pattern-generator', 'svg-to-png-converter', 'text-to-image-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly images = signal<SpriteImage[]>([]);
  readonly direction = signal<'horizontal' | 'vertical' | 'grid'>('horizontal');
  readonly padding = signal(8);
  readonly columns = signal(3);
  readonly prefix = signal('sprite');
  readonly error = signal('');
  readonly copied = signal(false);
  readonly sheetUrl = signal('');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly layout = computed(() => {
    const imgs = this.images();
    if (imgs.length === 0) return null;
    const pad = this.padding();
    const pos: { x: number; y: number }[] = [];
    let sheetW = 0;
    let sheetH = 0;
    if (this.direction() === 'horizontal') {
      const maxH = Math.max(...imgs.map((i) => i.height));
      let x = pad;
      imgs.forEach((img) => {
        pos.push({ x, y: pad });
        x += img.width + pad;
      });
      sheetW = x;
      sheetH = maxH + pad * 2;
    } else if (this.direction() === 'vertical') {
      const maxW = Math.max(...imgs.map((i) => i.width));
      let y = pad;
      imgs.forEach((img) => {
        pos.push({ x: pad, y });
        y += img.height + pad;
      });
      sheetW = maxW + pad * 2;
      sheetH = y;
    } else {
      const cols = Math.max(1, this.columns());
      const colW = Math.max(...imgs.map((i) => i.width));
      const rowH: number[] = [];
      imgs.forEach((img, idx) => {
        const r = Math.floor(idx / cols);
        rowH[r] = Math.max(rowH[r] ?? 0, img.height);
      });
      let y = pad;
      imgs.forEach((img, idx) => {
        const c = idx % cols;
        const r = Math.floor(idx / cols);
        if (c === 0 && idx > 0) y += rowH[r - 1] + pad;
        pos.push({ x: pad + c * (colW + pad), y });
      });
      const rows = Math.ceil(imgs.length / cols);
      sheetW = pad + cols * colW + pad;
      sheetH = y + rowH[rows - 1] + pad;
    }
    return { pos, sheetW, sheetH };
  });

  readonly cssCode = computed(() => {
    const lay = this.layout();
    if (!lay) return '';
    const p = this.prefix().trim().replace(/[^a-z0-9-_]/gi, '') || 'sprite';
    const lines: string[] = [
      `.${p} {`,
      `  background-image: url('${p}.png');`,
      '  background-repeat: no-repeat;',
      '}',
    ];
    this.images().forEach((img, i) => {
      const base = img.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9-_]/gi, '-').toLowerCase() || `icon-${i + 1}`;
      const { x, y } = lay.pos[i];
      lines.push('', `.${p}-${base} {`, `  width: ${img.width}px;`, `  height: ${img.height}px;`, `  background-position: -${x}px -${y}px;`, '}');
    });
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

  onFiles(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;
    this.error.set('');
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        this.error.set(this.t('labels.errorType'));
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        this.error.set(this.t('labels.errorSize'));
        continue;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        this.images.update((arr) => [...arr, { name: file.name, url, width: img.naturalWidth, height: img.naturalHeight }]);
        this.regenerate();
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        this.error.set(this.t('labels.errorLoad'));
      };
      img.src = url;
    }
    input.value = '';
  }

  removeImage(index: number) {
    const arr = this.images();
    URL.revokeObjectURL(arr[index].url);
    this.images.update((a) => a.filter((_, i) => i !== index));
    if (this.images().length > 0) this.regenerate();
    else this.sheetUrl.set('');
  }

  setDirection(d: 'horizontal' | 'vertical' | 'grid') {
    this.direction.set(d);
    this.regenerate();
  }

  setPadding(v: number) {
    this.padding.set(this.clampNum(v, 0, 64));
    this.regenerate();
  }

  setColumns(v: number) {
    this.columns.set(Math.max(1, Math.min(10, Math.round(v) || 1)));
    this.regenerate();
  }

  setPrefix(v: string) {
    this.prefix.set(v);
  }

  regenerate() {
    const lay = this.layout();
    const imgs = this.images();
    if (!lay || imgs.length === 0) {
      this.sheetUrl.set('');
      return;
    }
    const canvas = this.document.createElement('canvas');
    canvas.width = lay.sheetW;
    canvas.height = lay.sheetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let loaded = 0;
    imgs.forEach((img, i) => {
      const el = new Image();
      el.onload = () => {
        ctx.drawImage(el, lay.pos[i].x, lay.pos[i].y);
        loaded += 1;
        if (loaded === imgs.length) this.sheetUrl.set(canvas.toDataURL('image/png'));
      };
      el.src = img.url;
    });
  }

  downloadPng() {
    const url = this.sheetUrl();
    if (!url) return;
    const a = this.document.createElement('a');
    a.href = url;
    a.download = `${this.prefix().trim().replace(/[^a-z0-9-_]/gi, '') || 'sprite'}.png`;
    a.click();
  }

  copyCss() {
    const code = this.cssCode();
    if (!code) return;
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
    for (const img of this.images()) URL.revokeObjectURL(img.url);
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
