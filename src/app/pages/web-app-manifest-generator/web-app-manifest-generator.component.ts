import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
}

const DISPLAYS = ['fullscreen', 'standalone', 'minimal-ui', 'browser'];
const ORIENTATIONS = ['', 'any', 'natural', 'landscape', 'portrait', 'portrait-primary', 'portrait-secondary', 'landscape-primary', 'landscape-secondary'];

@Component({
  selector: 'app-web-app-manifest-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './web-app-manifest-generator.component.html',
  styleUrl: './web-app-manifest-generator.component.scss',
})
export class WebAppManifestGeneratorComponent implements OnDestroy {
  readonly slug = 'web-app-manifest-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['pwa-manifest-checker', 'schema-markup-validator', 'llms-txt-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly displays = DISPLAYS;
  readonly orientations = ORIENTATIONS;

  readonly name = signal('');
  readonly shortName = signal('');
  readonly description = signal('');
  readonly startUrl = signal('/');
  readonly scope = signal('');
  readonly appId = signal('');
  readonly display = signal('standalone');
  readonly orientation = signal('');
  readonly themeColor = signal('#4f46e5');
  readonly bgColor = signal('#ffffff');
  readonly lang = signal('en');
  readonly dir = signal('');
  readonly icons = signal<ManifestIcon[]>([
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  ]);
  readonly copied = signal(false);

  private copyTimer: ReturnType<typeof setTimeout> | null = null;
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

  readonly manifest = computed((): Record<string, unknown> => {
    const m: Record<string, unknown> = {};
    const put = (k: string, v: string) => {
      if (v.trim()) m[k] = v.trim();
    };
    put('name', this.name());
    put('short_name', this.shortName());
    put('description', this.description());
    m['start_url'] = this.startUrl().trim() || '/';
    put('scope', this.scope());
    put('id', this.appId());
    m['display'] = this.display();
    if (this.orientation()) m['orientation'] = this.orientation();
    if (this.validColor(this.themeColor())) m['theme_color'] = this.themeColor().trim();
    if (this.validColor(this.bgColor())) m['background_color'] = this.bgColor().trim();
    put('lang', this.lang());
    if (this.dir()) m['dir'] = this.dir();
    const icons = this.icons()
      .filter((i) => i.src.trim() && i.sizes.trim())
      .map((i) => {
        const o: Record<string, string> = { src: i.src.trim(), sizes: i.sizes.trim() };
        if (i.type.trim()) o['type'] = i.type.trim();
        if (i.purpose.trim()) o['purpose'] = i.purpose.trim();
        return o;
      });
    if (icons.length > 0) m['icons'] = icons;
    return m;
  });

  readonly output = computed(() => JSON.stringify(this.manifest(), null, 2) + '\n');

  readonly warnings = computed(() => {
    const w: string[] = [];
    const m = this.manifest();
    if (!m['name'] && !m['short_name']) w.push('warnNoName');
    const icons = (m['icons'] as { sizes: string }[] | undefined) ?? [];
    const all = icons.flatMap((i) => i.sizes.split(/\s+/));
    if (!all.includes('192x192')) w.push('warnNo192');
    if (!all.includes('512x512')) w.push('warnNo512');
    if (this.themeColor().trim() && !this.validColor(this.themeColor())) w.push('warnBadTheme');
    if (this.bgColor().trim() && !this.validColor(this.bgColor())) w.push('warnBadBg');
    return w;
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

  setName(v: string) { this.name.set(v); }
  setShortName(v: string) { this.shortName.set(v); }
  setDescription(v: string) { this.description.set(v); }
  setStartUrl(v: string) { this.startUrl.set(v); }
  setScope(v: string) { this.scope.set(v); }
  setAppId(v: string) { this.appId.set(v); }
  setDisplay(v: string) { this.display.set(v); }
  setOrientation(v: string) { this.orientation.set(v); }
  setThemeColor(v: string) { this.themeColor.set(v); }
  setBgColor(v: string) { this.bgColor.set(v); }
  setLang(v: string) { this.lang.set(v); }
  setDir(v: string) { this.dir.set(v); }

  setIconField(i: number, field: keyof ManifestIcon, v: string) {
    this.icons.update((arr) => arr.map((o, idx) => (idx === i ? { ...o, [field]: v } : o)));
  }

  addIcon() {
    this.icons.update((arr) => [...arr, { src: '', sizes: '', type: 'image/png', purpose: 'any' }]);
  }

  removeIcon(i: number) {
    this.icons.update((arr) => arr.filter((_, idx) => idx !== i));
  }

  copyOutput() {
    const text = this.output();
    const done = () => {
      this.copied.set(true);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
    };
    const clipboard = (navigator as Navigator & { clipboard?: Clipboard }).clipboard;
    if (clipboard?.writeText) {
      clipboard.writeText(text).then(done).catch(() => this.legacyCopy(text, done));
    } else {
      this.legacyCopy(text, done);
    }
  }

  private legacyCopy(text: string, done: () => void) {
    const ta = this.document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    this.document.body.appendChild(ta);
    ta.select();
    try {
      this.document.execCommand('copy');
      done();
    } catch {
      /* clipboard unavailable */
    }
    ta.remove();
  }

  downloadFile() {
    const blob = new Blob([this.output()], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'manifest.webmanifest';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  ngOnDestroy() {
    if (this.copyTimer) clearTimeout(this.copyTimer);
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
