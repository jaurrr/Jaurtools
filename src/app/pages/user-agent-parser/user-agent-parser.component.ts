import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface UaInfo {
  browser: string;
  browserVersion: string;
  engine: string;
  os: string;
  osVersion: string;
  deviceType: string;
  device: string;
  isBot: boolean;
  botName: string;
}

const WIN_VERSIONS: Record<string, string> = {
  '6.3': '8.1',
  '6.2': '8',
  '6.1': '7',
  '6.0': 'Vista',
  '5.2': 'XP x64',
  '5.1': 'XP',
};

@Component({
  selector: 'app-user-agent-parser',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './user-agent-parser.component.html',
  styleUrl: './user-agent-parser.component.scss',
})
export class UserAgentParserComponent implements OnDestroy {
  readonly slug = 'user-agent-parser';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['har-file-viewer', 'ssl-certificate-decoder', 'pwa-manifest-checker'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly uaInput = signal('');

  readonly samples = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  ];

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private parse(ua: string): UaInfo {
    const info: UaInfo = {
      browser: 'Unknown', browserVersion: '', engine: '',
      os: 'Unknown', osVersion: '', deviceType: 'Desktop',
      device: '', isBot: false, botName: '',
    };
    if (!ua.trim()) return info;

    if (/bot|crawler|spider|crawl|slurp|mediapartners|baidu|yandex|sogou|exabot|facebot|ia_archiver/i.test(ua)) {
      info.isBot = true;
      info.botName = /([a-z0-9_.-]*?(?:bot|crawler|spider|crawl)[a-z0-9_.-]*)/i.exec(ua)?.[1] ?? 'bot';
      info.deviceType = 'Bot';
    }

    let m: RegExpExecArray | null;
    if ((m = /\bEdg(?:iOS|A)?\/([\d.]+)/.exec(ua))) {
      info.browser = 'Edge'; info.browserVersion = m[1]; info.engine = 'Blink';
    } else if ((m = /\bOPR\/([\d.]+)/.exec(ua))) {
      info.browser = 'Opera'; info.browserVersion = m[1]; info.engine = 'Blink';
    } else if ((m = /\bSamsungBrowser\/([\d.]+)/.exec(ua))) {
      info.browser = 'Samsung Internet'; info.browserVersion = m[1]; info.engine = 'Blink';
    } else if ((m = /\bCriOS\/([\d.]+)/.exec(ua))) {
      info.browser = 'Chrome'; info.browserVersion = m[1]; info.engine = 'WebKit';
    } else if ((m = /\bFxiOS\/([\d.]+)/.exec(ua))) {
      info.browser = 'Firefox'; info.browserVersion = m[1]; info.engine = 'WebKit';
    } else if ((m = /\bChrome\/([\d.]+)/.exec(ua))) {
      info.browser = 'Chrome'; info.browserVersion = m[1]; info.engine = 'Blink';
    } else if ((m = /\bFirefox\/([\d.]+)/.exec(ua))) {
      info.browser = 'Firefox'; info.browserVersion = m[1]; info.engine = 'Gecko';
    } else if ((m = /Version\/([\d.]+).*Safari\//.exec(ua))) {
      info.browser = 'Safari'; info.browserVersion = m[1]; info.engine = 'WebKit';
    } else if ((m = /\bMSIE ([\d.]+)/.exec(ua))) {
      info.browser = 'Internet Explorer'; info.browserVersion = m[1]; info.engine = 'Trident';
    } else if (/Trident\//.test(ua)) {
      info.browser = 'Internet Explorer';
      info.browserVersion = /rv:([\d.]+)/.exec(ua)?.[1] ?? '';
      info.engine = 'Trident';
    }

    if (/Windows NT 10\.0/.test(ua)) {
      info.os = 'Windows'; info.osVersion = '10 / 11';
    } else if ((m = /Windows NT ([\d.]+)/.exec(ua))) {
      info.os = 'Windows'; info.osVersion = WIN_VERSIONS[m[1]] ?? m[1];
    } else if (/iPhone|iPad|iPod/.test(ua)) {
      info.os = 'iOS';
      const v = /(?:CPU (?:iPhone )?OS|iPhone OS) ([\d_]+)/.exec(ua);
      info.osVersion = v ? v[1].replace(/_/g, '.') : '';
    } else if ((m = /Android ([\d.]+)/.exec(ua))) {
      info.os = 'Android'; info.osVersion = m[1];
    } else if ((m = /Mac OS X ([\d_]+)/.exec(ua))) {
      info.os = 'macOS'; info.osVersion = m[1].replace(/_/g, '.');
    } else if (/CrOS/.test(ua)) {
      info.os = 'ChromeOS';
    } else if (/Linux/.test(ua)) {
      info.os = 'Linux';
    }

    if (!info.isBot) {
      if (/iPad|Tablet|PlayBook|Nexus 7|Nexus 9|Nexus 10|SM-T\d/i.test(ua)) info.deviceType = 'Tablet';
      else if (/Mobile|iPhone|iPod|Android|IEMobile|Windows Phone/i.test(ua)) info.deviceType = 'Mobile';
      else info.deviceType = 'Desktop';
    }

    if (/iPhone/.test(ua)) info.device = 'iPhone';
    else if (/iPad/.test(ua)) info.device = 'iPad';
    else {
      const model = /;\s*([^;)]+?)\s+Build\//.exec(ua)?.[1]?.trim();
      if (model) info.device = model;
    }
    return info;
  }

  readonly result = computed((): UaInfo | null => {
    const ua = this.uaInput().trim();
    return ua ? this.parse(ua) : null;
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

  setUa(v: string) { this.uaInput.set(v); }
  useMyUa() { this.uaInput.set(navigator.userAgent); }
  useSample(i: number) { this.uaInput.set(this.samples[i]); }
  clearInput() { this.uaInput.set(''); }

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
