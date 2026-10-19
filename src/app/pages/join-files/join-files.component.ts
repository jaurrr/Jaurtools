import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface Part {
  name: string;
  size: number;
  data: Uint8Array;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const r = v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${r} ${units[i]}`;
}

@Component({
  selector: 'app-join-files',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './join-files.component.html',
  styleUrl: './join-files.component.scss',
})
export class JoinFilesComponent implements OnDestroy {
  readonly slug = 'join-files';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['create-zip', 'split-csv', 'csv-to-excel'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly parts = signal<Part[]>([]);
  readonly outName = signal('joined.bin');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly doneInfo = signal('');

  readonly totalSize = computed(() => this.parts().reduce((a, p) => a + p.size, 0));
  readonly totalSizeLabel = computed(() => formatBytes(this.totalSize()));
  readonly canJoin = computed(
    () => this.parts().length >= 2 && !this.busy() && this.outName().trim().length > 0
  );

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
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

  setOutName(v: string): void {
    this.outName.set(v.slice(0, 120));
  }
  fmt(n: number): string {
    return formatBytes(n);
  }

  async onFiles(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = '';
    this.error.set('');
    const MAX_TOTAL = 500 * 1024 * 1024;
    const current = [...this.parts()];
    let total = this.totalSize();
    for (const f of picked) {
      if (total + f.size > MAX_TOTAL) {
        this.error.set(this.t('labels.errorTooBig'));
        break;
      }
      const data = new Uint8Array(await f.arrayBuffer());
      current.push({ name: f.name, size: f.size, data });
      total += f.size;
    }
    this.parts.set(current);
  }

  move(i: number, dir: -1 | 1): void {
    const arr = [...this.parts()];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    this.parts.set(arr);
  }

  removePart(i: number): void {
    this.parts.set(this.parts().filter((_, idx) => idx !== i));
  }

  clearAll(): void {
    this.parts.set([]);
    this.doneInfo.set('');
    this.error.set('');
  }

  join(): void {
    if (!this.canJoin()) return;
    this.busy.set(true);
    this.error.set('');
    this.doneInfo.set('');
    try {
      const total = this.totalSize();
      const out = new Uint8Array(total);
      let off = 0;
      for (const p of this.parts()) {
        out.set(p.data, off);
        off += p.data.length;
      }
      const base = this.outName().trim().replace(/[\\/:*?"<>|]/g, '_') || 'joined.bin';
      downloadBlob(new Blob([out as unknown as BlobPart], { type: 'application/octet-stream' }), base);
      this.doneInfo.set(
        this.t('labels.done')
          .replace('{n}', String(this.parts().length))
          .replace('{s}', formatBytes(total))
      );
    } catch {
      this.error.set(this.t('labels.errorJoin'));
    } finally {
      this.busy.set(false);
    }
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
