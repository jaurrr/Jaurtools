import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type Dec = { neg: boolean; ip: string; fp: string };
type Op = 'add' | 'sub' | 'mul' | 'div';

@Component({
  selector: 'app-big-number-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './big-number-calculator.component.html',
  styleUrl: './big-number-calculator.component.scss',
})
export class BigNumberCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.t('labels.digits') + ":" + this.result().digits);
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

  readonly slug = 'big-number-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['online-calculator', 'binary-calculator', 'decimal-to-fraction-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly aText = signal('0.1');
  readonly bText = signal('0.2');
  readonly op = signal<Op>('add');
  readonly precision = signal(20);
  readonly precisions = [10, 20, 30, 50];

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly result = computed(() => {
    const a = this.parseDec(this.aText());
    const b = this.parseDec(this.bText());
    if (!a || !b) return { ok: false, value: this.t('labels.errInvalid') };
    const digits = (this.aText().replace(/[^0-9]/g, '') + this.bText().replace(/[^0-9]/g, '')).length;
    if (digits > 600) return { ok: false, value: this.t('labels.errTooLong') };
    const r = this.compute(a, b, this.op(), this.precision());
    if (r === null) return { ok: false, value: this.t('labels.errDivZero') };
    const sig = r.replace(/[^0-9]/g, '').replace(/^0+/, '');
    return { ok: true, value: r, digits: sig.length === 0 ? 1 : sig.length };
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

  setAText(v: string) { this.aText.set(v.slice(0, 400)); }
  setBText(v: string) { this.bText.set(v.slice(0, 400)); }
  setOp(o: Op) { this.op.set(o); }
  setPrecision(p: number) { this.precision.set(p); }

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private parseDec(raw: string): Dec | null {
    const s = raw.trim();
    if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s)) return null;
    const body = s.replace(/^[+-]/, '');
    const dot = body.indexOf('.');
    const ipart = dot === -1 ? body : body.slice(0, dot);
    const fpart = dot === -1 ? '' : body.slice(dot + 1);
    const ip = ipart.replace(/^0+/, '') || '0';
    const fp = fpart.replace(/0+$/, '');
    const neg = s[0] === '-' && !(ip === '0' && fp === '');
    return { neg, ip, fp };
  }

  private strip(s: string): string {
    const r = s.replace(/^0+/, '');
    return r === '' ? '0' : r;
  }

  private cmpInt(a: string, b: string): number {
    a = this.strip(a);
    b = this.strip(b);
    if (a.length !== b.length) return a.length < b.length ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  }

  private addInt(a: string, b: string): string {
    let i = a.length - 1;
    let j = b.length - 1;
    let carry = 0;
    let out = '';
    while (i >= 0 || j >= 0 || carry > 0) {
      const d = (i >= 0 ? a.charCodeAt(i--) - 48 : 0) + (j >= 0 ? b.charCodeAt(j--) - 48 : 0) + carry;
      out = String(d % 10) + out;
      carry = Math.floor(d / 10);
    }
    return this.strip(out);
  }

  private subInt(a: string, b: string): string {
    let i = a.length - 1;
    let j = b.length - 1;
    let borrow = 0;
    let out = '';
    while (i >= 0) {
      let d = a.charCodeAt(i--) - 48 - (j >= 0 ? b.charCodeAt(j--) - 48 : 0) - borrow;
      borrow = 0;
      if (d < 0) { d += 10; borrow = 1; }
      out = String(d) + out;
    }
    return this.strip(out);
  }

  private mulInt(a: string, b: string): string {
    a = this.strip(a);
    b = this.strip(b);
    if (a === '0' || b === '0') return '0';
    const res = new Array<number>(a.length + b.length).fill(0);
    for (let i = a.length - 1; i >= 0; i--) {
      for (let j = b.length - 1; j >= 0; j--) {
        const p = (a.charCodeAt(i) - 48) * (b.charCodeAt(j) - 48) + res[i + j + 1];
        res[i + j + 1] = p % 10;
        res[i + j] += Math.floor(p / 10);
      }
    }
    return this.strip(res.join(''));
  }

  private divInt(num: string, den: string): string {
    num = this.strip(num);
    den = this.strip(den);
    if (this.cmpInt(num, den) < 0) return '0';
    let q = '';
    let rem = '';
    for (const ch of num) {
      rem = this.strip(rem + ch);
      let lo = 1;
      let hi = 9;
      let d = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (this.cmpInt(this.mulInt(den, String(mid)), rem) <= 0) {
          d = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      q += String(d);
      if (d > 0) rem = this.subInt(rem, this.mulInt(den, String(d)));
    }
    return this.strip(q);
  }

  private insertPoint(intStr: string, fracLen: number): string {
    let s = this.strip(intStr);
    if (fracLen === 0) return s;
    s = s.padStart(fracLen + 1, '0');
    const ip = s.slice(0, s.length - fracLen).replace(/^0+/, '') || '0';
    const fp = s.slice(s.length - fracLen).replace(/0+$/, '');
    return fp === '' ? ip : ip + '.' + fp;
  }

  private cmpAbs(x: Dec, y: Dec): number {
    const c = this.cmpInt(x.ip, y.ip);
    if (c !== 0) return c;
    const n = Math.max(x.fp.length, y.fp.length);
    return this.cmpInt(x.fp.padEnd(n, '0'), y.fp.padEnd(n, '0'));
  }

  private addAbs(x: Dec, y: Dec): string {
    const n = Math.max(x.fp.length, y.fp.length);
    const ai = x.ip + x.fp.padEnd(n, '0');
    const bi = y.ip + y.fp.padEnd(n, '0');
    return this.insertPoint(this.addInt(ai, bi), n);
  }

  private subAbs(x: Dec, y: Dec): string {
    const n = Math.max(x.fp.length, y.fp.length);
    const ai = x.ip + x.fp.padEnd(n, '0');
    const bi = y.ip + y.fp.padEnd(n, '0');
    return this.insertPoint(this.subInt(ai, bi), n);
  }

  private divAbs(x: Dec, y: Dec, prec: number): string {
    const num = this.strip(x.ip + x.fp);
    const den = this.strip(y.ip + y.fp);
    const shift = prec + y.fp.length - x.fp.length;
    let scaled: string;
    if (shift >= 0) {
      scaled = num + '0'.repeat(shift);
    } else {
      scaled = num.length + shift > 0 ? num.slice(0, num.length + shift) : '0';
    }
    return this.insertPoint(this.divInt(scaled, den), prec);
  }

  private compute(a: Dec, b: Dec, op: Op, prec: number): string | null {
    switch (op) {
      case 'add': {
        if (a.neg === b.neg) {
          const r = this.addAbs(a, b);
          return a.neg && r !== '0' ? '-' + r : r;
        }
        const c = this.cmpAbs(a, b);
        if (c === 0) return '0';
        const r = c > 0 ? this.subAbs(a, b) : this.subAbs(b, a);
        const neg = c > 0 ? a.neg : b.neg;
        return neg ? '-' + r : r;
      }
      case 'sub':
        return this.compute(a, { neg: !b.neg, ip: b.ip, fp: b.fp }, 'add', prec);
      case 'mul': {
        const ai = this.strip(a.ip + a.fp);
        const bi = this.strip(b.ip + b.fp);
        const r = this.insertPoint(this.mulInt(ai, bi), a.fp.length + b.fp.length);
        return a.neg !== b.neg && r !== '0' ? '-' + r : r;
      }
      case 'div': {
        if (b.ip === '0' && b.fp === '') return null;
        const q = this.divAbs(a, b, prec);
        return a.neg !== b.neg && q !== '0' ? '-' + q : q;
      }
    }
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
