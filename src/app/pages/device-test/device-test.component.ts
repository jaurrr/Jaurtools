import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface Check {
  label: string;
  status: 'ok' | 'warn' | 'info';
  detail: string;
}

const DEVICES = [
  'auto', 'android-phone', 'iphone', 'ipad', 'macbook', 'imac',
  'windows-laptop', 'desktop-pc', 'tablet', 'smartwatch',
];

@Component({
  selector: 'app-device-test',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './device-test.component.html',
  styleUrl: './device-test.component.scss',
})
export class DeviceTestComponent implements OnDestroy {
  readonly slug = 'device-test';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['what-is-my-browser', 'connection-test', 'webcam-test', 'mic-test'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly deviceChoice = signal('auto');
  readonly battery = signal<{ level: number; charging: boolean } | null>(null);
  readonly copied = signal(false);
  readonly deviceOptions = DEVICES;

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean }> };
    if (typeof nav.getBattery === 'function') {
      nav.getBattery().then(
        (b) => this.battery.set({ level: Math.round(b.level * 100), charging: b.charging }),
        () => undefined
      );
    }
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly chosenDeviceLabel = computed(() => {
    const c = this.deviceChoice();
    if (c !== 'auto') return this.t(this.devLabelKey(c));
    return this.t('labels.devAuto') + ': ' + this.guessDevice();
  });

  devLabelKey(d: string): string {
    if (d === 'auto') return 'labels.devAuto';
    return 'labels.dev' + d.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  }

  readonly checks = computed((): Check[] => {
    this.translate.lang();
    const L = (k: string) => this.t('labels.' + k);
    const nav = navigator;
    const ua = nav.userAgent;
    const out: Check[] = [];
    out.push({ label: L('checkDevice'), status: 'info', detail: this.chosenDeviceLabel() });
    const [bn, bv] = this.parseBrowser(ua);
    out.push({ label: L('checkBrowser'), status: 'ok', detail: bn + (bv ? ' ' + bv : '') });
    out.push({ label: L('checkOs'), status: 'ok', detail: this.parseOS(ua) });
    out.push({
      label: L('checkScreen'),
      status: 'ok',
      detail: screen.width + ' x ' + screen.height + ' @' + (window.devicePixelRatio ?? 1) + 'x',
    });
    const cores = nav.hardwareConcurrency ?? 0;
    out.push({
      label: L('checkCpu'),
      status: cores >= 4 ? 'ok' : cores > 0 ? 'warn' : 'info',
      detail: cores > 0 ? String(cores) + ' ' + L('coresUnit') : L('unknown'),
    });
    const mem = (nav as Navigator & { deviceMemory?: number }).deviceMemory;
    out.push({
      label: L('checkMemory'),
      status: mem ? (mem >= 4 ? 'ok' : 'warn') : 'info',
      detail: mem ? mem + ' GB' : L('unknown'),
    });
    out.push({
      label: L('checkTouch'),
      status: nav.maxTouchPoints > 0 ? 'ok' : 'info',
      detail: nav.maxTouchPoints > 0 ? String(nav.maxTouchPoints) + ' ' + L('touchPoints') : L('noTouch'),
    });
    const bat = this.battery();
    out.push({
      label: L('checkBattery'),
      status: bat ? (bat.level > 20 || bat.charging ? 'ok' : 'warn') : 'info',
      detail: bat ? bat.level + '%' + (bat.charging ? ' ' + L('charging') : '') : L('unknown'),
    });
    const conn = nav as Navigator & { connection?: { effectiveType?: string; downlink?: number } };
    out.push({
      label: L('checkNetwork'),
      status: nav.onLine ? 'ok' : 'warn',
      detail: nav.onLine
        ? (conn.connection?.effectiveType ?? '') + (conn.connection?.downlink ? ' ' + conn.connection.downlink + ' Mb/s' : '')
        : L('offline'),
    });
    out.push({
      label: L('checkCookies'),
      status: nav.cookieEnabled ? 'ok' : 'warn',
      detail: nav.cookieEnabled ? L('enabled') : L('disabled'),
    });
    out.push({
      label: L('checkLocale'),
      status: 'info',
      detail: nav.language + ' / ' + Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    return out;
  });

  readonly okCount = computed(() => this.checks().filter((c) => c.status === 'ok').length);
  readonly warnCount = computed(() => this.checks().filter((c) => c.status === 'warn').length);

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

  setDeviceChoice(v: string) {
    this.deviceChoice.set(v);
  }

  copySummary() {
    const lines = this.checks().map((c) => c.label + ': ' + c.detail + ' [' + c.status + ']');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(lines.join('\n')).then(
        () => this.flashCopied(),
        () => this.flashCopied()
      );
    }
  }

  statusText(s: string): string {
    return this.t('labels.st' + s.charAt(0).toUpperCase() + s.slice(1));
  }

  private flashCopied() {
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  private guessDevice(): string {
    const ua = navigator.userAgent;
    if (/iPhone/.test(ua)) return this.t('labels.devIphone');
    if (/iPad/.test(ua)) return this.t('labels.devIpad');
    if (/Android/.test(ua)) return /Mobile/.test(ua) ? this.t('labels.devAndroidPhone') : this.t('labels.devTablet');
    if (/Mac/.test(ua)) return this.t('labels.devMacbook');
    if (/Windows/.test(ua)) return this.t('labels.devWindowsLaptop');
    return this.t('labels.devDesktopPc');
  }

  private parseBrowser(ua: string): [string, string] {
    let m: RegExpMatchArray | null;
    if ((m = ua.match(/EdgA?\/([\d.]+)/))) return ['Microsoft Edge', m[1]];
    if ((m = ua.match(/OPR\/([\d.]+)/))) return ['Opera', m[1]];
    if ((m = ua.match(/CriOS\/([\d.]+)/))) return ['Chrome (iOS)', m[1]];
    if ((m = ua.match(/FxiOS\/([\d.]+)/))) return ['Firefox (iOS)', m[1]];
    if ((m = ua.match(/Firefox\/([\d.]+)/))) return ['Firefox', m[1]];
    if ((m = ua.match(/Chrome\/([\d.]+)/))) return ['Google Chrome', m[1]];
    if ((m = ua.match(/Version\/([\d.]+).*Safari/))) return ['Safari', m[1]];
    return ['Unknown', ''];
  }

  private parseOS(ua: string): string {
    let m: RegExpMatchArray | null;
    if (/Windows NT 10/.test(ua)) return 'Windows 10 / 11';
    if ((m = ua.match(/Windows NT ([\d.]+)/))) return 'Windows NT ' + m[1];
    if ((m = ua.match(/Android ([\d.]+)/))) return 'Android ' + m[1];
    if (/iPhone|iPad|iPod/.test(ua)) {
      m = ua.match(/OS ([\d_]+)/);
      return 'iOS ' + (m ? m[1].replace(/_/g, '.') : '');
    }
    if ((m = ua.match(/Mac OS X ([\d_.]+)/))) return 'macOS ' + m[1].replace(/_/g, '.');
    if (/Linux/.test(ua)) return 'Linux';
    return 'Unknown';
  }

  ngOnDestroy() {
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
