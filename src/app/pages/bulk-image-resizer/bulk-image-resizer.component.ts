import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

interface ResizedItem {
  name: string;
  dataUrl: string;
  w: number;
  h: number;
  sizeKB: number;
}

@Component({
  selector: 'app-bulk-image-resizer',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './bulk-image-resizer.component.html',
  styleUrl: './bulk-image-resizer.component.scss',
})
export class BulkImageResizerComponent implements OnDestroy {
  readonly slug = 'bulk-image-resizer';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['photo-joiner', 'blurred-frame-maker', 'shape-cropper'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly mode = signal<'percent' | 'maxwidth' | 'maxheight' | 'exact'>('percent');
  readonly percent = signal(50);
  readonly maxW = signal(800);
  readonly maxH = signal(800);
  readonly exactW = signal(800);
  readonly exactH = signal(600);
  readonly format = signal<'keep' | 'png' | 'jpeg'>('keep');
  readonly items = signal<ResizedItem[]>([]);
  readonly processing = signal(false);
  readonly fileError = signal('');

  private pendingTimers: ReturnType<typeof setTimeout>[] = [];
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly count = computed(() => this.items().length);

  readonly totalKB = computed(() =>
    Math.round(this.items().reduce((sum, it) => sum + it.sizeKB, 0) * 10) / 10
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

  modeLabel(m: string): string {
    const map: Record<string, string> = {
      percent: 'modePercent', maxwidth: 'modeMaxWidth', maxheight: 'modeMaxHeight', exact: 'modeExact',
    };
    return this.t(`labels.${map[m] ?? 'modePercent'}`);
  }

  setMode(m: 'percent' | 'maxwidth' | 'maxheight' | 'exact'): void {
    this.mode.set(m);
    this.reprocess();
  }
  setPercent(v: number): void { this.percent.set(this.clampNum(v, 1, 100)); this.reprocess(); }
  setMaxW(v: number): void { this.maxW.set(this.clampNum(v, 16, 8000)); this.reprocess(); }
  setMaxH(v: number): void { this.maxH.set(this.clampNum(v, 16, 8000)); this.reprocess(); }
  setExactW(v: number): void { this.exactW.set(this.clampNum(v, 16, 8000)); this.reprocess(); }
  setExactH(v: number): void { this.exactH.set(this.clampNum(v, 16, 8000)); this.reprocess(); }
  setFormat(f: 'keep' | 'png' | 'jpeg'): void { this.format.set(f); this.reprocess(); }

  onFilesSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;
    if (files.length > 20) {
      this.fileError.set(this.t('labels.tooMany'));
      return;
    }
    this.fileError.set('');
    this.processing.set(true);
    const sources: HTMLImageElement[] = [];
    const names: string[] = [];
    const types: string[] = [];
    let loaded = 0;
    let skipped = 0;
    const finish = () => {
      this.processing.set(false);
      if (skipped > 0 && sources.length === 0) {
        this.fileError.set(this.t('labels.loadFailed'));
      }
      this.buildItems(sources, names, types);
    };
    for (const file of files) {
      if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
        skipped++;
        if (++loaded === files.length) finish();
        continue;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        sources.push(img);
        names.push(file.name);
        types.push(file.type);
        if (++loaded === files.length) finish();
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        skipped++;
        if (++loaded === files.length) finish();
      };
      img.src = url;
    }
  }

  private sources: { img: HTMLImageElement; name: string; type: string }[] = [];

  private buildItems(
    imgs: HTMLImageElement[],
    names: string[],
    types: string[]
  ): void {
    this.sources = imgs.map((img, i) => ({ img, name: names[i], type: types[i] }));
    this.reprocess();
  }

  private reprocess(): void {
    if (!this.sources.length) {
      this.items.set([]);
      return;
    }
    const out: ResizedItem[] = [];
    for (const s of this.sources) {
      const iw = s.img.naturalWidth;
      const ih = s.img.naturalHeight;
      let tw = iw;
      let th = ih;
      const m = this.mode();
      if (m === 'percent') {
        const p = this.percent() / 100;
        tw = Math.max(1, Math.round(iw * p));
        th = Math.max(1, Math.round(ih * p));
      } else if (m === 'maxwidth') {
        const sc = Math.min(1, this.maxW() / iw);
        tw = Math.max(1, Math.round(iw * sc));
        th = Math.max(1, Math.round(ih * sc));
      } else if (m === 'maxheight') {
        const sc = Math.min(1, this.maxH() / ih);
        tw = Math.max(1, Math.round(iw * sc));
        th = Math.max(1, Math.round(ih * sc));
      } else {
        tw = Math.round(this.exactW());
        th = Math.round(this.exactH());
      }
      const canvas = this.document.createElement('canvas');
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.drawImage(s.img, 0, 0, tw, th);
      const fmt = this.format();
      const mime = fmt === 'png' ? 'image/png' : fmt === 'jpeg' ? 'image/jpeg' : s.type || 'image/png';
      const dataUrl = canvas.toDataURL(mime, 0.92);
      const sizeKB = Math.round(((dataUrl.length * 3) / 4 / 1024) * 10) / 10;
      out.push({ name: s.name, dataUrl, w: tw, h: th, sizeKB });
    }
    this.items.set(out);
  }

  downloadItem(i: number): void {
    const it = this.items()[i];
    if (!it) return;
    const a = this.document.createElement('a');
    a.download = this.outName(it.name);
    a.href = it.dataUrl;
    a.click();
  }

  downloadAll(): void {
    const list = this.items();
    list.forEach((it, i) => {
      const id = setTimeout(() => this.downloadItem(i), i * 600);
      this.pendingTimers.push(id);
    });
  }

  ngOnDestroy(): void {
    this.pendingTimers.forEach((id) => clearTimeout(id));
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private outName(name: string): string {
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = this.format() === 'png' ? 'png' : this.format() === 'jpeg' ? 'jpg' : dot > 0 ? name.slice(dot + 1) : 'png';
    return `${base}-resized.${ext}`;
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }

  private clampNum(v: number, min: number, max: number): number {
    if (!Number.isFinite(v)) return min;
    return Math.min(max, Math.max(min, Math.round(v * 100) / 100));
  }

  private updateSeo(): void {
    const lang = this.translate.lang();
    this.pageTitle.setTitle(this.t('metaTitle'));
    this.meta.updateTag({ name: 'description', content: this.t('metaDescription') });
    this.meta.updateTag({ name: 'keywords', content: this.t('keywords') });
    this.setLink('canonical', `https://jaurtools.com/${lang}/${this.slug}`);
    for (const l of ['en', 'hi', 'ar']) {
      this.setLink('alternate', `https://jaurtools.com/${l}/${this.slug}`, l);
    }
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
