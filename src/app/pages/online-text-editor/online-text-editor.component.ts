import { Component, computed, effect, inject, signal, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

@Component({
  selector: 'app-online-text-editor',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './online-text-editor.component.html',
  styleUrl: './online-text-editor.component.scss',
})
export class OnlineTextEditorComponent implements AfterViewInit, OnDestroy {
  readonly slug = 'online-text-editor';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['online-text-editor', 'strip-html-tags', 'fancy-text-generator', 'text-to-handwriting'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  @ViewChild('editor') editorRef!: ElementRef<HTMLDivElement>;

  readonly plainText = signal('');
  readonly fontSize = signal('3');
  readonly textColor = signal('#0f172a');
  readonly copied = signal(false);
  readonly savedAt = signal<string | null>(null);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  ngAfterViewInit() {
    this.restoreAutosave();
    this.syncPlainText();
  }

  /** Restore the last autosaved draft from this device, if any. */
  private restoreAutosave(): void {
    try {
      const saved = localStorage.getItem('jt-online-text-editor');
      if (saved && this.editorRef?.nativeElement) {
        this.editorRef.nativeElement.innerHTML = saved;
        this.savedAt.set(this.t('labels.restoredNote'));
      }
    } catch { /* storage unavailable */ }
  }

  /** Debounced autosave of the document HTML to this device only. */
  private scheduleAutosave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        const html = this.editorRef?.nativeElement?.innerHTML ?? '';
        localStorage.setItem('jt-online-text-editor', html);
        const time = new Date().toLocaleTimeString(this.locale(), { hour: '2-digit', minute: '2-digit' });
        this.savedAt.set(`${this.t('labels.savedNote')} ${time}`);
      } catch { /* storage unavailable */ }
    }, 1000);
  }

  readonly words = computed(() => {
    const trimmed = this.plainText().trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  });

  readonly chars = computed(() => this.plainText().length);

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

  format(cmd: string, value?: string) {
    this.editorRef?.nativeElement.focus();
    try {
      this.document.execCommand(cmd, false, value ?? '');
    } catch { /* command unsupported */ }
    this.syncPlainText();
  }

  onInput() {
    this.syncPlainText();
    this.scheduleAutosave();
  }

  setFontSize(v: string) {
    this.fontSize.set(v);
    this.format('fontSize', v);
  }

  setTextColor(v: string) {
    this.textColor.set(v);
    this.format('foreColor', v);
  }

  clearFormatting() {
    this.editorRef?.nativeElement.focus();
    try {
      this.document.execCommand('selectAll', false);
      this.document.execCommand('removeFormat', false);
      this.document.execCommand('formatBlock', false, 'p');
    } catch { /* command unsupported */ }
    this.syncPlainText();
  }

  copyHtml() {
    const html = this.editorRef?.nativeElement.innerHTML ?? '';
    if (!html) return;
    navigator.clipboard.writeText(html).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }).catch(() => undefined);
  }

  downloadHtml() {
    const body = this.editorRef?.nativeElement.innerHTML ?? '';
    const full = `<!DOCTYPE html>\n<html>\n<head><meta charset="utf-8"><title>${this.t('name')}</title></head>\n<body>\n${body}\n</body>\n</html>`;
    const blob = new Blob([full], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'document.html';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  private locale(): string {
    const lang = this.translate.lang();
    return lang === 'ar' ? 'ar-SA' : lang === 'hi' ? 'hi-IN' : 'en-IN';
  }

  private syncPlainText() {
    const el = this.editorRef?.nativeElement;
    this.plainText.set(el ? (el.innerText ?? '') : '');
  }

  ngOnDestroy() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
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
