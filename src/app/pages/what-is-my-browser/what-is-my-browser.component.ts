import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface BrowserInfo {
  name: string;
  version: string;
  os: string;
  deviceType: string;
  ua: string;
  language: string;
  platform: string;
  cores: string;
  memory: string;
  screen: string;
  viewport: string;
  dpr: string;
  touch: boolean;
  cookies: boolean;
  online: boolean;
  doNotTrack: string;
  webdriver: boolean;
}

@Component({
  selector: 'app-what-is-my-browser',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './what-is-my-browser.component.html',
  styleUrl: './what-is-my-browser.component.scss',
})
export class WhatIsMyBrowserComponent implements OnDestroy {
  readonly slug = 'what-is-my-browser';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['device-test', 'connection-test', 'webcam-test', 'mic-test'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly info = computed((): BrowserInfo => {
    this.translate.lang();
    const nav = navigator;
    const ua = nav.userAgent;
    const [name, version] = this.parseBrowser(ua);
    return {
      name,
      version,
      os: this.parseOS(ua),
      deviceType: this.parseDevice(ua),
      ua,
      language: nav.language,
      platform: (nav as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? nav.platform,
      cores: String(nav.hardwareConcurrency ?? '?'),
      memory: (nav as Navigator & { deviceMemory?: number }).deviceMemory
        ? String((nav as Navigator & { deviceMemory?: number }).deviceMemory) + ' GB'
        : '?',
      screen: screen.width + ' x ' + screen.height,
      viewport: window.innerWidth + ' x ' + window.innerHeight,
      dpr: String(window.devicePixelRatio ?? 1),
      touch: nav.maxTouchPoints > 0,
      cookies: nav.cookieEnabled,
      online: nav.onLine,
      doNotTrack: nav.doNotTrack ?? '?',
      webdriver: nav.webdriver === true,
    };
  });

  readonly deviceLabel = computed(() => {
    const d = this.info().deviceType;
    return d === 'mobile' ? this.t('labels.devMobile') : d === 'tablet' ? this.t('labels.devTablet') : this.t('labels.devDesktop');
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

  boolLabel(v: boolean): string {
    return v ? this.t('labels.yes') : this.t('labels.no');
  }

  copyUa() {
    const ua = this.info().ua;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(ua).then(() => this.flashCopied()).catch(() => this.flashCopied());
    }
  }

  private flashCopied() {
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  private parseBrowser(ua: string): [string, string] {
    let m: RegExpMatchArray | null;
    if ((m = ua.match(/EdgA?\/([\d.]+)/))) return ['Microsoft Edge', m[1]];
    if ((m = ua.match(/OPR\/([\d.]+)/))) return ['Opera', m[1]];
    if ((m = ua.match(/Vivaldi\/([\d.]+)/))) return ['Vivaldi', m[1]];
    if ((m = ua.match(/SamsungBrowser\/([\d.]+)/))) return ['Samsung Internet', m[1]];
    if ((m = ua.match(/YaBrowser\/([\d.]+)/))) return ['Yandex Browser', m[1]];
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

  private parseDevice(ua: string): string {
    if (/iPad|Tablet|PlayBook|Nexus 7|Nexus 10|SM-T|Tab/.test(ua) && !/Mobile/.test(ua)) return 'tablet';
    if (/Mobi|Android|iPhone|iPod|Windows Phone/.test(ua)) return 'mobile';
    return 'desktop';
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
