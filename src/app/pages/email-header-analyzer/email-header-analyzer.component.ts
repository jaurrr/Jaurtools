import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface Hop {
  from: string;
  by: string;
  ip: string;
  date: string;
}

interface AuthCheck {
  type: string;
  result: string;
  detail: string;
}

@Component({
  selector: 'app-email-header-analyzer',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './email-header-analyzer.component.html',
  styleUrl: './email-header-analyzer.component.scss',
})
export class EmailHeaderAnalyzerComponent implements OnDestroy {
  readonly slug = 'email-header-analyzer';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['dmarc-xml-report-analyzer', 'dmarc-record-generator', 'spf-record-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly rawInput = signal('');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly headers = computed((): { name: string; value: string }[] => {
    const out: { name: string; value: string }[] = [];
    let current: { name: string; value: string } | null = null;
    for (const line of this.rawInput().split(/\r?\n/)) {
      if (!line.trim()) break;
      if (/^[ \t]/.test(line) && current) {
        current.value += ' ' + line.trim();
        continue;
      }
      const idx = line.indexOf(':');
      if (idx > 0) {
        current = { name: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
        out.push(current);
      }
    }
    return out;
  });

  private get(name: string): string {
    const h = this.headers().find((x) => x.name.toLowerCase() === name.toLowerCase());
    return h ? h.value : '';
  }

  readonly hops = computed((): Hop[] => {
    return this.headers()
      .filter((h) => h.name.toLowerCase() === 'received')
      .map((h) => {
        const v = h.value;
        const from = /from\s+([^\s(;]+)/i.exec(v)?.[1] ?? '';
        const by = /by\s+([^\s(;]+)/i.exec(v)?.[1] ?? '';
        const ip = /\[((?:\d{1,3}\.){3}\d{1,3}|[0-9a-fA-F:]{2,})\]/.exec(v)?.[1] ?? '';
        const date = v.includes(';') ? v.slice(v.lastIndexOf(';') + 1).trim() : '';
        return { from, by, ip, date };
      });
  });

  readonly authChecks = computed((): AuthCheck[] => {
    const out: AuthCheck[] = [];
    for (const h of this.headers().filter((x) => x.name.toLowerCase() === 'authentication-results')) {
      const parts = h.value.split(';');
      for (let i = 1; i < parts.length; i++) {
        const m = /^\s*(spf|dkim|dmarc|arc|compauth)\s*=\s*([a-zA-Z]+)\b/.exec(parts[i]);
        if (m) out.push({ type: m[1].toLowerCase(), result: m[2].toLowerCase(), detail: parts[i].trim() });
      }
    }
    return out;
  });

  readonly dkimDomain = computed(() => {
    const sig = this.get('dkim-signature');
    const d = /[;\s]d=([^;\s]+)/i.exec(sig)?.[1] ?? '';
    const s = /[;\s]s=([^;\s]+)/i.exec(sig)?.[1] ?? '';
    return { d, s };
  });

  readonly summary = computed(() => ({
    from: this.get('from'),
    to: this.get('to'),
    subject: this.get('subject'),
    date: this.get('date'),
    messageId: this.get('message-id'),
    returnPath: this.get('return-path'),
    xMailer: this.get('x-mailer') || this.get('user-agent'),
    hopCount: this.hops().length,
  }));

  readonly hasInput = computed(() => this.headers().length > 0);

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

  setRaw(v: string) { this.rawInput.set(v); }
  clearInput() { this.rawInput.set(''); }

  ngOnDestroy() {
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
