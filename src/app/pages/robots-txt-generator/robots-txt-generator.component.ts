import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

interface RobotRule {
  agent: string;
  access: 'allow' | 'disallow';
  path: string;
}

@Component({
  selector: 'app-robots-txt-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './robots-txt-generator.component.html',
  styleUrl: './robots-txt-generator.component.scss',
})
export class RobotsTxtGeneratorComponent implements OnDestroy {
  readonly slug = 'robots-txt-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['meta-tags-generator', 'htaccess-redirect-generator', 'qr-code-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly rules = signal<RobotRule[]>([
    { agent: '*', access: 'disallow', path: '/admin' },
    { agent: '*', access: 'allow', path: '/' },
  ]);
  readonly sitemap = signal('https://example.com/sitemap.xml');
  readonly crawlDelay = signal(0);
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
    const lines: string[] = ['# Generated with JaurTools Robots.txt Generator'];
    const valid = this.rules().filter((r) => r.agent.trim().length > 0);
    const agents = [...new Set(valid.map((r) => r.agent.trim()))];
    for (const agent of agents) {
      lines.push(`User-agent: ${agent}`);
      for (const r of valid.filter((x) => x.agent.trim() === agent)) {
        const directive = r.access === 'allow' ? 'Allow' : 'Disallow';
        lines.push(`${directive}: ${r.path.trim() || '/'}`);
      }
      if (this.crawlDelay() > 0) lines.push(`Crawl-delay: ${this.crawlDelay()}`);
      lines.push('');
    }
    if (this.sitemap().trim()) lines.push(`Sitemap: ${this.sitemap().trim()}`);
    return lines.join('\n').trimEnd();
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

  addRule(): void {
    this.rules.update((rs) => [...rs, { agent: '*', access: 'disallow' as const, path: '' }]);
  }

  removeRule(index: number): void {
    this.rules.update((rs) => rs.filter((_, i) => i !== index));
  }

  updateRule(index: number, patch: Partial<RobotRule>): void {
    this.rules.update((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  setCrawlDelay(v: number): void {
    const n = Number(v);
    this.crawlDelay.set(Number.isFinite(n) ? Math.min(3600, Math.max(0, Math.round(n))) : 0);
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
    a.download = 'robots.txt';
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
