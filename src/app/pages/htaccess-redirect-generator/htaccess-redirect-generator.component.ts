import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

interface RedirectRule {
  from: string;
  to: string;
  code: '301' | '302';
}

@Component({
  selector: 'app-htaccess-redirect-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './htaccess-redirect-generator.component.html',
  styleUrl: './htaccess-redirect-generator.component.scss',
})
export class HtaccessRedirectGeneratorComponent implements OnDestroy {
  readonly slug = 'htaccess-redirect-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['robots-txt-generator', 'meta-tags-generator', 'qr-code-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly rules = signal<RedirectRule[]>([
    { from: '/old-page', to: 'https://example.com/new-page', code: '301' },
  ]);
  readonly forceHttps = signal(false);
  readonly wwwMode = signal<'none' | 'to-www' | 'to-non-www'>('none');
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly output = computed(() => {
    const lines: string[] = [
      '# Generated with JaurTools .htaccess Redirect Generator',
      'RewriteEngine On',
      '',
    ];
    if (this.forceHttps()) {
      lines.push(
        '# Force HTTPS',
        'RewriteCond %{HTTPS} off',
        'RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]',
        '',
      );
    }
    const www = this.wwwMode();
    if (www === 'to-non-www') {
      lines.push(
        '# Redirect www to non-www',
        'RewriteCond %{HTTP_HOST} ^www\\.(.+)$ [NC]',
        'RewriteRule ^(.*)$ https://%1/$1 [L,R=301]',
        '',
      );
    } else if (www === 'to-www') {
      lines.push(
        '# Redirect non-www to www',
        'RewriteCond %{HTTP_HOST} !^www\\. [NC]',
        'RewriteRule ^(.*)$ https://www.%{HTTP_HOST}%{REQUEST_URI} [L,R=301]',
        '',
      );
    }
    const valid = this.rules().filter((r) => r.from.trim().length > 0 && r.to.trim().length > 0);
    if (valid.length > 0) {
      lines.push('# Page redirects');
      for (const r of valid) lines.push(`Redirect ${r.code} ${r.from.trim()} ${r.to.trim()}`);
    }
    return lines.join('\n');
  });

  readonly hasRules = computed(() =>
    this.rules().some((r) => r.from.trim().length > 0 && r.to.trim().length > 0),
  );

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

  addRule(): void {
    this.rules.update((rs) => [...rs, { from: '', to: '', code: '301' as const }]);
  }

  removeRule(index: number): void {
    this.rules.update((rs) => rs.filter((_, i) => i !== index));
  }

  updateRule(index: number, patch: Partial<RedirectRule>): void {
    this.rules.update((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  setForceHttps(v: boolean): void {
    this.forceHttps.set(v);
  }

  setWwwMode(v: 'none' | 'to-www' | 'to-non-www'): void {
    this.wwwMode.set(v);
  }

  async copyOutput(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.output()).catch(() => undefined);
      this.copied.set(true);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.copied.set(false);
    }
  }

  download(): void {
    const blob = new Blob([this.output()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = '.htaccess';
    a.click();
    URL.revokeObjectURL(url);
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
