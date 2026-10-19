import { Component, computed, effect, inject, OnDestroy, signal, ElementRef, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type CamStatus = 'idle' | 'requesting' | 'live' | 'denied' | 'error';

@Component({
  selector: 'app-webcam-test',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './webcam-test.component.html',
  styleUrl: './webcam-test.component.scss',
})
export class WebcamTestComponent implements OnDestroy {
  readonly slug = 'webcam-test';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['mic-test', 'speaker-test', 'device-test', 'connection-test'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly videoEl = viewChild<ElementRef<HTMLVideoElement>>('videoEl');

  readonly status = signal<CamStatus>('idle');
  readonly devices = signal<MediaDeviceInfo[]>([]);
  readonly selectedDevice = signal('');
  readonly errorMsg = signal('');
  readonly resolution = signal('');
  readonly snapshotUrl = signal('');

  private stream: MediaStream | null = null;
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
    return d.label || this.t('labels.defaultCam') + ' ' + (i + 1);
  }

  setDevice(id: string) {
    this.selectedDevice.set(id);
  }

  async startCam() {
    this.stopCam();
    this.errorMsg.set('');
    this.status.set('requesting');
    try {
      const video: MediaTrackConstraints = this.selectedDevice()
        ? { deviceId: { exact: this.selectedDevice() } }
        : { width: { ideal: 1280 }, height: { ideal: 720 } };
      this.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      const devs = await navigator.mediaDevices.enumerateDevices();
      this.devices.set(devs.filter((d) => d.kind === 'videoinput'));
      const track = this.stream.getVideoTracks()[0];
      const s = track?.getSettings();
      if (s?.width && s?.height) {
        this.resolution.set(s.width + ' x ' + s.height);
      }
      const videoEl = this.videoEl()?.nativeElement;
      if (videoEl) {
        videoEl.srcObject = this.stream;
        await videoEl.play();
      }
      this.status.set('live');
    } catch (err) {
      this.status.set(err instanceof DOMException && err.name === 'NotAllowedError' ? 'denied' : 'error');
      this.errorMsg.set(err instanceof Error ? err.message : String(err));
    }
  }

  stopCam() {
    const videoEl = this.videoEl()?.nativeElement;
    if (videoEl) {
      videoEl.pause();
      videoEl.srcObject = null;
    }
    this.stream?.getTracks().forEach((tr) => tr.stop());
    this.stream = null;
    this.resolution.set('');
    if (this.status() === 'live') this.status.set('idle');
  }

  takeSnapshot() {
    const videoEl = this.videoEl()?.nativeElement;
    if (!videoEl || this.status() !== 'live') return;
    const canvas = this.document.createElement('canvas');
    canvas.width = videoEl.videoWidth || 1280;
    canvas.height = videoEl.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL('image/png');
    this.snapshotUrl.set(url);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'webcam-snapshot.png';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
  }

  ngOnDestroy() {
    this.stopCam();
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
