import { Component, computed, effect, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

@Component({
  selector: 'app-css-checkbox-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './css-checkbox-generator.component.html',
  styleUrl: './css-checkbox-generator.component.scss',
})
export class CssCheckboxGeneratorComponent implements OnDestroy {
  readonly slug = 'css-checkbox-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['css-box-shadow-generator', 'css-border-radius-generator', 'css-background-pattern-generator', 'css-clip-path-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly style = signal<'checkbox' | 'switch'>('checkbox');
  readonly size = signal(20);
  readonly accent = signal('#4f46e5');
  readonly borderColor = signal('#94a3b8');
  readonly borderWidth = signal(2);
  readonly cornerPct = signal(25);
  readonly labelText = signal('Enable notifications');
  readonly copiedHtml = signal(false);
  readonly copiedCss = signal(false);

  readonly previewHost = viewChild<ElementRef<HTMLDivElement>>('previewHost');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    effect(() => {
      const host = this.previewHost()?.nativeElement;
      if (!host) return;
      host.innerHTML = '';
      const styleEl = this.document.createElement('style');
      styleEl.textContent = this.cssCode();
      host.appendChild(styleEl);
      const wrap = this.document.createElement('div');
      wrap.innerHTML = this.htmlCode();
      host.appendChild(wrap);
    });
  }

  readonly labelSafe = computed(() => {
    const v = this.labelText().trim();
    return v ? escapeHtml(v.slice(0, 60)) : 'Label';
  });

  readonly htmlCode = computed(() => {
    if (this.style() === 'switch') {
      return `<label class="fancy-switch">\n  <input type="checkbox" />\n  <span class="track" aria-hidden="true"><span class="knob"></span></span>\n  <span>${this.labelSafe()}</span>\n</label>`;
    }
    return `<label class="fancy-check">\n  <input type="checkbox" />\n  <span class="box" aria-hidden="true"></span>\n  <span>${this.labelSafe()}</span>\n</label>`;
  });

  readonly cssCode = computed(() => {
    const s = this.size();
    const bw = this.borderWidth();
    if (this.style() === 'switch') {
      const w = s * 2;
      const knob = Math.max(8, s - 4);
      const travel = w - knob - 4;
      return (
        `.fancy-switch {\n  display: inline-flex;\n  align-items: center;\n  gap: 10px;\n  cursor: pointer;\n  user-select: none;\n}\n` +
        `.fancy-switch input {\n  position: absolute;\n  opacity: 0;\n  width: 1px;\n  height: 1px;\n}\n` +
        `.fancy-switch .track {\n  width: ${w}px;\n  height: ${s}px;\n  border-radius: 999px;\n  background: ${this.borderColor()};\n  position: relative;\n  transition: background 0.2s ease;\n  flex: none;\n}\n` +
        `.fancy-switch .knob {\n  position: absolute;\n  top: 2px;\n  left: 2px;\n  width: ${knob}px;\n  height: ${knob}px;\n  border-radius: 50%;\n  background: #ffffff;\n  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);\n  transition: transform 0.2s ease;\n}\n` +
        `.fancy-switch input:checked + .track {\n  background: ${this.accent()};\n}\n` +
        `.fancy-switch input:checked + .track .knob {\n  transform: translateX(${travel}px);\n}\n` +
        `.fancy-switch input:focus-visible + .track {\n  outline: 2px solid ${this.accent()};\n  outline-offset: 2px;\n}`
      );
    }
    const radius = Math.round((s * this.cornerPct()) / 100);
    const markW = Math.max(2, Math.round(s * 0.24));
    const markH = Math.max(4, Math.round(s * 0.44));
    const tick = Math.max(2, bw);
    return (
      `.fancy-check {\n  display: inline-flex;\n  align-items: center;\n  gap: 10px;\n  cursor: pointer;\n  user-select: none;\n}\n` +
      `.fancy-check input {\n  position: absolute;\n  opacity: 0;\n  width: 1px;\n  height: 1px;\n}\n` +
      `.fancy-check .box {\n  width: ${s}px;\n  height: ${s}px;\n  border: ${bw}px solid ${this.borderColor()};\n  border-radius: ${radius}px;\n  display: inline-grid;\n  place-items: center;\n  background: #ffffff;\n  transition: background 0.15s ease, border-color 0.15s ease;\n  flex: none;\n}\n` +
      `.fancy-check .box::after {\n  content: "";\n  width: ${markW}px;\n  height: ${markH}px;\n  border: solid #ffffff;\n  border-width: 0 ${tick}px ${tick}px 0;\n  transform: rotate(45deg) translate(-1px, -1px);\n  opacity: 0;\n  transition: opacity 0.15s ease;\n}\n` +
      `.fancy-check input:checked + .box {\n  background: ${this.accent()};\n  border-color: ${this.accent()};\n}\n` +
      `.fancy-check input:checked + .box::after {\n  opacity: 1;\n}\n` +
      `.fancy-check input:focus-visible + .box {\n  outline: 2px solid ${this.accent()};\n  outline-offset: 2px;\n}`
    );
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

  setStyle(v: 'checkbox' | 'switch') {
    this.style.set(v);
    this.copiedCss.set(false);
    this.copiedHtml.set(false);
  }
  setSize(v: number) { this.size.set(this.clampNum(v, 14, 48)); }
  setBorderWidth(v: number) { this.borderWidth.set(this.clampNum(v, 1, 6)); }
  setCornerPct(v: number) { this.cornerPct.set(this.clampNum(v, 0, 50)); }

  async copyHtml() {
    try {
      await navigator.clipboard.writeText(this.htmlCode()).catch(() => undefined);
      this.copiedHtml.set(true);
      window.setTimeout(() => this.copiedHtml.set(false), 2000);
    } catch { /* clipboard unavailable */ }
  }
  async copyCss() {
    try {
      await navigator.clipboard.writeText(this.cssCode()).catch(() => undefined);
      this.copiedCss.set(true);
      window.setTimeout(() => this.copiedCss.set(false), 2000);
    } catch { /* clipboard unavailable */ }
  }

  downloadBundle() {
    const bundle = `<!-- HTML -->\n${this.htmlCode()}\n\n/* CSS */\n${this.cssCode()}\n`;
    const blob = new Blob([bundle], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'styled-checkbox.txt';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
