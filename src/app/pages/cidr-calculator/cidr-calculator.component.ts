import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface CidrBlock {
  normalized: boolean;
  prefix: number;
  mask: string;
  wildcard: string;
  network: string;
  broadcast: string;
  firstHost: string;
  lastHost: string;
  total: number;
  usable: number;
  ipClass: string;
  isPrivate: boolean;
}

interface SubnetRow {
  cidr: string;
  range: string;
  usable: number;
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

function maskInt(prefix: number): number {
  return prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
}

@Component({
  selector: 'app-cidr-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './cidr-calculator.component.html',
  styleUrl: './cidr-calculator.component.scss',
})
export class CidrCalculatorComponent implements OnDestroy {
  readonly slug = 'cidr-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['subnet-calculator', 'json-validator', 'jwt-decoder'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly cidrText = signal('192.168.0.0/24');
  readonly newPrefix = signal(26);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly block = computed<CidrBlock | null>(() => {
    const m = this.cidrText().trim().match(/^(.+?)\s*\/\s*(\d{1,2})$/);
    if (!m) return null;
    const addr = parseIpv4(m[1]);
    const p = parseInt(m[2], 10);
    if (addr === null || p < 0 || p > 32) return null;
    const mask = maskInt(p);
    const network = (addr & mask) >>> 0;
    const broadcast = (network | (~mask >>> 0)) >>> 0;
    const total = 2 ** (32 - p);
    const usable = p === 32 ? 1 : p === 31 ? 2 : total - 2;
    const firstOctet = network >>> 24;
    const ipClass =
      firstOctet === 127 ? 'Loopback' :
      firstOctet <= 126 ? 'A' :
      firstOctet <= 191 ? 'B' :
      firstOctet <= 223 ? 'C' :
      firstOctet <= 239 ? 'D (multicast)' : 'E (reserved)';
    const second = (network >>> 16) & 255;
    const isPrivate =
      firstOctet === 10 ||
      (firstOctet === 172 && second >= 16 && second <= 31) ||
      (firstOctet === 192 && second === 168);
    return {
      normalized: (addr & (~mask >>> 0)) !== 0,
      prefix: p,
      mask: intToIp(mask),
      wildcard: intToIp((~mask) >>> 0),
      network: intToIp(network),
      broadcast: intToIp(broadcast),
      firstHost: intToIp(p >= 31 ? network : network + 1),
      lastHost: intToIp(p >= 31 ? broadcast : broadcast - 1),
      total,
      usable,
      ipClass,
      isPrivate,
    };
  });

  readonly split = computed<{ rows: SubnetRow[]; total: number; truncated: boolean } | null>(() => {
    const b = this.block();
    if (!b) return null;
    const np = Math.min(32, Math.max(b.prefix, this.newPrefix()));
    const count = 2 ** (np - b.prefix);
    const size = 2 ** (32 - np);
    const base = parseIpv4(b.network) as number;
    const usable = np === 32 ? 1 : np === 31 ? 2 : size - 2;
    const limit = Math.min(count, 256);
    const rows: SubnetRow[] = [];
    for (let i = 0; i < limit; i++) {
      const net = base + i * size;
      const bc = net + size - 1;
      const first = np >= 31 ? net : net + 1;
      const last = np >= 31 ? bc : bc - 1;
      rows.push({
        cidr: `${intToIp(net)}/${np}`,
        range: `${intToIp(first)} - ${intToIp(last)}`,
        usable,
      });
    }
    return { rows, total: count, truncated: count > limit };
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

  setCidr(v: string): void {
    this.cidrText.set(v);
  }

  setNewPrefix(v: number): void {
    this.newPrefix.set(this.clampNum(v, 0, 32));
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
