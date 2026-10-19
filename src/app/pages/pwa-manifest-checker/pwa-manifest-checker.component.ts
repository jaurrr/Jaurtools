import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface Check {
  labelKey: string;
  status: 'pass' | 'warn' | 'fail';
  detailKey: string;
  param: string;
}

const DISPLAY_VALUES = ['fullscreen', 'standalone', 'minimal-ui', 'browser'];
const ORIENTATIONS = [
  'any', 'natural', 'landscape', 'portrait',
  'portrait-primary', 'portrait-secondary', 'landscape-primary', 'landscape-secondary',
];

@Component({
  selector: 'app-pwa-manifest-checker',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './pwa-manifest-checker.component.html',
  styleUrl: './pwa-manifest-checker.component.scss',
})
export class PwaManifestCheckerComponent implements OnDestroy {
  readonly slug = 'pwa-manifest-checker';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['web-app-manifest-generator', 'schema-markup-validator', 'llms-txt-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly jsonInput = signal('');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private validColor(v: string): boolean {
    if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') {
      return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());
    }
    return CSS.supports('color', v.trim());
  }

  readonly parsed = computed((): { ok: true; manifest: Record<string, unknown> } | { ok: false } | null => {
    const raw = this.jsonInput().trim();
    if (!raw) return null;
    try {
      const m = JSON.parse(raw) as unknown;
      if (!m || typeof m !== 'object' || Array.isArray(m)) return { ok: false };
      return { ok: true, manifest: m as Record<string, unknown> };
    } catch {
      return { ok: false };
    }
  });

  readonly checks = computed((): Check[] => {
    const p = this.parsed();
    if (!p || !p.ok) return [];
    const m = p.manifest;
    const out: Check[] = [];
    const str = (v: unknown): string => (typeof v === 'string' ? v : '');

    const name = str(m['name']) || str(m['short_name']);
    out.push({
      labelKey: 'checkName', status: name ? 'pass' : 'fail',
      detailKey: name ? 'dNameOk' : 'dNameFail', param: str(m['name']) || str(m['short_name']),
    });

    const startUrl = str(m['start_url']);
    out.push({
      labelKey: 'checkStartUrl', status: startUrl ? 'pass' : 'fail',
      detailKey: startUrl ? 'dStartUrlOk' : 'dStartUrlFail', param: startUrl,
    });

    const display = str(m['display']);
    out.push({
      labelKey: 'checkDisplay',
      status: !display ? 'warn' : DISPLAY_VALUES.includes(display) ? 'pass' : 'fail',
      detailKey: !display ? 'dDisplayMissing' : DISPLAY_VALUES.includes(display) ? 'dDisplayOk' : 'dDisplayFail',
      param: display,
    });

    const icons = Array.isArray(m['icons']) ? (m['icons'] as Record<string, unknown>[]) : [];
    out.push({
      labelKey: 'checkIcons', status: icons.length > 0 ? 'pass' : 'fail',
      detailKey: icons.length > 0 ? 'dIconsOk' : 'dIconsFail', param: String(icons.length),
    });
    const sizes = (icon: Record<string, unknown>): string[] => str(icon['sizes']).split(/\s+/).filter(Boolean);
    const has192 = icons.some((i) => sizes(i).includes('192x192'));
    const has512 = icons.some((i) => sizes(i).includes('512x512'));
    const hasMaskable = icons.some((i) => str(i['purpose']).split(/\s+/).includes('maskable'));
    out.push({ labelKey: 'checkIcon192', status: has192 ? 'pass' : 'fail', detailKey: has192 ? 'dIcon192Ok' : 'dIcon192Fail', param: '' });
    out.push({ labelKey: 'checkIcon512', status: has512 ? 'pass' : 'fail', detailKey: has512 ? 'dIcon512Ok' : 'dIcon512Fail', param: '' });
    out.push({ labelKey: 'checkMaskable', status: hasMaskable ? 'pass' : 'warn', detailKey: hasMaskable ? 'dMaskableOk' : 'dMaskableWarn', param: '' });

    const theme = str(m['theme_color']);
    out.push({
      labelKey: 'checkTheme',
      status: !theme ? 'warn' : this.validColor(theme) ? 'pass' : 'fail',
      detailKey: !theme ? 'dThemeMissing' : this.validColor(theme) ? 'dThemeOk' : 'dThemeFail',
      param: theme,
    });
    const bg = str(m['background_color']);
    out.push({
      labelKey: 'checkBg',
      status: !bg ? 'warn' : this.validColor(bg) ? 'pass' : 'fail',
      detailKey: !bg ? 'dBgMissing' : this.validColor(bg) ? 'dBgOk' : 'dBgFail',
      param: bg,
    });

    const scope = str(m['scope']);
    out.push({ labelKey: 'checkScope', status: scope ? 'pass' : 'warn', detailKey: scope ? 'dScopeOk' : 'dScopeWarn', param: scope });
    const id = str(m['id']);
    out.push({ labelKey: 'checkId', status: id ? 'pass' : 'warn', detailKey: id ? 'dIdOk' : 'dIdWarn', param: id });
    const desc = str(m['description']);
    out.push({ labelKey: 'checkDesc', status: desc ? 'pass' : 'warn', detailKey: desc ? 'dDescOk' : 'dDescWarn', param: '' });

    const orientation = str(m['orientation']);
    if (orientation) {
      out.push({
        labelKey: 'checkOrientation',
        status: ORIENTATIONS.includes(orientation) ? 'pass' : 'fail',
        detailKey: ORIENTATIONS.includes(orientation) ? 'dOrientationOk' : 'dOrientationFail',
        param: orientation,
      });
    }
    return out;
  });

  readonly counts = computed(() => {
    const c = this.checks();
    return {
      pass: c.filter((x) => x.status === 'pass').length,
      warn: c.filter((x) => x.status === 'warn').length,
      fail: c.filter((x) => x.status === 'fail').length,
    };
  });

  detailText(c: Check): string {
    this.translate.lang();
    return (this.t('labels.' + c.detailKey) as string).replace('{v}', c.param);
  }

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

  setJson(v: string) { this.jsonInput.set(v); }
  clearInput() { this.jsonInput.set(''); }

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
