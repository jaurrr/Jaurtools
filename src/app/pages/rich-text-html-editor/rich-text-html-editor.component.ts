import { AfterViewInit, Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-rich-text-html-editor',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './rich-text-html-editor.component.html',
  styleUrl: './rich-text-html-editor.component.scss',
})
export class RichTextHtmlEditorComponent implements AfterViewInit, OnDestroy {
  readonly slug = 'rich-text-html-editor';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['diff-checker', 'sig-figs-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);


  readonly showSource = signal(false);
  readonly linkUrl = signal('');
  readonly sourceText = signal('');
  readonly copied = signal(false);
  readonly wordCount = signal(0);
  readonly charCount = signal(0);

  ngAfterViewInit() {
    const el = this.editorEl();
    if (el && !el.innerHTML.trim()) {
      el.innerHTML = this.t('labels.initialHtml');
      this.refreshStats();
    }
  }

  format(cmd: string, arg?: string) {
    const el = this.editorEl();
    if (!el) return;
    el.focus();
    this.document.execCommand(cmd, false, arg ?? '');
    this.refreshStats();
  }
  applyLink() {
    let url = this.linkUrl().trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    this.format('createLink', url);
    this.linkUrl.set('');
  }
  setLinkUrl(v: string) { this.linkUrl.set(v); }
  setSourceText(v: string) { this.sourceText.set(v); }

  toggleSource() {
    if (!this.showSource()) {
      this.sourceText.set(this.currentHtml());
      this.showSource.set(true);
    } else {
      const el = this.editorEl();
      if (el) el.innerHTML = this.sourceText();
      this.showSource.set(false);
      this.refreshStats();
    }
  }

  onEditorInput() { this.refreshStats(); }

  currentHtml(): string {
    return this.editorEl()?.innerHTML ?? '';
  }

  copyHtml() {
    const html = this.showSource() ? this.sourceText() : this.currentHtml();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(html).then(() => {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 1500);
      }).catch(() => undefined);
    }
  }

  downloadHtml() {
    const html = this.showSource() ? this.sourceText() : this.currentHtml();
    const doc = '<!DOCTYPE html>\n<html>\n<head><meta charset="utf-8">\n<title>' +
      this.t('labels.downloadTitle') + '</title></head>\n<body>\n' + html + '\n</body>\n</html>';
    const blob = new Blob([doc], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'rich-text.html';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  clearEditor() {
    const el = this.editorEl();
    if (el) {
      el.innerHTML = '';
      this.sourceText.set('');
      this.refreshStats();
    }
  }

  private editorEl(): HTMLElement | null {
    return this.document.getElementById('rte-editor');
  }
  private refreshStats() {
    const el = this.editorEl();
    const text = (el?.innerText ?? '').replace(/\u200B/g, '').trim();
    this.charCount.set(text.length);
    this.wordCount.set(text ? text.split(/\s+/).length : 0);
  }


  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
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
    for (const l of ['en', 'hi', 'ar']) this.setLink('alternate', `https://jaurtools.com/${l}/${this.slug}`, l);
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
      '@type': 'Question', name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    }));
    const json = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity })
      .replace(/</g, '\u003c');
    const el = this.document.createElement('script');
    el.type = 'application/ld+json';
    el.textContent = json;
    this.document.head.appendChild(el);
    this.jsonLdEl = el;
  }
}
