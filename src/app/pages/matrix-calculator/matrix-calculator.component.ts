import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type MatrixOp = 'add' | 'subtract' | 'multiply' | 'determinant' | 'inverse';

@Component({
  selector: 'app-matrix-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './matrix-calculator.component.html',
  styleUrl: './matrix-calculator.component.scss',
})
export class MatrixCalculatorComponent implements OnDestroy {
  readonly slug = 'matrix-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['log-calculator', 'long-division-calculator', 'fraction-calculator', 'number-base-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly ops: MatrixOp[] = ['add', 'subtract', 'multiply', 'determinant', 'inverse'];
  readonly size = signal<2 | 3>(2);
  readonly op = signal<MatrixOp>('multiply');
  readonly aVals = signal<number[]>([1, 2, 3, 4, 0, 0, 0, 0, 0]);
  readonly bVals = signal<number[]>([5, 6, 7, 8, 0, 0, 0, 0, 0]);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang(); // re-run on language change
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly needsB = computed(() => this.op() === 'add' || this.op() === 'subtract' || this.op() === 'multiply');

  private mat(v: number[], n: number): number[][] {
    const m: number[][] = [];
    for (let r = 0; r < n; r++) m.push(v.slice(r * 3, r * 3 + n));
    return m;
  }

  private fmt(v: number): string {
    if (!Number.isFinite(v)) return '—';
    const r = Math.round(v * 10000) / 10000;
    return new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 4 }).format(r);
  }

  readonly resultText = computed(() => {
    this.translate.lang();
    const n = this.size();
    const A = this.mat(this.aVals(), n);
    const B = this.mat(this.bVals(), n);
    const op = this.op();
    const L = (k: string) => {
      const raw = (this.translate.t as unknown as (x: string) => unknown)(`${this.slug}.labels.${k}`);
      return typeof raw === 'string' ? raw : k;
    };
    const show = (m: number[][]) => m.map((row) => '[ ' + row.map((v) => this.fmt(v)).join('  ') + ' ]').join('\n');
    if (op === 'add' || op === 'subtract') {
      const s = op === 'add' ? 1 : -1;
      return show(A.map((row, r) => row.map((v, c) => v + s * B[r][c])));
    }
    if (op === 'multiply') {
      const C: number[][] = [];
      for (let r = 0; r < n; r++) {
        C.push([]);
        for (let c = 0; c < n; c++) {
          let sum = 0;
          for (let k = 0; k < n; k++) sum += A[r][k] * B[k][c];
          C[r].push(sum);
        }
      }
      return show(C);
    }
    const det = this.detOf(A);
    if (op === 'determinant') return `det(A) = ${this.fmt(det)}`;
    if (Math.abs(det) < 1e-10) return L('singularError');
    const inv = this.inverseOf(A);
    return inv ? show(inv) : L('singularError');
  });

  private detOf(m: number[][]): number {
    const n = m.length;
    if (n === 2) return m[0][0] * m[1][1] - m[0][1] * m[1][0];
    let d = 0;
    for (let c = 0; c < 3; c++) {
      const minor = [
        [m[1][(c + 1) % 3], m[1][(c + 2) % 3]],
        [m[2][(c + 1) % 3], m[2][(c + 2) % 3]],
      ];
      d += (c % 2 === 0 ? 1 : -1) * m[0][c] * this.detOf(minor);
    }
    return d;
  }

  private inverseOf(m: number[][]): number[][] | null {
    const n = m.length;
    const aug = m.map((row, r) => [...row, ...Array.from({ length: n }, (_, c) => (r === c ? 1 : 0))]);
    for (let col = 0; col < n; col++) {
      let pivot = col;
      for (let r = col + 1; r < n; r++) {
        if (Math.abs(aug[r][col]) > Math.abs(aug[pivot][col])) pivot = r;
      }
      if (Math.abs(aug[pivot][col]) < 1e-10) return null;
      [aug[col], aug[pivot]] = [aug[pivot], aug[col]];
      const div = aug[col][col];
      for (let c = 0; c < 2 * n; c++) aug[col][c] /= div;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = aug[r][col];
        for (let c = 0; c < 2 * n; c++) aug[r][c] -= f * aug[col][c];
      }
    }
    return aug.map((row) => row.slice(n));
  }

  readonly indices = computed(() => {
    const n = this.size();
    const out: number[] = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) out.push(r * 3 + c);
    return out;
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

  setSize(s: 2 | 3) { this.size.set(s); }
  setOp(o: MatrixOp) { this.op.set(o); }
  setA(i: number, v: number) {
    const arr = [...this.aVals()];
    arr[i] = Number.isFinite(v) ? v : 0;
    this.aVals.set(arr);
  }
  setB(i: number, v: number) {
    const arr = [...this.bVals()];
    arr[i] = Number.isFinite(v) ? v : 0;
    this.bVals.set(arr);
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
    for (const l of ['en', 'hi', 'ar']) this.setLink('alternate', `https://jaurtools.com/${l}/${this.slug}`, l);
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
      '@type': 'Question', name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    }));
    const json = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity })
      .replace(/</g, '\\u003c');
    const el = this.document.createElement('script');
    el.type = 'application/ld+json';
    el.textContent = json;
    this.document.head.appendChild(el);
    this.jsonLdEl = el;
  }
}
