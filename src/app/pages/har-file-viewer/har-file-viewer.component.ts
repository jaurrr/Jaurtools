import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface Phase {
  key: string;
  ms: number;
  offset: number;
}

interface HarEntry {
  method: string;
  host: string;
  path: string;
  status: number;
  mime: string;
  size: number;
  time: number;
  started: number;
  phases: Phase[];
  leftPct: number;
  widthPct: number;
}

const PHASE_KEYS = ['blocked', 'dns', 'connect', 'ssl', 'send', 'wait', 'receive'];
const PHASE_COLORS: Record<string, string> = {
  blocked: '#94a3b8',
  dns: '#f59e0b',
  connect: '#f97316',
  ssl: '#8b5cf6',
  send: '#06b6d4',
  wait: '#3b82f6',
  receive: '#22c55e',
};

@Component({
  selector: 'app-har-file-viewer',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './har-file-viewer.component.html',
  styleUrl: './har-file-viewer.component.scss',
})
export class HarFileViewerComponent implements OnDestroy {
  readonly slug = 'har-file-viewer';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['user-agent-parser', 'ssl-certificate-decoder', 'pwa-manifest-checker'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly harInput = signal('');
  readonly filter = signal('');
  readonly phaseColors = PHASE_COLORS;
  readonly phaseKeys = PHASE_KEYS;
  readonly round = Math.round;

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly parsed = computed((): { ok: true; entries: HarEntry[]; truncated: boolean } | { ok: false } | null => {
    const raw = this.harInput().trim();
    if (!raw) return null;
    try {
      const data = JSON.parse(raw) as { log?: { entries?: unknown[] } };
      const rawEntries = data?.log?.entries;
      if (!Array.isArray(rawEntries)) return { ok: false };
      const all: HarEntry[] = [];
      for (const e of rawEntries) {
        const entry = e as Record<string, unknown>;
        const req = (entry['request'] as Record<string, unknown>) ?? {};
        const res = (entry['response'] as Record<string, unknown>) ?? {};
        const timings = (entry['timings'] as Record<string, unknown>) ?? {};
        const url = typeof req['url'] === 'string' ? req['url'] : '';
        let host = url;
        let path = '';
        try {
          const u = new URL(url);
          host = u.hostname;
          path = u.pathname + u.search;
        } catch {
          /* keep raw */
        }
        const started = new Date(typeof entry['startedDateTime'] === 'string' ? entry['startedDateTime'] : 0).getTime();
        const time = typeof entry['time'] === 'number' && entry['time'] >= 0 ? entry['time'] : 0;
        const phases: Phase[] = [];
        let offset = 0;
        for (const key of PHASE_KEYS) {
          const v = timings[key];
          const ms = typeof v === 'number' && v > 0 ? Math.round(v) : 0;
          phases.push({ key, ms, offset });
          offset += ms;
        }
        const bodySize = typeof res['bodySize'] === 'number' ? res['bodySize'] : -1;
        const content = (res['content'] as Record<string, unknown>) ?? {};
        const contentSize = typeof content['size'] === 'number' ? content['size'] : 0;
        all.push({
          method: typeof req['method'] === 'string' ? req['method'] : '',
          host,
          path: path || '/',
          status: typeof res['status'] === 'number' ? res['status'] : 0,
          mime: typeof content['mimeType'] === 'string' ? (content['mimeType'] as string).split(';')[0] : '',
          size: Math.max(0, bodySize >= 0 ? bodySize : contentSize),
          time,
          started: Number.isFinite(started) ? started : 0,
          phases,
          leftPct: 0,
          widthPct: 0,
        });
      }
      all.sort((a, b) => a.started - b.started);
      const truncated = all.length > 500;
      const entries = (truncated ? all.slice(0, 500) : all).map((en) => ({ ...en }));
      if (entries.length > 0) {
        const min = Math.min(...entries.map((en) => en.started));
        const max = Math.max(...entries.map((en) => en.started + en.time));
        const span = Math.max(1, max - min);
        for (const en of entries) {
          en.leftPct = ((en.started - min) / span) * 100;
          en.widthPct = Math.max(0.5, (en.time / span) * 100);
        }
      }
      return { ok: true, entries, truncated };
    } catch {
      return { ok: false };
    }
  });

  readonly summary = computed(() => {
    const p = this.parsed();
    if (!p || !p.ok || p.entries.length === 0) return null;
    const entries = p.entries;
    const totalBytes = entries.reduce((s, e) => s + e.size, 0);
    const min = Math.min(...entries.map((e) => e.started));
    const max = Math.max(...entries.map((e) => e.started + e.time));
    const slowest = [...entries].sort((a, b) => b.time - a.time).slice(0, 5);
    return {
      total: entries.length,
      totalBytes,
      totalKb: totalBytes / 1024,
      totalTime: Math.round(max - min),
      slowest,
    };
  });

  segLeft(en: HarEntry, ph: Phase): number {
    const total = Math.max(1, en.time);
    return en.leftPct + (ph.offset / total) * en.widthPct;
  }

  segWidth(en: HarEntry, ph: Phase): number {
    const total = Math.max(1, en.time);
    return Math.max(0.4, (ph.ms / total) * en.widthPct);
  }

  segColor(key: string): string {
    return this.phaseColors[key] ?? '#94a3b8';
  }

  phaseLabel(key: string): string {
    const map: Record<string, string> = {
      blocked: 'phaseBlocked',
      dns: 'phaseDns',
      connect: 'phaseConnect',
      ssl: 'phaseSsl',
      send: 'phaseSend',
      wait: 'phaseWait',
      receive: 'phaseReceive',
    };
    return this.t('labels.' + (map[key] ?? key));
  }

  shortMime(en: HarEntry): string {
    const m = en.mime.toLowerCase();
    if (m.includes('html')) return 'document';
    if (m.startsWith('image/')) return 'image';
    if (m.includes('javascript')) return 'script';
    if (m.includes('css')) return 'stylesheet';
    if (m.includes('font')) return 'font';
    if (m.includes('json') || m.includes('xml')) return 'xhr';
    return m ? m.split('/')[1] || 'other' : 'other';
  }

  readonly filtered = computed(() => {
    const p = this.parsed();
    if (!p || !p.ok) return [] as HarEntry[];
    const q = this.filter().trim().toLowerCase();
    if (!q) return p.entries;
    return p.entries.filter((e) =>
      `${e.method} ${e.host}${e.path} ${e.status} ${e.mime}`.toLowerCase().includes(q)
    );
  });

  setFilter(v: string) { this.filter.set(v); }

  onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') this.harInput.set(reader.result);
    };
    reader.readAsText(file);
  }

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

  setHar(v: string) { this.harInput.set(v); }
  clearInput() { this.harInput.set(''); }

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }

  readonly oneDecimal = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  );

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
