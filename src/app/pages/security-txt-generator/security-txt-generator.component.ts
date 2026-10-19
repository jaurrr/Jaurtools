import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-security-txt-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './security-txt-generator.component.html',
  styleUrl: './security-txt-generator.component.scss',
})
export class SecurityTxtGeneratorComponent implements OnDestroy {
  readonly slug = 'security-txt-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['llms-txt-generator', 'permissions-policy-generator', 'web-app-manifest-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly contacts = signal('');
  readonly expires = signal('');
  readonly encryption = signal('');
  readonly acknowledgments = signal('');
  readonly policy = signal('');
  readonly hiring = signal('');
  readonly canonical = signal('');
  readonly languages = signal('');
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

  private isEmail(v: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  }

  private isUrl(v: string): boolean {
    return /^https:\/\/[^\s/$.?#].[^\s]*$/i.test(v);
  }

  readonly contactLines = computed(() =>
    this.contacts()
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  );

  readonly validContacts = computed(() =>
    this.contactLines().filter((c) => this.isEmail(c) || /^https?:\/\//i.test(c) || /^tel:/i.test(c))
  );

  readonly formattedExpires = computed((): string | null => {
    const d = this.expires().trim();
    if (!d) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    const dt = new Date(d + 'T23:59:59Z');
    return Number.isNaN(dt.getTime()) ? null : `${d}T23:59:59Z`;
  });

  readonly output = computed(() => {
    const lines: string[] = [];
    for (const c of this.validContacts()) {
      lines.push(`Contact: ${this.isEmail(c) ? 'mailto:' + c : c}`);
    }
    const exp = this.formattedExpires();
    if (exp) lines.push(`Expires: ${exp}`);
    const enc = this.encryption().trim();
    if (enc && (this.isUrl(enc) || /^openpgp4fpr:[0-9a-fA-F]+$/.test(enc))) lines.push(`Encryption: ${enc}`);
    const ack = this.acknowledgments().trim();
    if (ack && this.isUrl(ack)) lines.push(`Acknowledgments: ${ack}`);
    const pol = this.policy().trim();
    if (pol && this.isUrl(pol)) lines.push(`Policy: ${pol}`);
    const hir = this.hiring().trim();
    if (hir && this.isUrl(hir)) lines.push(`Hiring: ${hir}`);
    const can = this.canonical().trim();
    if (can && this.isUrl(can)) lines.push(`Canonical: ${can}`);
    const lang = this.languages()
      .split(/[,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .join(', ');
    if (lang) lines.push(`Preferred-Languages: ${lang}`);
    return lines.join('\n') + '\n';
  });

  readonly warnings = computed(() => {
    const w: string[] = [];
    if (this.validContacts().length === 0) w.push('warnNoContact');
    else if (this.validContacts().length < this.contactLines().length) w.push('warnInvalidContact');
    if (this.expires().trim() && !this.formattedExpires()) w.push('warnExpiresInvalid');
    const exp = this.formattedExpires();
    if (exp && new Date(exp).getTime() < Date.now()) w.push('warnExpiresPast');
    for (const [v, ok] of [
      [this.encryption().trim(), this.isUrl(this.encryption().trim()) || /^openpgp4fpr:[0-9a-fA-F]+$/.test(this.encryption().trim())],
      [this.acknowledgments().trim(), this.isUrl(this.acknowledgments().trim())],
      [this.policy().trim(), this.isUrl(this.policy().trim())],
      [this.hiring().trim(), this.isUrl(this.hiring().trim())],
      [this.canonical().trim(), this.isUrl(this.canonical().trim())],
    ] as [string, boolean][]) {
      if (v && !ok) {
        w.push('warnInvalidUrl');
        break;
      }
    }
    return w;
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

  setContacts(v: string) { this.contacts.set(v); }
  setExpires(v: string) { this.expires.set(v); }
  setEncryption(v: string) { this.encryption.set(v); }
  setAcknowledgments(v: string) { this.acknowledgments.set(v); }
  setPolicy(v: string) { this.policy.set(v); }
  setHiring(v: string) { this.hiring.set(v); }
  setCanonical(v: string) { this.canonical.set(v); }
  setLanguages(v: string) { this.languages.set(v); }

  copyOutput() {
    const text = this.output();
    const done = () => {
      this.copied.set(true);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
    };
    const clipboard = (navigator as Navigator & { clipboard?: Clipboard }).clipboard;
    if (clipboard?.writeText) {
      clipboard.writeText(text).then(done).catch(() => this.legacyCopy(text, done));
    } else {
      this.legacyCopy(text, done);
    }
  }

  private legacyCopy(text: string, done: () => void) {
    const ta = this.document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    this.document.body.appendChild(ta);
    ta.select();
    try {
      this.document.execCommand('copy');
      done();
    } catch {
      /* clipboard unavailable */
    }
    ta.remove();
  }

  downloadFile() {
    const blob = new Blob([this.output()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'security.txt';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
