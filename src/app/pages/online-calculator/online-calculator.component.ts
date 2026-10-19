import { Component, computed, effect, HostListener, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-online-calculator',
  standalone: true,
  imports: [FormsModule, RouterLink, IconComponent],
  templateUrl: './online-calculator.component.html',
  styleUrl: './online-calculator.component.scss',
})
export class OnlineCalculatorComponent implements OnDestroy {
  readonly slug = 'online-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['exponent-calculator', 'binary-calculator', 'percentage-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly expression = signal('');
  readonly lastResult = signal('');
  readonly errorMsg = signal('');
  readonly evaluated = signal(false);
  readonly tape = signal<string[]>([]);
  readonly copied = signal(false);

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (/^[0-9+\-*/.()]$/.test(e.key)) {
      this.press(e.key === '*' ? '×' : e.key === '/' ? '÷' : e.key);
    } else if (e.key === 'Enter') {
      this.equals();
    } else if (e.key === 'Backspace') {
      this.press('back');
    } else if (e.key === 'Escape') {
      this.expression.set('');
      this.lastResult.set('');
      this.errorMsg.set('');
    }
  }

  copyResult(): void {
    const val = this.lastResult();
    if (!val) return;
    const done = () => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1600);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(val).then(done, () => done());
    } else {
      done();
    }
  }

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

  setExpression(v: string) {
    this.evaluated.set(false);
    this.errorMsg.set('');
    this.lastResult.set('');
    this.expression.set(v.replace(/[^0-9+\-*/().% ]/g, '').slice(0, 60));
  }

  press(key: string) {
    this.errorMsg.set('');
    if (this.evaluated()) {
      if (/[0-9.(]/.test(key)) {
        this.expression.set('');
        this.lastResult.set('');
      }
      this.evaluated.set(false);
    }
    if (key === 'back') {
      this.expression.update((e) => e.slice(0, -1));
      return;
    }
    if (key === '±') { this.toggleSign(); return; }
    if (key === '=') { this.equals(); return; }
    const map: Record<string, string> = { '×': '*', '÷': '/', '−': '-' };
    const k = map[key] ?? key;
    const e = this.expression();
    if (e.length >= 60) return;
    if ('+-*/'.includes(k) && e !== '') {
      const last = e[e.length - 1];
      if ('+-*/'.includes(last)) {
        if (k === '-' && last !== '-') {
          this.expression.set(e + k);
        } else {
          this.expression.set(e.slice(0, -1) + k);
        }
        return;
      }
    }
    if (k === '.') {
      const seg = /(\d*\.?\d*)$/.exec(e)?.[1] ?? '';
      if (seg.includes('.')) return;
    }
    if (k === '%' && (e === '' || !/[\d)]$/.test(e))) return;
    this.expression.set(e + k);
  }

  toggleSign() {
    const e = this.expression();
    const m = /(\d+\.?\d*|\.\d+)$/.exec(e);
    if (!m) return;
    const num = m[1];
    const cut = e.length - num.length;
    const before = e.slice(0, cut);
    if (before.endsWith('-') && (cut === 1 || /[+\-*/(%]$/.test(before.slice(0, -1)))) {
      this.expression.set(before.slice(0, -1) + num);
    } else {
      this.expression.set(before + '-' + num);
    }
  }

  equals() {
    const expr = this.expression().trim();
    if (!expr) return;
    const tokens = this.tokenize(expr);
    const rpn = tokens ? this.toRpn(tokens) : null;
    const val = rpn ? this.evalRpn(rpn) : null;
    if (val === null) {
      this.errorMsg.set(this.t('labels.errInvalid'));
      return;
    }
    if (val === 'div0') {
      this.errorMsg.set(this.t('labels.errDivZero'));
      return;
    }
    const rounded = String(parseFloat(val.toPrecision(12)));
    this.tape.update((t) => [...t.slice(-4), `${expr} = ${rounded}`]);
    this.expression.set(rounded);
    this.lastResult.set(rounded);
    this.evaluated.set(true);
  }

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private tokenize(expr: string): (number | string)[] | null {
    const tokens: (number | string)[] = [];
    let i = 0;
    const isUnaryPos = () =>
      tokens.length === 0 ||
      (typeof tokens[tokens.length - 1] === 'string' &&
        '+-*/('.includes(tokens[tokens.length - 1] as string));
    const readNumber = (): number | null => {
      let num = '';
      let dots = 0;
      while (i < expr.length && (/\d/.test(expr[i]) || expr[i] === '.')) {
        if (expr[i] === '.') dots++;
        if (dots > 1) return null;
        num += expr[i++];
      }
      if (num === '' || num === '.') return null;
      let val = parseFloat(num);
      while (expr[i] === '%') { val /= 100; i++; }
      return val;
    };
    while (i < expr.length) {
      const c = expr[i];
      if (c === ' ') { i++; continue; }
      if (/\d/.test(c) || c === '.') {
        const v = readNumber();
        if (v === null) return null;
        tokens.push(v);
        continue;
      }
      if (c === '-' && isUnaryPos()) {
        i++;
        const v = readNumber();
        if (v === null) return null;
        tokens.push(-v);
        continue;
      }
      if ('+-*/()'.includes(c)) { tokens.push(c); i++; continue; }
      return null;
    }
    return tokens;
  }

  private toRpn(tokens: (number | string)[]): (number | string)[] | null {
    const out: (number | string)[] = [];
    const ops: string[] = [];
    const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };
    for (const tk of tokens) {
      if (typeof tk === 'number') { out.push(tk); continue; }
      if (tk === '(') { ops.push(tk); continue; }
      if (tk === ')') {
        while (ops.length > 0 && ops[ops.length - 1] !== '(') out.push(ops.pop() as string);
        if (ops.length === 0) return null;
        ops.pop();
        continue;
      }
      if (tk in prec) {
        while (
          ops.length > 0 &&
          ops[ops.length - 1] !== '(' &&
          prec[ops[ops.length - 1]] >= prec[tk]
        ) {
          out.push(ops.pop() as string);
        }
        ops.push(tk);
        continue;
      }
      return null;
    }
    while (ops.length > 0) {
      const o = ops.pop() as string;
      if (o === '(') return null;
      out.push(o);
    }
    return out;
  }

  private evalRpn(rpn: (number | string)[]): number | 'div0' | null {
    const st: number[] = [];
    for (const tk of rpn) {
      if (typeof tk === 'number') { st.push(tk); continue; }
      if (st.length < 2) return null;
      const b = st.pop() as number;
      const a = st.pop() as number;
      let r: number;
      switch (tk) {
        case '+': r = a + b; break;
        case '-': r = a - b; break;
        case '*': r = a * b; break;
        case '/':
          if (b === 0) return 'div0';
          r = a / b;
          break;
        default: return null;
      }
      if (!Number.isFinite(r)) return null;
      st.push(r);
    }
    return st.length === 1 ? st[0] : null;
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
