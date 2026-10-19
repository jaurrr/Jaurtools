import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

interface Pt { x: number; y: number }

@Component({
  selector: 'app-image-to-svg-converter',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './image-to-svg-converter.component.html',
  styleUrl: './image-to-svg-converter.component.scss',
})
export class ImageToSvgConverterComponent implements OnDestroy {
  readonly slug = 'image-to-svg-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['psd-to-jpg-converter', 'image-resizer', 'merge-images', 'round-corners'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly image = signal<{ img: HTMLImageElement; width: number; height: number; name: string } | null>(null);
  readonly colors = signal(2);
  readonly threshold = signal(128);
  readonly detail = signal(400);
  readonly smoothing = signal(1.2);
  readonly errorMsg = signal('');
  readonly busy = signal(false);
  readonly copied = signal(false);

  readonly svg = signal('');
  readonly pathCount = computed(() => (this.svg().match(/<path/g) || []).length);
  readonly svgBytes = computed(() => new Blob([this.svg()]).size);
  readonly hasOutput = computed(() => this.svg().length > 0);

  readonly faqs = computed(() => {
    this.translate.lang();
    const raw = this.lookup('faqs');
    return Array.isArray(raw) ? (raw as { q: string; a: string }[]) : [];
  });

  private objectUrls: string[] = [];
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    effect(() => {
      this.trace();
    });
  }

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

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.errorMsg.set(this.t('labels.invalidType'));
      input.value = '';
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      this.errorMsg.set(this.t('labels.fileTooLarge'));
      input.value = '';
      return;
    }
    this.errorMsg.set('');
    const url = URL.createObjectURL(file);
    this.objectUrls.push(url);
    const img = new Image();
    img.onload = () => this.image.set({ img, width: img.naturalWidth, height: img.naturalHeight, name: file.name });
    img.onerror = () => this.errorMsg.set(this.t('labels.loadFailed'));
    img.src = url;
    input.value = '';
  }

  setColors(v: number): void { this.colors.set(this.clampNum(v, 2, 6)); }
  setThreshold(v: number): void { this.threshold.set(this.clampNum(v, 1, 254)); }
  setDetail(v: number): void { this.detail.set(this.clampNum(v, 200, 600)); }
  setSmoothing(v: number): void { this.smoothing.set(this.clampNum(v, 0, 3)); }

  download(): void {
    if (!this.hasOutput()) return;
    const blob = new Blob([this.svg()], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'traced-image.svg';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  copySvg(): void {
    if (!this.hasOutput()) return;
    const done = () => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    };
    const clip = (this.document.defaultView?.navigator as Navigator | undefined)?.clipboard;
    if (clip) clip.writeText(this.svg()).then(done, done);
    else done();
  }

  ngOnDestroy(): void {
    this.jsonLdEl?.remove();
    for (const u of this.objectUrls) URL.revokeObjectURL(u);
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private trace(): void {
    const im = this.image();
    if (!im) {
      this.svg.set('');
      return;
    }
    this.busy.set(true);
    try {
      const maxDim = this.detail();
      const scale = Math.min(1, maxDim / Math.max(im.width, im.height));
      const w = Math.max(2, Math.round(im.width * scale));
      const h = Math.max(2, Math.round(im.height * scale));
      const canvas = this.document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(im.img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      const eps = this.smoothing();
      let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`;
      if (this.colors() === 2) {
        const mask = new Uint8Array(w * h);
        const th = this.threshold();
        for (let i = 0; i < w * h; i++) {
          const lum = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
          mask[i] = lum < th ? 1 : 0;
        }
        out += this.pathsForMask(mask, w, h, eps, '#111111');
      } else {
        const layers = this.quantize(data, w, h, this.colors());
        out += `<rect width="${w}" height="${h}" fill="${layers.bg}"/>`;
        for (const layer of layers.fg) out += this.pathsForMask(layer.mask, w, h, eps, layer.color);
      }
      out += '</svg>';
      this.svg.set(out);
    } finally {
      this.busy.set(false);
    }
  }

  private quantize(data: Uint8ClampedArray, w: number, h: number, k: number): { bg: string; fg: { mask: Uint8Array; color: string }[] } {
    const bins = new Map<number, { count: number; r: number; g: number; b: number }>();
    for (let i = 0; i < w * h; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
      let bin = bins.get(key);
      if (!bin) {
        bin = { count: 0, r: 0, g: 0, b: 0 };
        bins.set(key, bin);
      }
      bin.count++;
      bin.r += r;
      bin.g += g;
      bin.b += b;
    }
    const top = [...bins.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, k)
      .map((b) => ({ r: b.r / b.count, g: b.g / b.count, b: b.b / b.count, count: b.count }));
    const hex = (c: { r: number; g: number; b: number }): string =>
      '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
    const fg: { mask: Uint8Array; color: string }[] = [];
    const bg = hex(top[0]);
    for (let t = 1; t < top.length; t++) {
      const mask = new Uint8Array(w * h);
      const c = top[t];
      for (let i = 0; i < w * h; i++) {
        let best = 0;
        let bestD = Infinity;
        for (let j = 0; j < top.length; j++) {
          const dr = data[i * 4] - top[j].r;
          const dg = data[i * 4 + 1] - top[j].g;
          const db = data[i * 4 + 2] - top[j].b;
          const d = dr * dr + dg * dg + db * db;
          if (d < bestD) {
            bestD = d;
            best = j;
          }
        }
        mask[i] = best === t ? 1 : 0;
      }
      fg.push({ mask, color: hex(c) });
    }
    return { bg, fg };
  }

  private pathsForMask(mask: Uint8Array, w: number, h: number, eps: number, fill: string): string {
    const polylines = this.marchingSquares(mask, w, h);
    let d = '';
    for (const line of polylines) {
      const simp = this.simplify(line, eps);
      if (simp.length < 3) continue;
      if (Math.abs(this.area(simp)) < 4) continue;
      d += 'M' + simp.map((p) => `${this.r1(p.x)},${this.r1(p.y)}`).join('L') + 'Z';
    }
    if (!d) return '';
    return `<path d="${d}" fill="${fill}" fill-rule="evenodd"/>`;
  }

  private marchingSquares(mask: Uint8Array, w: number, h: number): Pt[][] {
    const corner = (x: number, y: number): number =>
      mask[Math.min(y, h - 1) * w + Math.min(x, w - 1)];
    const segs: [Pt, Pt][] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const tl = corner(x, y), tr = corner(x + 1, y), br = corner(x + 1, y + 1), bl = corner(x, y + 1);
        const idx = (tl ? 1 : 0) | (tr ? 2 : 0) | (br ? 4 : 0) | (bl ? 8 : 0);
        if (idx === 0 || idx === 15) continue;
        const T: Pt = { x: x + 0.5, y };
        const R: Pt = { x: x + 1, y: y + 0.5 };
        const B: Pt = { x: x + 0.5, y: y + 1 };
        const L: Pt = { x, y: y + 0.5 };
        const add = (a: Pt, b: Pt): void => {
          segs.push([a, b]);
        };
        switch (idx) {
          case 1: case 14: add(T, L); break;
          case 2: case 13: add(T, R); break;
          case 3: case 12: add(L, R); break;
          case 4: case 11: add(R, B); break;
          case 6: case 9: add(T, B); break;
          case 7: case 8: add(L, B); break;
          case 5: {
            const center = (tl + tr + br + bl) / 4;
            if (center >= 0.5) { add(T, R); add(L, B); } else { add(T, L); add(R, B); }
            break;
          }
          case 10: {
            const center = (tl + tr + br + bl) / 4;
            if (center >= 0.5) { add(T, L); add(R, B); } else { add(T, R); add(L, B); }
            break;
          }
        }
      }
    }
    return this.joinSegments(segs);
  }

  private joinSegments(segs: [Pt, Pt][]): Pt[][] {
    const key = (p: Pt): string => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    const byPoint = new Map<string, number[]>();
    segs.forEach((s, i) => {
      for (const p of s) {
        const k = key(p);
        const arr = byPoint.get(k);
        if (arr) arr.push(i);
        else byPoint.set(k, [i]);
      }
    });
    const used = new Array<boolean>(segs.length).fill(false);
    const lines: Pt[][] = [];
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      const line: Pt[] = [segs[i][0], segs[i][1]];
      let extended = true;
      while (extended) {
        extended = false;
        for (const end of [0, line.length - 1]) {
          const k = key(line[end]);
          const cand = byPoint.get(k) || [];
          for (const ci of cand) {
            if (used[ci]) continue;
            const s = segs[ci];
            const other = key(s[0]) === k ? s[1] : s[0];
            used[ci] = true;
            if (end === 0) line.unshift(other);
            else line.push(other);
            extended = true;
            break;
          }
          if (extended) break;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  private simplify(pts: Pt[], eps: number): Pt[] {
    if (pts.length < 3 || eps <= 0) return pts;
    const keep = new Array<boolean>(pts.length).fill(false);
    keep[0] = true;
    keep[pts.length - 1] = true;
    const stack: [number, number][] = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop() as [number, number];
      let maxD = 0;
      let idx = -1;
      for (let i = a + 1; i < b; i++) {
        const d = this.perpDist(pts[i], pts[a], pts[b]);
        if (d > maxD) {
          maxD = d;
          idx = i;
        }
      }
      if (maxD > eps && idx > 0) {
        keep[idx] = true;
        stack.push([a, idx], [idx, b]);
      }
    }
    return pts.filter((_, i) => keep[i]);
  }

  private perpDist(p: Pt, a: Pt, b: Pt): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    const cx = a.x + t * dx;
    const cy = a.y + t * dy;
    return Math.hypot(p.x - cx, p.y - cy);
  }

  private area(pts: Pt[]): number {
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      s += a.x * b.y - b.x * a.y;
    }
    return s / 2;
  }

  private r1(v: number): number {
    return Math.round(v * 10) / 10;
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
