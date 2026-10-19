import { Component, computed, effect, inject, OnDestroy, signal, ElementRef, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type MicStatus = 'idle' | 'requesting' | 'live' | 'denied' | 'error';

@Component({
  selector: 'app-mic-test',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './mic-test.component.html',
  styleUrl: './mic-test.component.scss',
})
export class MicTestComponent implements OnDestroy {
  readonly slug = 'mic-test';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['speaker-test', 'webcam-test', 'device-test', 'connection-test'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly meterFill = viewChild<ElementRef<HTMLDivElement>>('meterFill');
  readonly peakFill = viewChild<ElementRef<HTMLDivElement>>('peakFill');

  readonly status = signal<MicStatus>('idle');
  readonly devices = signal<MediaDeviceInfo[]>([]);
  readonly selectedDevice = signal('');
  readonly errorMsg = signal('');
  readonly peakLevel = signal(0);

  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private rafId = 0;
  private peakHold = 0;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly statusText = computed(() => this.t('status.' + this.status()));

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

  deviceLabel(d: MediaDeviceInfo, i: number): string {
    return d.label || this.t('labels.defaultMic') + ' ' + (i + 1);
  }

  setDevice(id: string) {
    this.selectedDevice.set(id);
  }

  async startMic() {
    this.stopMic();
    this.errorMsg.set('');
    this.status.set('requesting');
    try {
      const audio: boolean | MediaTrackConstraints = this.selectedDevice()
        ? { deviceId: { exact: this.selectedDevice() } }
        : true;
      this.stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
      const devs = await navigator.mediaDevices.enumerateDevices();
      this.devices.set(devs.filter((d) => d.kind === 'audioinput'));
      this.audioCtx = new AudioContext();
      const source = this.audioCtx.createMediaStreamSource(this.stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 2048;
      source.connect(this.analyser);
      this.status.set('live');
      this.pollLevel();
    } catch (err) {
      this.status.set(err instanceof DOMException && err.name === 'NotAllowedError' ? 'denied' : 'error');
      this.errorMsg.set(err instanceof Error ? err.message : String(err));
    }
  }

  stopMic() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.stream?.getTracks().forEach((tr) => tr.stop());
    this.stream = null;
    this.analyser = null;
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }
    this.peakLevel.set(0);
    this.peakHold = 0;
    const fill = this.meterFill()?.nativeElement;
    if (fill) fill.style.width = '0%';
    if (this.status() === 'live') this.status.set('idle');
  }

  resetPeak() {
    this.peakLevel.set(0);
    this.peakHold = 0;
    const peak = this.peakFill()?.nativeElement;
    if (peak) peak.style.insetInlineStart = '0%';
  }

  private pollLevel() {
    const analyser = this.analyser;
    if (!analyser) return;
    const buf = new Float32Array(analyser.fftSize);
    const tick = () => {
      if (!this.analyser) return;
      this.analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const level = Math.min(1, rms * 3.5);
      if (level > this.peakHold) {
        this.peakHold = level;
        this.peakLevel.set(Math.round(level * 100));
        const peak = this.peakFill()?.nativeElement;
        if (peak) peak.style.insetInlineStart = (level * 100).toFixed(1) + '%';
      } else {
        this.peakHold = Math.max(0, this.peakHold - 0.004);
      }
      const fill = this.meterFill()?.nativeElement;
      if (fill) fill.style.width = (level * 100).toFixed(1) + '%';
      this.rafId = requestAnimationFrame(tick);
    };
    tick();
  }

  ngOnDestroy() {
    this.stopMic();
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
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
