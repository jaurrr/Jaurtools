import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface LlmsLink {
  section: string;
  title: string;
  url: string;
  desc: string;
}

@Component({
  selector: 'app-llms-txt-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './llms-txt-generator.component.html',
  styleUrl: './llms-txt-generator.component.scss',
})
export class LlmsTxtGeneratorComponent implements OnDestroy {
  readonly slug = 'llms-txt-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['security-txt-generator', 'web-app-manifest-generator', 'schema-markup-validator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly siteName = signal('');
  readonly siteUrl = signal('');
  readonly summary = signal('');
  readonly contact = signal('');
  readonly links = signal<LlmsLink[]>([{ section: '', title: '', url: '', desc: '' }]);
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

  private validUrl(v: string): boolean {
    return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(v.trim());
  }

  readonly linkIssues = computed(() => {
    const issues: number[] = [];
    this.links().forEach((l, i) => {
      if ((l.title.trim() || l.url.trim()) && (!l.title.trim() || !this.validUrl(l.url))) issues.push(i);
    });
    return issues;
  });

  readonly output = computed(() => {
    const name = this.siteName().trim() || 'Site Name';
    const lines: string[] = [`# ${name}`, ''];
    const sum = this.summary().trim();
    if (sum) lines.push(`> ${sum}`, '');
    const contact = this.contact().trim();
    if (contact) lines.push(`${contact}`, '');
    const sections: string[] = [];
    const bySection = new Map<string, LlmsLink[]>();
    for (const l of this.links()) {
      if (!l.title.trim() || !this.validUrl(l.url)) continue;
      const sec = l.section.trim() || 'Links';
      if (!bySection.has(sec)) {
        bySection.set(sec, []);
        sections.push(sec);
      }
      bySection.get(sec)!.push(l);
    }
    for (const sec of sections) {
      lines.push(`## ${sec}`, '');
      for (const l of bySection.get(sec)!) {
        const desc = l.desc.trim() ? `: ${l.desc.trim()}` : '';
        lines.push(`- [${l.title.trim()}](${l.url.trim()})${desc}`);
      }
      lines.push('');
    }
    return lines.join('\n').trimEnd() + '\n';
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

  setSiteName(v: string) { this.siteName.set(v); }
  setSiteUrl(v: string) { this.siteUrl.set(v); }
  setSummary(v: string) { this.summary.set(v); }
  setContact(v: string) { this.contact.set(v); }

  setLinkField(i: number, field: keyof LlmsLink, v: string) {
    this.links.update((arr) => arr.map((l, idx) => (idx === i ? { ...l, [field]: v } : l)));
  }

  addLink() {
    this.links.update((arr) => [...arr, { section: '', title: '', url: '', desc: '' }]);
  }

  removeLink(i: number) {
    this.links.update((arr) => arr.filter((_, idx) => idx !== i));
  }

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
    a.download = 'llms.txt';
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
