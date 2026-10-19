import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-css-text-glitch-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './css-text-glitch-generator.component.html',
  styleUrl: './css-text-glitch-generator.component.scss',
})
export class CssTextGlitchGeneratorComponent implements OnDestroy {
  readonly slug = 'css-text-glitch-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['css-loader-generator', 'css-switch-generator', 'flexbox-playground'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly text = signal('GLITCH');
  readonly baseColor = signal('#0f172a');
  readonly color1 = signal('#ff005e');
  readonly color2 = signal('#00d4ff');
  readonly fontSize = signal(48);
  readonly speed = signal(2);
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly safeText = computed(() => {
    const v = this.text().trim();
    return v.length > 0 ? v.slice(0, 30) : 'GLITCH';
  });

  readonly glitchOffset = computed(() => Math.max(1, Math.round(this.fontSize() / 24)));

  readonly css = computed(() => {
    const base = this.safeColor(this.baseColor());
    const c1 = this.safeColor(this.color1());
    const c2 = this.safeColor(this.color2());
    const fs = this.fontSize();
    const speed = this.speed();
    const off = Math.max(1, Math.round(fs / 24));
    return `.glitch-text {\n  position: relative;\n  display: inline-block;\n  font-size: ${fs}px;\n  font-weight: 800;\n  letter-spacing: 0.05em;\n  color: ${base};\n}\n\n.glitch-text::before,\n.glitch-text::after {\n  content: attr(data-text);\n  position: absolute;\n  inset: 0;\n  overflow: hidden;\n}\n\n.glitch-text::before {\n  color: ${c1};\n  z-index: -1;\n  animation: glitch-shift-1 ${speed}s infinite linear alternate-reverse;\n}\n\n.glitch-text::after {\n  color: ${c2};\n  z-index: -2;\n  animation: glitch-shift-2 ${speed}s infinite linear alternate-reverse;\n}\n\n@keyframes glitch-shift-1 {\n  0% { clip-path: inset(20% 0 70% 0); transform: translate(-${off}px, -${off}px); }\n  20% { clip-path: inset(60% 0 10% 0); transform: translate(${off}px, ${off}px); }\n  40% { clip-path: inset(10% 0 80% 0); transform: translate(-${off}px, ${off}px); }\n  60% { clip-path: inset(80% 0 5% 0); transform: translate(${off}px, -${off}px); }\n  80% { clip-path: inset(40% 0 40% 0); transform: translate(-${off}px, 0); }\n  100% { clip-path: inset(5% 0 85% 0); transform: translate(${off}px, ${off}px); }\n}\n\n@keyframes glitch-shift-2 {\n  0% { clip-path: inset(70% 0 20% 0); transform: translate(${off}px, ${off}px); }\n  20% { clip-path: inset(10% 0 60% 0); transform: translate(-${off}px, -${off}px); }\n  40% { clip-path: inset(80% 0 10% 0); transform: translate(${off}px, -${off}px); }\n  60% { clip-path: inset(5% 0 80% 0); transform: translate(-${off}px, ${off}px); }\n  80% { clip-path: inset(45% 0 35% 0); transform: translate(${off}px, 0); }\n  100% { clip-path: inset(85% 0 5% 0); transform: translate(-${off}px, -${off}px); }\n}`;
  });

  readonly html = computed(() => {
    const t = this.escapeHtml(this.safeText());
    return `<div class="glitch-text" data-text="${t}">${t}</div>`;
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

  setText(v: string) { this.text.set(v.slice(0, 30)); }
  setBaseColor(v: string) { this.baseColor.set(this.safeColor(v)); }
  setColor1(v: string) { this.color1.set(this.safeColor(v)); }
  setColor2(v: string) { this.color2.set(this.safeColor(v)); }
  setFontSize(v: number) { this.fontSize.set(this.clampNum(v, 24, 96)); }
  setSpeed(v: number) { this.speed.set(this.clampNum(v, 0.5, 4)); }

  copyText(text: string) {
    const done = () => {
      this.copied.set(true);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => this.legacyCopy(text, done));
    } else {
      this.legacyCopy(text, done);
    }
  }

  ngOnDestroy() {
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private legacyCopy(text: string, done: () => void) {
    const ta = this.document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    this.document.body.appendChild(ta);
    ta.select();
    try { this.document.execCommand('copy'); } catch { /* clipboard unavailable */ }
    ta.remove();
    done();
  }

  private safeColor(v: string): string {
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v : '#0f172a';
  }

  private escapeHtml(v: string): string {
    return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }

  private clampNum(v: number, min: number, max: number): number {
    if (!Number.isFinite(v)) return min;
    return Math.min(max, Math.max(min, Math.round(v * 100) / 100));
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
