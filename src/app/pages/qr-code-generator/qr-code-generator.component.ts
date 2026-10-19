import { DOCUMENT } from '@angular/common';
import { Component, computed, effect, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import QRCode from 'qrcode';
import { PDFDocument } from '@cantoo/pdf-lib';

import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

const SLUG = 'qr-code-generator';
const SITE_URL = 'https://jaurtools.com';
const QUIET_MODULES = 4;

type EcLevel = 'L' | 'M' | 'Q' | 'H';
type QrMode = 'standard' | 'logo';
type QrType = 'url' | 'text' | 'wifi' | 'vcard' | 'sms' | 'email' | 'phone' | 'location' | 'bitcoin';
type DotStyle = 'square' | 'rounded' | 'dots';
type FrameStyle = 'none' | 'top' | 'bottom';
type DlFormat = 'png' | 'svg' | 'pdf';
type WifiSecurity = 'WPA' | 'WEP' | 'nopass';

@Component({
  selector: 'app-qr-code-generator',
  standalone: true,
  imports: [FormsModule, RouterLink, IconComponent, MicroRatingComponent],
  templateUrl: './qr-code-generator.component.html',
  styleUrl: './qr-code-generator.component.scss',
})
export class QrCodeGeneratorComponent implements OnDestroy {
  protected tr = inject(TranslateService);
  private title = inject(Title);
  private meta = inject(Meta);
  private doc = inject(DOCUMENT);

  readonly content = signal('');
  readonly size = signal(512);
  readonly ecLevel = signal<EcLevel>('M');
  readonly mode = signal<QrMode>('standard');
  readonly logoName = signal('');
  readonly fgColor = signal('#000000');
  readonly bgColor = signal('#ffffff');
  readonly hasQr = signal(false);
  readonly error = signal('');
  readonly downloadError = signal('');

  readonly qrType = signal<QrType>('url');
  readonly dotStyle = signal<DotStyle>('square');
  readonly frame = signal<FrameStyle>('none');
  readonly dlFormat = signal<DlFormat>('png');

  readonly urlText = signal('');
  readonly wifiSsid = signal('');
  readonly wifiSecurity = signal<WifiSecurity>('WPA');
  readonly wifiPassword = signal('');
  readonly wifiHidden = signal(false);
  readonly vcFirst = signal('');
  readonly vcLast = signal('');
  readonly vcPhone = signal('');
  readonly vcEmail = signal('');
  readonly vcOrg = signal('');
  readonly smsNumber = signal('');
  readonly smsMessage = signal('');
  readonly emailTo = signal('');
  readonly emailSubject = signal('');
  readonly emailBody = signal('');
  readonly phoneNumber = signal('');
  readonly locLat = signal('');
  readonly locLng = signal('');
  readonly btcAddress = signal('');
  readonly btcAmount = signal('');
  readonly btcLabel = signal('');

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  readonly sizes = [256, 512, 1024];
  readonly ecLevels: EcLevel[] = ['L', 'M', 'Q', 'H'];
  readonly qrTypes: QrType[] = ['url', 'text', 'wifi', 'vcard', 'sms', 'email', 'phone', 'location', 'bitcoin'];
  readonly dotStyles: DotStyle[] = ['square', 'rounded', 'dots'];
  readonly frameStyles: FrameStyle[] = ['none', 'top', 'bottom'];
  readonly dlFormats: DlFormat[] = ['png', 'svg', 'pdf'];
  readonly wifiSecurities: WifiSecurity[] = ['WPA', 'WEP', 'nopass'];
  readonly slug = SLUG;
  readonly relatedSlugs = ['password-generator'];

  private readonly typeIcons: Record<QrType, string> = {
    url: 'link',
    text: 'type',
    wifi: 'wifi',
    vcard: 'users',
    sms: 'message-square',
    email: 'mail',
    phone: 'phone',
    location: 'map-pin',
    bitcoin: 'wallet',
  };

  private qrCanvas = viewChild<ElementRef<HTMLCanvasElement>>('qrCanvas');
  private logoImg = signal<HTMLImageElement | null>(null);
  private logoUrl: string | null = null;

  readonly canGenerate = computed(() => this.buildPayload().length > 0);

  private seo = effect(() => {
    const lang = this.tr.lang();
    this.title.setTitle(this.t('metaTitle'));
    this.meta.updateTag({ name: 'description', content: this.t('metaDescription') });
    this.upsertLink('seo-canonical', { rel: 'canonical', href: `${SITE_URL}/${lang}/${SLUG}` });
    for (const code of ['en', 'hi', 'ar']) {
      this.upsertLink(`seo-alt-${code}`, {
        rel: 'alternate',
        hreflang: code,
        href: `${SITE_URL}/${code}/${SLUG}`,
      });
    }
    this.upsertLink('seo-alt-x-default', {
      rel: 'alternate',
      hreflang: 'x-default',
      href: `${SITE_URL}/en/${SLUG}`,
    });
    this.upsertFaqJsonLd();
  });

  ngOnDestroy(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.logoUrl) URL.revokeObjectURL(this.logoUrl);
    this.doc.getElementById(`faq-jsonld-${SLUG}`)?.remove();
    this.doc.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  t(path: string): string {
    this.tr.lang();
    return this.tr.t(`${SLUG}.${path}`) as string;
  }

  list(path: string): string[] {
    this.tr.lang();
    return this.tr.t(`${SLUG}.${path}`) as unknown as string[];
  }

  faqs(): Array<{ q: string; a: string }> {
    this.tr.lang();
    return this.tr.t(`${SLUG}.faqs`) as unknown as Array<{ q: string; a: string }>;
  }

  relatedName(slug: string): string {
    this.tr.lang();
    const name = this.tr.t(`${slug}.name`);
    return typeof name === 'string' && name ? name : slug;
  }

  ecLabel(level: EcLevel): string {
    return this.t(`ui.ecNames.${level}`);
  }

  typeIcon(type: QrType): string {
    return this.typeIcons[type];
  }

  typeName(type: QrType): string {
    return this.t(`ui.types.${type}`);
  }

  styleName(style: DotStyle): string {
    return this.t(`ui.styles.${style}`);
  }

  frameName(frame: FrameStyle): string {
    return this.t(`ui.frames.${frame}`);
  }

  wifiSecName(sec: WifiSecurity): string {
    return this.t(`ui.wifiSecurities.${sec}`);
  }

  setType(type: QrType): void {
    this.qrType.set(type);
    this.scheduleRender();
  }

  setMode(mode: QrMode): void {
    this.mode.set(mode);
    if (mode === 'logo' && (this.ecLevel() === 'L' || this.ecLevel() === 'M')) {
      this.ecLevel.set('Q');
    }
    this.scheduleRender();
  }

  setDotStyle(style: DotStyle): void {
    this.dotStyle.set(style);
    this.scheduleRender();
  }

  setFrame(frame: FrameStyle): void {
    this.frame.set(frame);
    this.scheduleRender();
  }

  setDlFormat(format: DlFormat): void {
    this.dlFormat.set(format);
    this.downloadError.set('');
  }

  onField(): void {
    this.scheduleRender();
  }

  onSize(value: string): void {
    this.size.set(Number(value));
    this.scheduleRender();
  }

  onEc(value: string): void {
    this.ecLevel.set(value as EcLevel);
    this.scheduleRender();
  }

  onFg(value: string): void {
    this.fgColor.set(value);
    this.scheduleRender();
  }

  onBg(value: string): void {
    this.bgColor.set(value);
    this.scheduleRender();
  }

  private scheduleRender(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.renderQr(), 250);
  }

  private invalidate(): void {
    this.hasQr.set(false);
    this.clearCanvas();
  }

  private clearCanvas(): void {
    const canvas = this.qrCanvas()?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  onLogoFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (this.logoUrl) URL.revokeObjectURL(this.logoUrl);
    this.logoUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      this.logoImg.set(img);
      this.logoName.set(file.name);
      this.scheduleRender();
      this.error.set('');
    };
    img.onerror = () => {
      this.error.set(this.t('ui.logoError'));
      this.logoImg.set(null);
      this.logoName.set('');
    };
    img.src = this.logoUrl;
  }

  removeLogo(): void {
    if (this.logoUrl) URL.revokeObjectURL(this.logoUrl);
    this.logoUrl = null;
    this.logoImg.set(null);
    this.logoName.set('');
    this.scheduleRender();
  }

  private escapeWifi(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/:/g, '\\:');
  }

  buildPayload(): string {
    switch (this.qrType()) {
      case 'url': {
        const raw = this.urlText().trim();
        if (!raw) return '';
        return /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
      }
      case 'text':
        return this.content().trim();
      case 'wifi': {
        const ssid = this.wifiSsid().trim();
        if (!ssid) return '';
        const sec = this.wifiSecurity();
        let out = `WIFI:T:${sec};S:${this.escapeWifi(ssid)};`;
        if (sec !== 'nopass') out += `P:${this.escapeWifi(this.wifiPassword())};`;
        if (this.wifiHidden()) out += 'H:true;';
        return `${out};`;
      }
      case 'vcard': {
        const first = this.vcFirst().trim();
        const last = this.vcLast().trim();
        const phone = this.vcPhone().trim();
        const email = this.vcEmail().trim();
        const org = this.vcOrg().trim();
        if (!first && !last && !phone && !email && !org) return '';
        const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${last};${first}`, `FN:${[first, last].filter(Boolean).join(' ')}`];
        if (org) lines.push(`ORG:${org}`);
        if (phone) lines.push(`TEL;TYPE=CELL:${phone}`);
        if (email) lines.push(`EMAIL:${email}`);
        lines.push('END:VCARD');
        return lines.join('\n');
      }
      case 'sms': {
        const num = this.smsNumber().trim();
        if (!num) return '';
        const msg = this.smsMessage().trim();
        return msg ? `SMSTO:${num}:${msg}` : `SMSTO:${num}`;
      }
      case 'email': {
        const to = this.emailTo().trim();
        if (!to) return '';
        const params: string[] = [];
        if (this.emailSubject().trim()) params.push(`subject=${encodeURIComponent(this.emailSubject().trim())}`);
        if (this.emailBody().trim()) params.push(`body=${encodeURIComponent(this.emailBody().trim())}`);
        return params.length ? `mailto:${to}?${params.join('&')}` : `mailto:${to}`;
      }
      case 'phone': {
        const num = this.phoneNumber().trim();
        return num ? `tel:${num}` : '';
      }
      case 'location': {
        const lat = Number(this.locLat().trim());
        const lng = Number(this.locLng().trim());
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return '';
        return `geo:${lat},${lng}`;
      }
      case 'bitcoin': {
        const addr = this.btcAddress().trim();
        if (!addr) return '';
        const params: string[] = [];
        if (this.btcAmount().trim()) params.push(`amount=${encodeURIComponent(this.btcAmount().trim())}`);
        if (this.btcLabel().trim()) params.push(`label=${encodeURIComponent(this.btcLabel().trim())}`);
        return params.length ? `bitcoin:${addr}?${params.join('&')}` : `bitcoin:${addr}`;
      }
      default:
        return '';
    }
  }

  private async renderQr(): Promise<void> {
    const payload = this.buildPayload();
    const canvas = this.qrCanvas()?.nativeElement;
    if (!canvas) return;
    if (!payload) {
      this.invalidate();
      return;
    }
    this.error.set('');
    try {
      const qr = QRCode.create(payload, { errorCorrectionLevel: this.ecLevel() });
      const count = qr.modules.size;
      const side = this.size();
      const unit = side / (count + QUIET_MODULES * 2);
      const bandH = this.frame() === 'none' ? 0 : Math.max(48, Math.round(side * 0.14));
      const bandOnTop = this.frame() === 'top';
      canvas.width = side;
      canvas.height = side + bandH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        this.error.set(this.t('ui.generateError'));
        this.hasQr.set(false);
        return;
      }
      const fg = this.fgColor();
      const bg = this.bgColor();
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (this.frame() !== 'none') this.drawFrameBand(ctx, side, bandH, bandOnTop, fg, bg);
      const ox = QUIET_MODULES * unit;
      const oy = (bandOnTop ? bandH : 0) + QUIET_MODULES * unit;
      this.drawModules(ctx, qr.modules, count, unit, ox, oy, fg);
      if (this.mode() === 'logo') {
        const logo = this.logoImg();
        if (!logo) {
          this.error.set(this.t('ui.logoMissing'));
          this.hasQr.set(false);
          return;
        }
        this.drawLogoAt(ctx, logo, side, bandOnTop ? bandH : 0);
      }
      this.hasQr.set(true);
    } catch {
      this.error.set(this.t('ui.generateError'));
      this.hasQr.set(false);
    }
  }

  private drawModules(
    ctx: CanvasRenderingContext2D,
    modules: { size: number; get: (row: number, col: number) => number },
    count: number,
    unit: number,
    ox: number,
    oy: number,
    fg: string,
  ): void {
    const style = this.dotStyle();
    const isFinder = (r: number, c: number): boolean =>
      (r < 8 && c < 8) || (r < 8 && c >= count - 8) || (r >= count - 8 && c < 8);
    ctx.fillStyle = fg;
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (!modules.get(r, c)) continue;
        const x = ox + c * unit;
        const y = oy + r * unit;
        if (style === 'square' || isFinder(r, c)) {
          ctx.fillRect(x, y, unit, unit);
          continue;
        }
        if (style === 'rounded') {
          const inset = unit * 0.12;
          this.roundedRect(ctx, x + inset, y + inset, unit - inset * 2, unit - inset * 2, unit * 0.34);
          ctx.fill();
          continue;
        }
        ctx.beginPath();
        ctx.arc(x + unit / 2, y + unit / 2, unit * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawFrameBand(
    ctx: CanvasRenderingContext2D,
    side: number,
    bandH: number,
    bandOnTop: boolean,
    fg: string,
    bg: string,
  ): void {
    const y = bandOnTop ? 0 : side;
    ctx.fillStyle = fg;
    ctx.fillRect(0, y, side, bandH);
    const label = this.t('ui.scanMe');
    let fontSize = Math.round(bandH * 0.52);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    do {
      ctx.font = `700 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      fontSize -= 2;
    } while (ctx.measureText(label).width > side * 0.88 && fontSize > 10);
    ctx.fillStyle = bg;
    ctx.fillText(label, side / 2, y + bandH / 2 + 1);
  }

  private drawLogoAt(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    side: number,
    top: number,
  ): void {
    const badge = Math.round(side * 0.27);
    const logoSize = Math.round(side * 0.21);
    const bx = (side - badge) / 2;
    const by = top + (side - badge) / 2;

    ctx.save();
    ctx.fillStyle = '#ffffff';
    this.roundedRect(ctx, bx, by, badge, badge, Math.round(badge * 0.2));
    ctx.fill();

    const scale = Math.min(logoSize / img.naturalWidth, logoSize / img.naturalHeight);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    ctx.drawImage(img, (side - w) / 2, top + (side - h) / 2, w, h);
    ctx.restore();
  }

  private roundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  download(): void {
    this.downloadError.set('');
    const format = this.dlFormat();
    if (format === 'png') {
      this.downloadPng();
      return;
    }
    if (format === 'svg') {
      void this.downloadSvg();
      return;
    }
    void this.downloadPdf();
  }

  private downloadPng(): void {
    const canvas = this.qrCanvas()?.nativeElement;
    if (!canvas || !this.hasQr()) {
      this.downloadError.set(this.t('ui.downloadEmpty'));
      return;
    }
    this.saveBlob(this.dataUrlToBlob(canvas.toDataURL('image/png')), `jaurtools-qr-${this.size()}px.png`);
  }

  private async downloadSvg(): Promise<void> {
    const payload = this.buildPayload();
    if (!payload || !this.hasQr()) {
      this.downloadError.set(this.t('ui.downloadEmpty'));
      return;
    }
    try {
      const svg = await QRCode.toString(payload, {
        type: 'svg',
        errorCorrectionLevel: this.ecLevel(),
        margin: QUIET_MODULES,
        color: { dark: this.fgColor(), light: this.bgColor() },
      });
      this.saveBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `jaurtools-qr-${this.size()}px.svg`);
    } catch {
      this.downloadError.set(this.t('ui.downloadError'));
    }
  }

  private async downloadPdf(): Promise<void> {
    const canvas = this.qrCanvas()?.nativeElement;
    if (!canvas || !this.hasQr()) {
      this.downloadError.set(this.t('ui.downloadEmpty'));
      return;
    }
    try {
      const pngBytes = this.dataUrlToBytes(canvas.toDataURL('image/png'));
      const pdf = await PDFDocument.create();
      const img = await pdf.embedPng(pngBytes);
      const page = pdf.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      const bytes = await pdf.save();
      this.saveBlob(this.u8ToBlob(bytes, 'application/pdf'), `jaurtools-qr-${this.size()}px.pdf`);
    } catch {
      this.downloadError.set(this.t('ui.downloadError'));
    }
  }

  private dataUrlToBytes(dataUrl: string): Uint8Array {
    const bin = atob(dataUrl.split(',')[1] ?? '');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  private dataUrlToBlob(dataUrl: string): Blob {
    const head = dataUrl.split(',')[0] ?? '';
    const mime = head.match(/data:(.*?);/)?.[1] ?? 'image/png';
    return this.u8ToBlob(this.dataUrlToBytes(dataUrl), mime);
  }

  private u8ToBlob(bytes: Uint8Array, mime: string): Blob {
    const buf = new ArrayBuffer(bytes.length);
    new Uint8Array(buf).set(bytes);
    return new Blob([buf], { type: mime });
  }

  private saveBlob(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const a = this.doc.createElement('a');
    a.href = url;
    a.download = name;
    this.doc.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  private upsertLink(id: string, attrs: Record<string, string>): void {
    let el = this.doc.head.querySelector<HTMLLinkElement>(`#${id}`);
    if (!el) {
      el = this.doc.createElement('link');
      el.id = id;
      this.doc.head.appendChild(el);
    }
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  }

  private upsertFaqJsonLd(): void {
    const id = `faq-jsonld-${SLUG}`;
    this.doc.getElementById(id)?.remove();
    const faqs = this.faqs();
    const data = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    };
    const script = this.doc.createElement('script');
    script.id = id;
    script.type = 'application/ld+json';
    script.text = JSON.stringify(data).replace(/</g, '\\u003c');
    this.doc.head.appendChild(script);
  }
}
