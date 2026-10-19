import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

const MAX_FILE_BYTES = 20 * 1024 * 1024;

interface ExifRow {
  key: string;
  value: string;
}

@Component({
  selector: 'app-exif-viewer',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './exif-viewer.component.html',
  styleUrl: './exif-viewer.component.scss',
})
export class ExifViewerComponent implements OnDestroy {
  readonly slug = 'exif-viewer';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['image-color-extractor', 'image-cropper', 'rotate-flip-photo'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly errorMsg = signal('');
  readonly loaded = signal(false);
  readonly fileName = signal('');
  readonly fileSize = signal(0);
  readonly fileType = signal('');
  readonly imgW = signal(0);
  readonly imgH = signal(0);
  readonly rows = signal<ExifRow[]>([]);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly faqs = computed(() => {
    this.translate.lang();
    const raw = this.lookup('faqs');
    return Array.isArray(raw) ? (raw as { q: string; a: string }[]) : [];
  });

  readonly prettySize = computed(() => {
    const bytes = this.fileSize();
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  });

  readonly megapixels = computed(() => {
    const mp = (this.imgW() * this.imgH()) / 1_000_000;
    return mp > 0 ? mp.toFixed(1) : '—';
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

  fieldLabel(key: string): string {
    return this.t(`labels.fields.${key}`);
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.errorMsg.set('');
    if (!file.type.startsWith('image/')) {
      this.errorMsg.set(this.t('labels.typeError'));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      this.errorMsg.set(this.t('labels.sizeError'));
      return;
    }
    this.fileName.set(file.name);
    this.fileSize.set(file.size);
    this.fileType.set(file.type);
    this.rows.set([]);
    this.loaded.set(false);
    const reader = new FileReader();
    reader.onload = () => {
      const buffer = reader.result as ArrayBuffer;
      const tags = this.parseExif(buffer);
      this.rows.set(this.buildRows(tags));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        this.imgW.set(img.naturalWidth);
        this.imgH.set(img.naturalHeight);
        URL.revokeObjectURL(url);
        this.loaded.set(true);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        this.loaded.set(true);
      };
      img.src = url;
    };
    reader.onerror = () => {
      this.errorMsg.set(this.t('labels.typeError'));
    };
    reader.readAsArrayBuffer(file);
  }

  clearFile(): void {
    this.loaded.set(false);
    this.rows.set([]);
    this.fileName.set('');
    this.errorMsg.set('');
    this.imgW.set(0);
    this.imgH.set(0);
  }

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private buildRows(tags: Map<number, string>): ExifRow[] {
    const rows: ExifRow[] = [];
    const str = (tag: number): string => tags.get(tag) ?? '';
    if (str(0x010f)) rows.push({ key: 'make', value: str(0x010f) });
    if (str(0x0110)) rows.push({ key: 'model', value: str(0x0110) });
    if (str(0x0131)) rows.push({ key: 'software', value: str(0x0131) });
    if (str(0x0112)) {
      const n = Number(str(0x0112));
      rows.push({ key: 'orientation', value: this.t(`labels.orientations.${n}`) || String(n) });
    }
    if (str(0x9003)) rows.push({ key: 'dateTimeOriginal', value: str(0x9003) });
    else if (str(0x0132)) rows.push({ key: 'dateTime', value: str(0x0132) });
    if (str(0x829a)) rows.push({ key: 'exposureTime', value: this.fmtExposure(str(0x829a)) });
    if (str(0x829d)) rows.push({ key: 'fNumber', value: this.fmtFNumber(str(0x829d)) });
    if (str(0x8827)) rows.push({ key: 'iso', value: `ISO ${str(0x8827)}` });
    if (str(0x920a)) rows.push({ key: 'focalLength', value: this.fmtFocal(str(0x920a)) });
    if (str(0x9000)) rows.push({ key: 'exifVersion', value: str(0x9000) });
    const lat = this.fmtGps(str(0x20002), str(0x20001));
    const lon = this.fmtGps(str(0x20004), str(0x20003));
    if (lat) rows.push({ key: 'gpsLatitude', value: lat });
    if (lon) rows.push({ key: 'gpsLongitude', value: lon });
    return rows;
  }

  private fmtExposure(raw: string): string {
    const [n, d] = raw.split('/').map(Number);
    if (!d) return raw;
    const v = n / d;
    if (v >= 1) return `${v % 1 === 0 ? v : v.toFixed(1)} s`;
    return `1/${Math.round(d / n)} s`;
  }

  private fmtFNumber(raw: string): string {
    const [n, d] = raw.split('/').map(Number);
    if (!d) return raw;
    return `f/${(n / d).toFixed(1)}`;
  }

  private fmtFocal(raw: string): string {
    const [n, d] = raw.split('/').map(Number);
    if (!d) return raw;
    const v = n / d;
    return `${v % 1 === 0 ? v : v.toFixed(1)} mm`;
  }

  private fmtGps(raw: string, ref: string): string {
    if (!raw) return '';
    const parts = raw.split(',').map(Number);
    if (parts.length < 3 || parts.some((p) => !Number.isFinite(p))) return '';
    let dec = parts[0] + parts[1] / 60 + parts[2] / 3600;
    if (ref === 'S' || ref === 'W') dec = -dec;
    return `${dec.toFixed(6)}° ${ref}`;
  }

  private parseExif(buffer: ArrayBuffer): Map<number, string> {
    const out = new Map<number, string>();
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return out;
    let offset = 2;
    const len = view.byteLength;
    while (offset + 4 < len) {
      if (view.getUint8(offset) !== 0xff) break;
      const marker = view.getUint8(offset + 1);
      if (marker === 0xda || marker === 0xd9) break;
      const segLen = view.getUint16(offset + 2);
      if (segLen < 2) break;
      if (marker === 0xe1 && offset + 10 < len) {
        if (view.getUint32(offset + 4) === 0x45786966 && view.getUint16(offset + 8) === 0) {
          this.parseTiff(view, offset + 10, out);
          break;
        }
      }
      offset += 2 + segLen;
    }
    return out;
  }

  private parseTiff(view: DataView, start: number, out: Map<number, string>): void {
    const bo = view.getUint16(start);
    const little = bo === 0x4949;
    if (!little && bo !== 0x4d4d) return;
    const g16 = (o: number): number => (little ? view.getUint16(o, true) : view.getUint16(o, false));
    const g32 = (o: number): number => (little ? view.getUint32(o, true) : view.getUint32(o, false));
    const ascii = (o: number, n: number): string => {
      let s = '';
      for (let i = 0; i < n; i++) {
        const c = view.getUint8(o + i);
        if (c === 0) break;
        s += String.fromCharCode(c);
      }
      return s.trim();
    };
    const typeSize = (t: number): number => [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8][t] ?? 1;

    const readIfd = (ifdOffset: number, gps: boolean): void => {
      if (start + ifdOffset + 2 > view.byteLength) return;
      const count = g16(start + ifdOffset);
      for (let i = 0; i < count; i++) {
        const e = start + ifdOffset + 2 + i * 12;
        if (e + 12 > view.byteLength) break;
        const tag = g16(e);
        const type = g16(e + 2);
        const cnt = g32(e + 4);
        const bytes = cnt * typeSize(type);
        const dataAt = bytes <= 4 ? e + 8 : start + g32(e + 8);
        if (dataAt + Math.min(bytes, 64) > view.byteLength) continue;
        if (gps) {
          if (tag === 0x0001) out.set(0x20001, ascii(dataAt, cnt));
          else if (tag === 0x0003) out.set(0x20003, ascii(dataAt, cnt));
          else if (tag === 0x0002 || tag === 0x0004) {
            const parts: number[] = [];
            for (let k = 0; k < 3 && k < cnt; k++) {
              const n = g32(dataAt + k * 8);
              const d = g32(dataAt + k * 8 + 4);
              parts.push(d === 0 ? 0 : n / d);
            }
            out.set(tag === 0x0002 ? 0x20002 : 0x20004, parts.join(','));
          }
          continue;
        }
        if (tag === 0x8769 || tag === 0x8825) {
          readIfd(g32(e + 8), tag === 0x8825);
          continue;
        }
        if (type === 2 || type === 7) {
          const v = ascii(dataAt, cnt);
          if (v) out.set(tag, v);
        } else if (type === 3) {
          out.set(tag, String(g16(dataAt)));
        } else if (type === 4) {
          out.set(tag, String(g32(dataAt)));
        } else if (type === 5) {
          const n = g32(dataAt);
          const d = g32(dataAt + 4);
          out.set(tag, `${n}/${d === 0 ? 1 : d}`);
        }
      }
    };
    const first = g32(start + 4);
    readIfd(first, false);
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
