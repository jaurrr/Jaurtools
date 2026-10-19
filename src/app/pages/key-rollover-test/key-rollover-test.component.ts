import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-key-rollover-test',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './key-rollover-test.component.html',
  styleUrl: './key-rollover-test.component.scss',
})
export class KeyRolloverTestComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.heldKeys().length);
  copyMain(): void {
    const text = String(this.copyText());
    const done = () => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1600);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, () => done());
    } else {
      done();
    }
  }

  readonly slug = 'key-rollover-test';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['keyboard-tester', 'mouse-tester', 'touchscreen-test', 'gamepad-tester'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly heldKeys = signal<string[]>([]);
  readonly maxSimultaneous = signal(0);

  private jsonLdEl: HTMLScriptElement | null = null;
  private readonly onBlur = () => this.heldKeys.set([]);

  constructor() {
    window.addEventListener('blur', this.onBlur);
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly verdict = computed(() => {
    const m = this.maxSimultaneous();
    if (m >= 10) return 'excellent';
    if (m >= 6) return 'standard';
    if (m >= 3) return 'basic';
    return 'low';
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

  focusArea(el: HTMLElement) {
    el.focus();
  }

  onKeyDown(e: KeyboardEvent) {
    if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    if (e.repeat) return;
    if (!this.heldKeys().includes(e.code)) {
      const next = [...this.heldKeys(), e.code];
      this.heldKeys.set(next);
      if (next.length > this.maxSimultaneous()) this.maxSimultaneous.set(next.length);
    }
  }

  onKeyUp(e: KeyboardEvent) {
    this.heldKeys.set(this.heldKeys().filter((c) => c !== e.code));
  }

  releaseAll() {
    this.heldKeys.set([]);
  }

  resetAll() {
    this.heldKeys.set([]);
    this.maxSimultaneous.set(0);
  }

  ngOnDestroy() {
    window.removeEventListener('blur', this.onBlur);
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
