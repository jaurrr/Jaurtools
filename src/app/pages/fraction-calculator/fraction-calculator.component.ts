import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type Op = 'add' | 'subtract' | 'multiply' | 'divide';

@Component({
  selector: 'app-fraction-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './fraction-calculator.component.html',
  styleUrl: './fraction-calculator.component.scss',
})
export class FractionCalculatorComponent implements OnDestroy {
  readonly slug = 'fraction-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['factor-calculator', 'gcf-calculator', 'lcm-calculator', 'long-division-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly ops: Op[] = ['add', 'subtract', 'multiply', 'divide'];
  readonly n1 = signal(1);
  readonly d1 = signal(2);
  readonly n2 = signal(2);
  readonly d2 = signal(3);
  readonly op = signal<Op>('add');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang(); // re-run on language change
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private gcd(a: number, b: number): number {
    a = Math.abs(a); b = Math.abs(b);
    while (b !== 0) { const r = a % b; a = b; b = r; }
    return a === 0 ? 1 : a;
  }

  readonly result = computed(() => {
    this.translate.lang();
    const a = this.n1(), b = this.d1(), c = this.n2(), d = this.d2(), op = this.op();
    if (b === 0 || d === 0) return null;
    if (op === 'divide' && c === 0) return null;
    let num: number, den: number;
    if (op === 'add') { num = a * d + c * b; den = b * d; }
    else if (op === 'subtract') { num = a * d - c * b; den = b * d; }
    else if (op === 'multiply') { num = a * c; den = b * d; }
    else { num = a * d; den = b * c; }
    if (den < 0) { num = -num; den = -den; }
    const g = this.gcd(num, den);
    const sn = num / g, sd = den / g;
    const whole = Math.trunc(sn / sd);
    const rem = Math.abs(sn - whole * sd);
    return {
      num: sn, den: sd,
      fraction: `${sn}/${sd}`,
      mixed: whole !== 0 && rem !== 0 ? `${whole} ${rem}/${sd}` : whole !== 0 ? `${whole}` : `${sn}/${sd}`,
      decimal: sn / sd,
      steps: this.steps(a, b, c, d, op, sn, sd, whole, rem),
    };
  });

  private steps(a: number, b: number, c: number, d: number, op: Op, sn: number, sd: number, whole: number, rem: number): string[] {
    const L = (k: string) => {
      const raw = (this.translate.t as unknown as (x: string) => unknown)(`${this.slug}.labels.${k}`);
      return typeof raw === 'string' ? raw : k;
    };
    const sym: Record<Op, string> = { add: '+', subtract: '-', multiply: 'x', divide: '/' };
    const lines: string[] = [`${a}/${b} ${sym[op]} ${c}/${d}`];
    if (op === 'add' || op === 'subtract') {
      const cd = b * d;
      const an = a * d, cn = c * b;
      lines.push(`${L('stepCommonDen')} ${cd}`);
      const r = op === 'add' ? an + cn : an - cn;
      lines.push(`= ${an}/${cd} ${sym[op]} ${cn}/${cd} = ${r}/${cd}`);
    } else if (op === 'multiply') {
      lines.push(`= ${a * c} / ${b * d}`);
    } else {
      lines.push(`${L('stepReciprocal')}: ${d}/${c}`);
      lines.push(`= ${a * d} / ${b * c}`);
    }
    lines.push(`${L('stepSimplify')} ${sn}/${sd}`);
    if (whole !== 0 && rem !== 0) lines.push(`${L('stepMixed')}: ${whole} ${rem}/${sd} = ${sn / sd}`);
    else lines.push(`= ${sn / sd}`);
    return lines;
  }

  readonly decFormat = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 6 })
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

  setN1(v: number) { this.n1.set(this.clampNum(v, -10000, 10000)); }
  setD1(v: number) { this.d1.set(this.clampNum(v, 1, 10000)); }
  setN2(v: number) { this.n2.set(this.clampNum(v, -10000, 10000)); }
  setD2(v: number) { this.d2.set(this.clampNum(v, 1, 10000)); }
  setOp(o: Op) { this.op.set(o); }

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }
  private clampNum(v: number, min: number, max: number): number {
    if (!Number.isFinite(v)) return min;
    return Math.min(max, Math.max(min, Math.round(v)));
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
