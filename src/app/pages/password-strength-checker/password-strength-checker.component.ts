import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-password-strength-checker',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './password-strength-checker.component.html',
  styleUrl: './password-strength-checker.component.scss',
})
export class PasswordStrengthCheckerComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.t('tiers.' + this.tier()));
  copyMain(): void {
    const text = this.copyText();
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

  readonly slug = 'password-strength-checker';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['password-generator', 'passphrase-generator', 'hash-generator', 'random-password-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly password = signal('');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly analysis = computed(() => {
    const pw = this.password();
    const len = pw.length;
    const hasLower = /[a-z]/.test(pw);
    const hasUpper = /[A-Z]/.test(pw);
    const hasDigit = /[0-9]/.test(pw);
    const hasSymbol = /[^a-zA-Z0-9]/.test(pw);
    let charset = 0;
    if (hasLower) charset += 26;
    if (hasUpper) charset += 26;
    if (hasDigit) charset += 10;
    if (hasSymbol) charset += 32;
    const bits = charset > 0 ? len * (Math.log(charset) / Math.log(2)) : 0;
    return { len, hasLower, hasUpper, hasDigit, hasSymbol, charset, bits };
  });

  readonly tier = computed((): string => {
    const bits = this.analysis().bits;
    if (this.password().length === 0) return 'none';
    if (bits < 40) return 'very-weak';
    if (bits < 60) return 'weak';
    if (bits < 80) return 'good';
    if (bits < 100) return 'strong';
    return 'excellent';
  });

  readonly crackTime = computed((): string => {
    const bits = this.analysis().bits;
    if (bits <= 0) return '';
    const seconds = Math.pow(2, bits) / 1e10;
    const units: [number, string][] = [
      [31557600, 'years'], [86400, 'days'], [3600, 'hours'], [60, 'minutes'],
    ];
    for (const [div, name] of units) {
      if (seconds >= div) {
        const v = seconds / div;
        const rounded = v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
        const label = this.t(`time.${name}`);
        const unit = name === 'years' && rounded >= 1e6 ? this.t('time.millionYears') : label;
        const display = name === 'years' && rounded >= 1e6
          ? new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 1 }).format(rounded / 1e6)
          : new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 1 }).format(rounded);
        return `${display} ${unit}`;
      }
    }
    return `< 1 ${this.t('time.minute')}`;
  });

  readonly checks = computed(() => {
    const a = this.analysis();
    return [
      { key: 'length12', ok: a.len >= 12 },
      { key: 'length16', ok: a.len >= 16 },
      { key: 'lower', ok: a.hasLower },
      { key: 'upper', ok: a.hasUpper },
      { key: 'digit', ok: a.hasDigit },
      { key: 'symbol', ok: a.hasSymbol },
    ];
  });

  readonly oneDecimal = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
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

  setPassword(v: string) { this.password.set(v); }

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
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
