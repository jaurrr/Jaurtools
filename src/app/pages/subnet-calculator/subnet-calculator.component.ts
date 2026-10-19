import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface SubnetInfo {
  mask: string;
  maskBinary: string;
  wildcard: string;
  network: string;
  broadcast: string;
  firstHost: string;
  lastHost: string;
  total: number;
  usable: number;
  ipClass: string;
  isPrivate: boolean;
  ipBinary: string;
}

function parseIpv4(ip: string): number | null {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = parseInt(p, 10);
    if (v < 0 || v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

function intToIp(n: number): string {
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

function dottedBinary(ip: string): string {
  return ip
    .split('.')
    .map((p) => parseInt(p, 10).toString(2).padStart(8, '0'))
    .join('.');
}

@Component({
  selector: 'app-subnet-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './subnet-calculator.component.html',
  styleUrl: './subnet-calculator.component.scss',
})
export class SubnetCalculatorComponent implements OnDestroy {
  readonly slug = 'subnet-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['cidr-calculator', 'jwt-decoder', 'json-validator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly ip = signal('192.168.1.10');
  readonly prefix = signal(24);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly info = computed<SubnetInfo | null>(() => {
    const addr = parseIpv4(this.ip());
    const p = this.prefix();
    if (addr === null || p < 0 || p > 32) return null;
    const maskInt = p === 0 ? 0 : ((0xffffffff << (32 - p)) >>> 0);
    const network = (addr & maskInt) >>> 0;
    const broadcast = (network | (~maskInt >>> 0)) >>> 0;
    const hostBits = 32 - p;
    const total = 2 ** hostBits;
    const usable = p === 32 ? 1 : p === 31 ? 2 : total - 2;
    const firstHost = p >= 31 ? network : network + 1;
    const lastHost = p >= 31 ? broadcast : broadcast - 1;
    const firstOctet = addr >>> 24;
    const ipClass =
      firstOctet === 127 ? 'Loopback' :
      firstOctet === 0 ? 'Special (0.0.0.0/8)' :
      firstOctet <= 126 ? 'A' :
      firstOctet <= 191 ? 'B' :
      firstOctet <= 223 ? 'C' :
      firstOctet <= 239 ? 'D (multicast)' : 'E (reserved)';
    const isPrivate =
      firstOctet === 10 ||
      (firstOctet === 172 && ((addr >>> 16) & 255) >= 16 && ((addr >>> 16) & 255) <= 31) ||
      (firstOctet === 192 && ((addr >>> 16) & 255) === 168);
    return {
      mask: intToIp(maskInt),
      maskBinary: dottedBinary(intToIp(maskInt)),
      wildcard: intToIp((~maskInt) >>> 0),
      network: intToIp(network),
      broadcast: intToIp(broadcast),
      firstHost: intToIp(firstHost),
      lastHost: intToIp(lastHost),
      total,
      usable,
      ipClass,
      isPrivate,
      ipBinary: dottedBinary(intToIp(addr)),
    };
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

  tc(key: string): string {
    this.translate.lang();
    const raw = (this.translate.t as unknown as (k: string) => unknown)(`common.${key}`);
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

  fmt(n: number): string {
    return new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 0 }).format(n);
  }

  setIp(v: string): void {
    this.ip.set(v);
  }

  setPrefix(v: number): void {
    this.prefix.set(this.clampNum(v, 0, 32));
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
