import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type Mode = 'pixels' | 'percent' | 'longest' | 'preset' | 'filesize';
type OutFormat = 'keep' | 'jpeg' | 'png' | 'webp';
type PresetKey = 'ig-post' | 'ig-story' | 'facebook' | 'youtube' | 'x' | 'linkedin';
type Fit = 'exact' | 'fit';
type ItemStatus = 'ready' | 'busy' | 'done' | 'error';

interface ToolItem {
  id: number;
  file: File;
  name: string;
  origUrl: string;
  width: number;
  height: number;
  size: number;
  isGif: boolean;
  status: ItemStatus;
  error: string;
  outWidth: number;
  outHeight: number;
  outUrl: string | null;
  outSize: number;
  outName: string;
  processedKey: string;
}

const MAX_FILES = 20;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_DIM = 12000;

const PRESET_DIMS: Record<PresetKey, { w: number; h: number }> = {
  'ig-post': { w: 1080, h: 1080 },
  'ig-story': { w: 1080, h: 1920 },
  facebook: { w: 1200, h: 630 },
  youtube: { w: 1280, h: 720 },
  x: { w: 1200, h: 675 },
  linkedin: { w: 1200, h: 627 },
};

const MIME_OF: Record<OutFormat, string> = {
  keep: '',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const EXT_OF: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

let uid = 0;

let crcTable: Uint32Array | null = null;
function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function deflateRaw(data: Uint8Array): Promise<{ bytes: Uint8Array; ok: boolean }> {
  try {
    if (typeof CompressionStream === 'undefined' || data.length === 0) return { bytes: data, ok: false };
    const stream = new Blob([data as unknown as BlobPart])
      .stream()
      .pipeThrough(new CompressionStream('deflate-raw'));
    const out = new Uint8Array(await new Response(stream).arrayBuffer());
    return out.length < data.length ? { bytes: out, ok: true } : { bytes: data, ok: false };
  } catch {
    return { bytes: data, ok: false };
  }
}

async function buildZip(entries: { name: string; data: Uint8Array }[]): Promise<Blob> {
  const enc = new TextEncoder();
  const body: BlobPart[] = [];
  const central: BlobPart[] = [];
  let offset = 0;
  let centralSize = 0;
  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const crc = crc32(e.data);
    const comp = await deflateRaw(e.data);
    const method = comp.ok ? 8 : 0;
    const payload = comp.bytes;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true);
    lh.setUint16(8, method, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, payload.length, true);
    lh.setUint32(22, e.data.length, true);
    lh.setUint16(26, nameBytes.length, true);
    body.push(lh.buffer, nameBytes, payload as unknown as BlobPart);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, method, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, payload.length, true);
    ch.setUint32(24, e.data.length, true);
    ch.setUint16(28, nameBytes.length, true);
    ch.setUint32(42, offset, true);
    central.push(ch.buffer, nameBytes);
    offset += 30 + nameBytes.length + payload.length;
    centralSize += 46 + nameBytes.length;
  }
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, entries.length, true);
  eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, centralSize, true);
  eocd.setUint32(16, offset, true);
  return new Blob([...body, ...central, eocd.buffer], { type: 'application/zip' });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const r = v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${r} ${units[i]}`;
}

function encodeCanvas(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (quality === undefined) canvas.toBlob((b) => resolve(b), mime);
    else canvas.toBlob((b) => resolve(b), mime, quality);
  });
}

@Component({
  selector: 'app-image-resizer',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './image-resizer.component.html',
  styleUrl: './image-resizer.component.scss',
})
export class ImageResizerComponent implements OnDestroy {
  readonly slug = 'image-resizer';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['merge-images', 'image-splitter', 'image-denoiser', 'psd-to-jpg-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly items = signal<ToolItem[]>([]);
  readonly activeId = signal<number | null>(null);
  readonly dragging = signal(false);
  readonly batchError = signal('');
  readonly processing = signal(false);
  readonly batchProgress = signal(0);
  readonly zipping = signal(false);

  readonly mode = signal<Mode>('pixels');
  readonly outWidth = signal(0);
  readonly outHeight = signal(0);
  readonly lockAspect = signal(true);
  readonly percent = signal(50);
  readonly longestSide = signal(1920);
  readonly preset = signal<PresetKey>('ig-post');
  readonly presetFit = signal<Fit>('exact');
  readonly targetKB = signal(200);
  readonly outFormat = signal<OutFormat>('keep');
  readonly quality = signal(85);
  readonly noUpscale = signal(false);

  readonly modes: Mode[] = ['pixels', 'percent', 'longest', 'preset', 'filesize'];
  readonly presetKeys: PresetKey[] = ['ig-post', 'ig-story', 'facebook', 'youtube', 'x', 'linkedin'];
  readonly formats: OutFormat[] = ['keep', 'jpeg', 'png', 'webp'];

  private jsonLdEl: HTMLScriptElement | null = null;
  private activeTimer: ReturnType<typeof setTimeout> | null = null;

  readonly activeItem = computed(() => this.items().find((i) => i.id === this.activeId()) ?? null);

  readonly settingsKey = computed(() =>
    JSON.stringify([
      this.mode(), this.outWidth(), this.outHeight(), this.lockAspect(), this.percent(),
      this.longestSide(), this.preset(), this.presetFit(), this.targetKB(),
      this.outFormat(), this.quality(), this.noUpscale(),
    ]),
  );

  readonly pendingCount = computed(() => {
    const key = this.settingsKey();
    return this.items().filter((i) => i.status !== 'busy' && (i.status !== 'done' || i.processedKey !== key)).length;
  });

  readonly doneCount = computed(() => this.items().filter((i) => i.status === 'done').length);
  readonly hasGif = computed(() => this.items().some((i) => i.isGif));
  readonly showQuality = computed(() => this.outFormat() !== 'png');

  readonly faqs = computed(() => {
    this.translate.lang();
    const raw = this.lookup('faqs');
    return Array.isArray(raw) ? (raw as { q: string; a: string }[]) : [];
  });

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  t(key: string): string {
    this.translate.lang();
    const raw = this.lookup(key);
    return typeof raw === 'string' ? raw : '';
  }

  tn(key: string, n: number): string {
    return this.t(key).replace('{n}', String(n));
  }

  list(key: string): string[] {
    this.translate.lang();
    const raw = this.lookup(key);
    return Array.isArray(raw) ? (raw as string[]) : [];
  }

  fmt(n: number): string {
    return formatBytes(n);
  }

  savedPct(item: ToolItem): number {
    if (!item.size || !item.outSize || item.outSize >= item.size) return 0;
    return Math.round((1 - item.outSize / item.size) * 100);
  }

  modeLabelKey(m: Mode): string {
    return { pixels: 'modePixels', percent: 'modePercent', longest: 'modeLongest', preset: 'modePreset', filesize: 'modeFilesize' }[m];
  }

  relatedName(slug: string): string {
    this.translate.lang();
    const raw = (this.translate.t as unknown as (k: string) => unknown)(`${slug}.name`);
    return typeof raw === 'string' ? raw : slug;
  }

  onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) this.addFiles(Array.from(input.files));
    input.value = '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const files = event.dataTransfer?.files;
    if (files) this.addFiles(Array.from(files));
  }

  private addFiles(files: File[]): void {
    this.batchError.set('');
    const current = this.items();
    const room = MAX_FILES - current.length;
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length < files.length) this.batchError.set(this.t('labels.invalidType'));
    const accepted = images.slice(0, Math.max(0, room));
    if (images.length > accepted.length) this.batchError.set(this.t('labels.tooMany'));
    for (const file of accepted) {
      if (file.size > MAX_FILE_BYTES) {
        this.batchError.set(this.t('labels.fileTooLarge'));
        continue;
      }
      const id = ++uid;
      const url = URL.createObjectURL(file);
      const item: ToolItem = {
        id, file, name: file.name, origUrl: url, width: 0, height: 0, size: file.size,
        isGif: file.type === 'image/gif', status: 'ready', error: '',
        outWidth: 0, outHeight: 0, outUrl: null, outSize: 0, outName: file.name, processedKey: '',
      };
      this.items.set([...this.items(), item]);
      this.loadImage(url)
        .then((img) => {
          const list = this.items().map((it) =>
            it.id === id ? { ...it, width: img.naturalWidth, height: img.naturalHeight } : it,
          );
          this.items.set(list);
          if (this.outWidth() === 0) {
            this.outWidth.set(img.naturalWidth);
            this.outHeight.set(img.naturalHeight);
          }
          if (this.activeId() === null) {
            this.activeId.set(id);
            this.processActiveNow();
          }
        })
        .catch(() => {
          this.items.set(
            this.items().map((it) =>
              it.id === id ? { ...it, status: 'error' as ItemStatus, error: this.t('labels.loadFailed') } : it,
            ),
          );
          URL.revokeObjectURL(url);
        });
    }
  }

  select(id: number): void {
    if (this.activeId() === id) return;
    this.activeId.set(id);
    this.scheduleActiveProcess();
  }

  removeItem(id: number): void {
    const item = this.items().find((i) => i.id === id);
    if (item) {
      URL.revokeObjectURL(item.origUrl);
      if (item.outUrl) URL.revokeObjectURL(item.outUrl);
    }
    this.items.set(this.items().filter((i) => i.id !== id));
    if (this.activeId() === id) {
      const rest = this.items();
      this.activeId.set(rest.length ? rest[0].id : null);
      if (rest.length) this.scheduleActiveProcess();
    }
  }

  clearAll(): void {
    for (const item of this.items()) {
      URL.revokeObjectURL(item.origUrl);
      if (item.outUrl) URL.revokeObjectURL(item.outUrl);
    }
    this.items.set([]);
    this.activeId.set(null);
    this.batchError.set('');
    this.batchProgress.set(0);
  }

  setMode(m: Mode): void { this.mode.set(m); this.afterSettingsChange(); }
  setLockAspect(v: boolean): void { this.lockAspect.set(v); this.afterSettingsChange(); }
  setPercent(v: number): void { this.percent.set(this.clampNum(v, 1, 400)); this.afterSettingsChange(); }
  setLongestSide(v: number): void { this.longestSide.set(this.clampNum(v, 16, MAX_DIM)); this.afterSettingsChange(); }
  setPreset(p: PresetKey): void { this.preset.set(p); this.afterSettingsChange(); }
  setPresetFit(f: Fit): void { this.presetFit.set(f); this.afterSettingsChange(); }
  setTargetKB(v: number): void { this.targetKB.set(this.clampNum(v, 5, 51200)); this.afterSettingsChange(); }
  setOutFormat(f: OutFormat): void { this.outFormat.set(f); this.afterSettingsChange(); }
  setQuality(v: number): void { this.quality.set(this.clampNum(v, 1, 100)); this.afterSettingsChange(); }
  setNoUpscale(v: boolean): void { this.noUpscale.set(v); this.afterSettingsChange(); }

  setOutWidth(v: number): void {
    const w = this.clampNum(v, 1, MAX_DIM);
    this.outWidth.set(w);
    const base = this.baseItem();
    if (base && this.lockAspect() && base.width > 0) {
      this.outHeight.set(Math.max(1, Math.round((w / base.width) * base.height)));
    }
    this.afterSettingsChange();
  }

  setOutHeight(v: number): void {
    const h = this.clampNum(v, 1, MAX_DIM);
    this.outHeight.set(h);
    const base = this.baseItem();
    if (base && this.lockAspect() && base.height > 0) {
      this.outWidth.set(Math.max(1, Math.round((h / base.height) * base.width)));
    }
    this.afterSettingsChange();
  }

  readonly avatarPresets = [
    { name: 'Discord', w: 128, h: 128 },
    { name: 'WhatsApp', w: 500, h: 500 },
    { name: 'Telegram', w: 512, h: 512 },
    { name: 'Zoom', w: 512, h: 512 },
    { name: 'LinkedIn', w: 400, h: 400 },
    { name: 'X', w: 400, h: 400 },
    { name: 'Facebook', w: 170, h: 170 },
  ];

  readonly livePreview = computed(() => {
    const base = this.baseItem();
    if (!base || base.width <= 0) return null;
    return this.computeDims(base.width, base.height);
  });

  readonly liveEstBytes = computed(() => {
    const dims = this.livePreview();
    if (!dims) return 0;
    const q = this.quality() / 100;
    const f = this.outFormat();
    const bpp = f === 'png' ? 1.1 : f === 'webp' ? 0.1 + 0.55 * q * q : 0.16 + 0.9 * q * q;
    return Math.max(1, Math.round(dims.w * dims.h * bpp));
  });

  applyAvatarPreset(w: number, h: number): void {
    this.mode.set('pixels');
    this.lockAspect.set(false);
    this.outWidth.set(this.clampNum(w, 1, MAX_DIM));
    this.outHeight.set(this.clampNum(h, 1, MAX_DIM));
    this.afterSettingsChange();
  }

  async processAll(): Promise<void> {
    if (this.processing() || this.items().length === 0) return;
    this.processing.set(true);
    this.batchError.set('');
    const key = this.settingsKey();
    const list = this.items();
    let done = 0;
    for (const item of list) {
      if (item.status === 'done' && item.processedKey === key) {
        done++;
        this.batchProgress.set(Math.round((done / list.length) * 100));
        continue;
      }
      this.patchItem(item.id, { status: 'busy' });
      try {
        await this.renderItem(item, key);
        this.patchItem(item.id, { status: 'done' });
      } catch {
        this.patchItem(item.id, { status: 'error', error: this.t('labels.loadFailed') });
      }
      done++;
      this.batchProgress.set(Math.round((done / list.length) * 100));
    }
    this.processing.set(false);
  }

  downloadItem(item: ToolItem): void {
    if (!item.outUrl) return;
    const a = this.document.createElement('a');
    a.href = item.outUrl;
    a.download = item.outName;
    this.document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async downloadZip(): Promise<void> {
    const done = this.items().filter((i) => i.status === 'done' && i.outUrl);
    if (done.length === 0 || this.zipping()) return;
    this.zipping.set(true);
    try {
      const used = new Map<string, number>();
      const entries: { name: string; data: Uint8Array }[] = [];
      for (const item of done) {
        const buf = await (await fetch(item.outUrl as string)).arrayBuffer();
        let name = item.outName;
        const seen = used.get(name.toLowerCase()) ?? 0;
        used.set(name.toLowerCase(), seen + 1);
        if (seen > 0) {
          const dot = name.lastIndexOf('.');
          name = `${name.slice(0, dot)}-${seen + 1}${name.slice(dot)}`;
        }
        entries.push({ name, data: new Uint8Array(buf) });
      }
      const blob = await buildZip(entries);
      downloadBlob(blob, 'resized-images.zip');
    } finally {
      this.zipping.set(false);
    }
  }

  ngOnDestroy(): void {
    if (this.activeTimer) clearTimeout(this.activeTimer);
    this.clearAll();
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private baseItem(): ToolItem | null {
    return this.activeItem() ?? this.items()[0] ?? null;
  }

  private patchItem(id: number, patch: Partial<ToolItem>): void {
    this.items.set(this.items().map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  private afterSettingsChange(): void {
    this.scheduleActiveProcess();
  }

  private scheduleActiveProcess(): void {
    if (this.activeTimer) clearTimeout(this.activeTimer);
    this.activeTimer = setTimeout(() => this.processActiveNow(), 450);
  }

  private async processActiveNow(): Promise<void> {
    const item = this.activeItem();
    if (!item || item.status === 'busy' || item.width === 0) return;
    const key = this.settingsKey();
    if (item.status === 'done' && item.processedKey === key) return;
    this.patchItem(item.id, { status: 'busy' });
    try {
      await this.renderItem(item, key);
      this.patchItem(item.id, { status: 'done' });
    } catch {
      this.patchItem(item.id, { status: 'error', error: this.t('labels.loadFailed') });
    }
  }

  private targetDims(item: ToolItem): { w: number; h: number } {
    return this.computeDims(item.width, item.height);
  }

  private computeDims(iwIn: number, ihIn: number): { w: number; h: number } {
    const iw = Math.max(1, iwIn);
    const ih = Math.max(1, ihIn);
    const noUp = this.noUpscale();
    const clamp = (v: number) => Math.min(MAX_DIM, Math.max(1, Math.round(v)));
    const shrink = (w: number, h: number) => {
      if (!noUp) return { w: clamp(w), h: clamp(h) };
      const s = Math.min(1, iw / Math.max(1, w), ih / Math.max(1, h));
      return { w: clamp(w * s), h: clamp(h * s) };
    };
    switch (this.mode()) {
      case 'pixels': {
        const w = this.outWidth() || iw;
        const h = this.lockAspect() ? (w / iw) * ih : this.outHeight() || ih;
        return shrink(w, h);
      }
      case 'percent': {
        let k = this.percent() / 100;
        if (noUp) k = Math.min(1, k);
        return { w: clamp(iw * k), h: clamp(ih * k) };
      }
      case 'longest': {
        let s = this.longestSide() / Math.max(iw, ih);
        if (noUp) s = Math.min(1, s);
        return { w: clamp(iw * s), h: clamp(ih * s) };
      }
      case 'preset': {
        const p = PRESET_DIMS[this.preset()];
        if (this.presetFit() === 'exact') return shrink(p.w, p.h);
        let s = Math.min(p.w / iw, p.h / ih);
        if (noUp) s = Math.min(1, s);
        return { w: clamp(iw * s), h: clamp(ih * s) };
      }
      case 'filesize':
        return { w: clamp(iw), h: clamp(ih) };
    }
  }

  private effectiveMime(item: ToolItem): string {
    const f = this.outFormat();
    if (f !== 'keep') return MIME_OF[f];
    if (item.file.type === 'image/jpeg') return 'image/jpeg';
    if (item.file.type === 'image/png') return 'image/png';
    if (item.file.type === 'image/webp') return 'image/webp';
    return 'image/png';
  }

  private async renderItem(item: ToolItem, key: string): Promise<void> {
    const dims = this.targetDims(item);
    const mime = this.mode() === 'filesize'
      ? this.outFormat() === 'webp' ? 'image/webp' : 'image/jpeg'
      : this.effectiveMime(item);
    if (dims.w === item.width && dims.h === item.height && this.outFormat() === 'keep' && this.mode() !== 'filesize') {
      this.setOutput(item, dims.w, dims.h, item.file, key);
      return;
    }
    const img = await this.loadImage(item.origUrl);
    const canvas = this.document.createElement('canvas');
    try {
      const draw = (w: number, h: number) => {
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no-context');
        if (mime === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
      };
      let blob: Blob | null;
      let w = dims.w;
      let h = dims.h;
      if (this.mode() === 'filesize') {
        const fit = await this.encodeToTarget(canvas, draw, dims.w, dims.h, this.targetKB() * 1024, mime);
        blob = fit.blob;
        w = fit.w;
        h = fit.h;
      } else {
        draw(w, h);
        const q = mime === 'image/png' ? undefined : this.quality() / 100;
        blob = await encodeCanvas(canvas, mime, q);
      }
      if (!blob) throw new Error('encode-failed');
      this.setOutput(item, w, h, blob, key);
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  private async encodeToTarget(
    canvas: HTMLCanvasElement,
    draw: (w: number, h: number) => void,
    startW: number,
    startH: number,
    targetBytes: number,
    mime: string,
  ): Promise<{ blob: Blob; w: number; h: number }> {
    let w = startW;
    let h = startH;
    for (let round = 0; round < 8; round++) {
      draw(w, h);
      let lo = 10;
      let hi = 95;
      let best: Blob | null = null;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const blob = await encodeCanvas(canvas, mime, mid / 100);
        if (blob && blob.size <= targetBytes) {
          best = blob;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      if (best) return { blob: best, w, h };
      const nw = Math.max(64, Math.round(w * 0.85));
      const nh = Math.max(64, Math.round(h * 0.85));
      if (nw === w && nh === h) break;
      w = nw;
      h = nh;
    }
    draw(w, h);
    const fallback = await encodeCanvas(canvas, mime, 0.1);
    if (!fallback) throw new Error('encode-failed');
    return { blob: fallback, w, h };
  }

  private setOutput(item: ToolItem, w: number, h: number, blob: Blob, key: string): void {
    const ext = EXT_OF[blob.type] ?? 'png';
    const dot = item.name.lastIndexOf('.');
    const base = (dot > 0 ? item.name.slice(0, dot) : item.name).replace(/[\\/:*?"<>|]/g, '_') || 'image';
    const outName = `${base}-${w}x${h}.${ext}`;
    if (item.outUrl) URL.revokeObjectURL(item.outUrl);
    const outUrl = URL.createObjectURL(blob);
    this.patchItem(item.id, {
      outWidth: w, outHeight: h, outUrl, outSize: blob.size, outName, processedKey: key, error: '',
    });
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('load-failed'));
      img.src = url;
    });
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
