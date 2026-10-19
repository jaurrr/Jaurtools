import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface DmarcRecord {
  sourceIp: string;
  count: number;
  disposition: string;
  dkim: string;
  spf: string;
  headerFrom: string;
  dkimDomain: string;
  dkimSelector: string;
  spfDomain: string;
}

interface ParsedReport {
  orgName: string;
  reportId: string;
  begin: string;
  end: string;
  domain: string;
  adkim: string;
  aspf: string;
  p: string;
  sp: string;
  pct: string;
  records: DmarcRecord[];
}

@Component({
  selector: 'app-dmarc-xml-report-analyzer',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './dmarc-xml-report-analyzer.component.html',
  styleUrl: './dmarc-xml-report-analyzer.component.scss',
})
export class DmarcXmlReportAnalyzerComponent implements OnDestroy {
  readonly slug = 'dmarc-xml-report-analyzer';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['dmarc-record-generator', 'spf-record-generator', 'email-header-analyzer'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly xmlInput = signal('');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private textOf(parent: Element | Document, tag: string): string {
    const els = parent.getElementsByTagName(tag);
    return els.length > 0 ? (els[0].textContent ?? '').trim() : '';
  }

  private first(parent: Element, tag: string): Element | null {
    const els = parent.getElementsByTagName(tag);
    return els.length > 0 ? els[0] : null;
  }

  private fmtDate(epochSec: string): string {
    const n = Number(epochSec);
    if (!Number.isFinite(n) || n <= 0) return epochSec;
    return new Date(n * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  }

  readonly parsed = computed((): { ok: true; report: ParsedReport } | { ok: false } | null => {
    const xml = this.xmlInput().trim();
    if (!xml) return null;
    let doc: Document;
    try {
      doc = new DOMParser().parseFromString(xml, 'text/xml');
    } catch {
      return { ok: false };
    }
    if (doc.getElementsByTagName('parsererror').length > 0) return { ok: false };
    if (doc.getElementsByTagName('feedback').length === 0 && doc.getElementsByTagName('report_metadata').length === 0) {
      return { ok: false };
    }
    const records: DmarcRecord[] = [];
    const recEls = doc.getElementsByTagName('record');
    for (let i = 0; i < recEls.length; i++) {
      const rec = recEls[i];
      const row = this.first(rec, 'row');
      const pol = row ? this.first(row, 'policy_evaluated') : null;
      const ids = this.first(rec, 'identifiers');
      const auth = this.first(rec, 'auth_results');
      const dkimEl = auth ? this.first(auth, 'dkim') : null;
      const spfEl = auth ? this.first(auth, 'spf') : null;
      records.push({
        sourceIp: row ? this.textOf(row, 'source_ip') : '',
        count: row ? Number(this.textOf(row, 'count')) || 0 : 0,
        disposition: pol ? this.textOf(pol, 'disposition') : '',
        dkim: pol ? this.textOf(pol, 'dkim') : '',
        spf: pol ? this.textOf(pol, 'spf') : '',
        headerFrom: ids ? this.textOf(ids, 'header_from') : '',
        dkimDomain: dkimEl ? this.textOf(dkimEl, 'domain') : '',
        dkimSelector: dkimEl ? this.textOf(dkimEl, 'selector') : '',
        spfDomain: spfEl ? this.textOf(spfEl, 'domain') : '',
      });
    }
    records.sort((a, b) => b.count - a.count);
    const report: ParsedReport = {
      orgName: this.textOf(doc, 'org_name'),
      reportId: this.textOf(doc, 'report_id'),
      begin: this.fmtDate(this.textOf(doc, 'begin')),
      end: this.fmtDate(this.textOf(doc, 'end')),
      domain: this.textOf(doc, 'policy_published') ? this.textOf(doc.getElementsByTagName('policy_published')[0], 'domain') : '',
      adkim: this.textOf(doc, 'adkim'),
      aspf: this.textOf(doc, 'aspf'),
      p: this.textOf(doc, 'p'),
      sp: this.textOf(doc, 'sp'),
      pct: this.textOf(doc, 'pct'),
      records,
    };
    return { ok: true, report };
  });

  readonly summary = computed(() => {
    const p = this.parsed();
    if (!p || !p.ok) return null;
    const records = p.report.records;
    const total = records.reduce((s, r) => s + r.count, 0);
    const passBoth = records
      .filter((r) => r.disposition === 'none' && r.dkim === 'pass' && r.spf === 'pass')
      .reduce((s, r) => s + r.count, 0);
    const acted = records
      .filter((r) => r.disposition === 'quarantine' || r.disposition === 'reject')
      .reduce((s, r) => s + r.count, 0);
    const ips = new Set(records.map((r) => r.sourceIp).filter(Boolean));
    return {
      total,
      passBoth,
      acted,
      passRate: total > 0 ? (passBoth / total) * 100 : 0,
      ipCount: ips.size,
    };
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

  setXml(v: string) { this.xmlInput.set(v); }

  clearInput() { this.xmlInput.set(''); }

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

  readonly oneDecimal = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  );

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
