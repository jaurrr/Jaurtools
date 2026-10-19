import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type SwitchShape = 'pill' | 'rounded';

@Component({
  selector: 'app-css-switch-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './css-switch-generator.component.html',
  styleUrl: './css-switch-generator.component.scss',
})
export class CssSwitchGeneratorComponent implements OnDestroy {
  readonly slug = 'css-switch-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['css-loader-generator', 'css-text-glitch-generator', 'flexbox-playground'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly width = signal(64);
  readonly onColor = signal('#4f46e5');
  readonly shape = signal<SwitchShape>('pill');
  readonly checked = signal(false);
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

  readonly dims = computed(() => {
    const w = this.width();
    const h = Math.round(w * 0.55);
    const pad = 4;
    const knob = h - pad * 2;
    return { w, h, pad, knob, travel: w - knob - pad * 2 };
  });

  readonly css = computed(() => {
    const d = this.dims();
    const color = this.safeColor(this.onColor());
    const radius = this.shape() === 'pill' ? '999px' : `${Math.round(d.h / 4)}px`;
    return `.css-switch {\n  position: relative;\n  display: inline-block;\n  width: ${d.w}px;\n  height: ${d.h}px;\n}\n\n.css-switch input {\n  opacity: 0;\n  width: 0;\n  height: 0;\n}\n\n.css-switch .track {\n  position: absolute;\n  inset: 0;\n  background: #cbd5e1;\n  border-radius: ${radius};\n  transition: background 0.25s;\n  cursor: pointer;\n}\n\n.css-switch .track::before {\n  content: "";\n  position: absolute;\n  height: ${d.knob}px;\n  width: ${d.knob}px;\n  left: ${d.pad}px;\n  top: ${d.pad}px;\n  background: #ffffff;\n  border-radius: 50%;\n  transition: transform 0.25s;\n}\n\n.css-switch input:checked + .track {\n  background: ${color};\n}\n\n.css-switch input:checked + .track::before {\n  transform: translateX(${d.travel}px);\n}\n\n.css-switch input:focus-visible + .track {\n  outline: 2px solid ${color};\n  outline-offset: 2px;\n}`;
  });

  readonly html = computed(() =>
    '<label class="css-switch">\n  <input type="checkbox">\n  <span class="track"></span>\n</label>'
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

  setWidth(v: number) { this.width.set(this.clampNum(v, 40, 120)); }
  setOnColor(v: string) { this.onColor.set(this.safeColor(v)); }
  setShape(v: SwitchShape) { this.shape.set(v); }
  toggleChecked() { this.checked.update((c) => !c); }

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
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v : '#4f46e5';
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
