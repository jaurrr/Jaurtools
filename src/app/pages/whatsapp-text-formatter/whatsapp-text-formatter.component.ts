import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

const SAMPLE =
  '*Jauhar:* Hey! Are you coming to the _demo_ tomorrow?\n' +
  '*Me:* Yes! ~Can\'t~ wait. Run `npm run build` first.\n' +
  '> Quoted from yesterday\'s chat\n' +
  'Don\'t forget the ```meeting notes``` please.';

@Component({
  selector: 'app-whatsapp-text-formatter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './whatsapp-text-formatter.component.html',
  styleUrl: './whatsapp-text-formatter.component.scss',
})
export class WhatsappTextFormatterComponent implements OnDestroy {
  readonly slug = 'whatsapp-text-formatter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['case-converter', 'word-combiner', 'word-counter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly input = signal(SAMPLE);
  readonly rawInput = signal(SAMPLE);
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  readonly mode = signal<'preview' | 'plain'>('preview');
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

  readonly previewHtml = computed(() => this.renderWhatsapp(this.input()));

  readonly stripped = computed(() =>
    this.input()
      .replace(/```([\s\S]*?)```/g, '$1')
      .replace(/[*_~`]/g, '')
      .replace(/^>\s?/gm, '')
  );

  readonly inputChars = computed(() => this.input().length);

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

  setInput(v: string) {
    const val = (v.slice(0, 50000));
    this.rawInput.set(val);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.input.set(val), 250);
  }

  setMode(m: 'preview' | 'plain'): void {
    this.mode.set(m);
  }

  clearAll(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.rawInput.set('');
    this.input.set('');
  }

  async copyText(): Promise<void> {
    await this.copyString(this.stripped());
  }

  async copyHtml(): Promise<void> {
    await this.copyString(this.previewHtml());
  }

  private async copyString(text: string): Promise<void> {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text).catch(() => undefined);
    } catch {
      const ta = this.document.createElement('textarea');
      ta.value = text;
      this.document.body.appendChild(ta);
      ta.select();
      this.document.execCommand('copy');
      ta.remove();
    }
    this.copied.set(true);
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
  }

  downloadHtml(): void {
    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>WhatsApp chat</title></head><body>${this.previewHtml()}</body></html>`;
    this.downloadBlob(doc, 'text/html;charset=utf-8', `${this.slug}.html`);
  }

  downloadTxt(): void {
    this.downloadBlob(this.stripped(), 'text/plain;charset=utf-8', `${this.slug}.txt`);
  }

  private downloadBlob(content: string, type: string, filename: string): void {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = filename;
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  ngOnDestroy(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private renderWhatsapp(raw: string): string {
    let html = this.escapeHtml(raw);
    const blocks: string[] = [];
    html = html.replace(/```([\s\S]*?)```/g, (_m: string, code: string) => {
      blocks.push(`<pre class="wa-code"><code>${code}</code></pre>`);
      return `__WABLOCK${blocks.length - 1}__`;
    });
    html = html.replace(/`([^`\n]+?)`/g, '<code class="wa-inline">$1</code>');
    html = html.replace(/\*([^*\n]+?)\*/g, '<strong>$1</strong>');
    html = html.replace(/_([^_\n]+?)_/g, '<em>$1</em>');
    html = html.replace(/~([^~\n]+?)~/g, '<del>$1</del>');
    html = html
      .split('\n')
      .map((line) =>
        /^&gt;/.test(line) ? `<blockquote>${line.replace(/^&gt;\s?/, '')}</blockquote>` : line
      )
      .join('<br>');
    html = html.replace(/__WABLOCK(\d+)__/g, (_m: string, i: string) => blocks[Number(i)] ?? '');
    return html;
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }

  private updateSeo(): void {
    const lang = this.translate.lang();
    this.pageTitle.setTitle(this.t('metaTitle'));
    this.meta.updateTag({ name: 'description', content: this.t('metaDescription') });
    this.meta.updateTag({ name: 'keywords', content: this.t('keywords') });
    this.setLink('canonical', `https://jaurtools.com/${lang}/${this.slug}`);
    for (const l of ['en', 'hi', 'ar']) {
      this.setLink('alternate', `https://jaurtools.com/${l}/${this.slug}`, l);
    }
  }

  private setLink(rel: string, href: string, hreflang?: string): void {
    const head = this.document.head;
    const selector = hreflang
      ? `link[rel="${rel}"][hreflang="${hreflang}"]`
      : `link[rel="${rel}"]:not([hreflang])`;
    let el = head.querySelector<HTMLLinkElement>(selector);
    if (!el) {
      el = this.document.createElement('link');
      el.rel = rel;
      if (hreflang) el.hreflang = hreflang;
      head.appendChild(el);
    }
    el.href = href;
  }

  private refreshJsonLd(): void {
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
