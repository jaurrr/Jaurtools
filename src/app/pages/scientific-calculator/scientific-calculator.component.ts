import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface CalcKey {
  label: string;
  act: string;
  cls?: string;
}

interface HistoryItem {
  expr: string;
  res: string;
}

@Component({
  selector: 'app-scientific-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './scientific-calculator.component.html',
  styleUrl: './scientific-calculator.component.scss',
})
export class ScientificCalculatorComponent implements OnDestroy {
  readonly slug = 'scientific-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['scientific-notation-calculator', 'percentage-calculator', 'statistics-calculator', 'unit-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly expression = signal('');
  readonly result = signal('0');
  readonly angleMode = signal<'deg' | 'rad'>('deg');
  readonly history = signal<HistoryItem[]>([]);
  private readonly lastAns = signal('0');
  private justEvaluated = false;

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly keys: CalcKey[] = [
    { label: 'C', act: 'clear', cls: 'danger' },
    { label: '(', act: '(' },
    { label: ')', act: ')' },
    { label: '⌫', act: 'back', cls: 'fn' },
    { label: '÷', act: '/' },
    { label: 'sin', act: 'sin(', cls: 'fn' },
    { label: 'cos', act: 'cos(', cls: 'fn' },
    { label: 'tan', act: 'tan(', cls: 'fn' },
    { label: 'π', act: 'π', cls: 'fn' },
    { label: '×', act: '*' },
    { label: 'ln', act: 'ln(', cls: 'fn' },
    { label: 'log', act: 'log(', cls: 'fn' },
    { label: '√', act: 'sqrt(', cls: 'fn' },
    { label: 'e', act: 'e', cls: 'fn' },
    { label: '−', act: '-' },
    { label: 'x²', act: '^2', cls: 'fn' },
    { label: 'xʸ', act: '^', cls: 'fn' },
    { label: '1/x', act: 'recip', cls: 'fn' },
    { label: 'x!', act: '!', cls: 'fn' },
    { label: '+', act: '+' },
    { label: '7', act: '7' },
    { label: '8', act: '8' },
    { label: '9', act: '9' },
    { label: 'Ans', act: 'ans', cls: 'fn' },
    { label: '±', act: 'neg', cls: 'fn' },
    { label: '4', act: '4' },
    { label: '5', act: '5' },
    { label: '6', act: '6' },
    { label: '0', act: '0' },
    { label: '.', act: '.' },
    { label: '1', act: '1' },
    { label: '2', act: '2' },
    { label: '3', act: '3' },
    { label: '=', act: 'equals', cls: 'eq' },
  ];

  readonly prettyExpr = computed(() =>
    this.expression()
      .replace(/sqrt\(/g, '√(')
      .replace(/\*/g, '×')
      .replace(/\//g, '÷')
      .replace(/-/g, '−')
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

  press(act: string) {
    if (act === 'clear') {
      this.expression.set('');
      this.result.set('0');
      this.justEvaluated = false;
      return;
    }
    if (act === 'back') {
      this.expression.update((e) => e.slice(0, -1));
      this.justEvaluated = false;
      return;
    }
    if (act === 'equals') {
      this.evaluate();
      return;
    }
    if (act === 'ans') {
      this.insertText(this.lastAns());
      return;
    }
    if (act === 'neg') {
      this.expression.update((e) => (e.startsWith('-') ? e.slice(1) : '-' + e));
      this.justEvaluated = false;
      return;
    }
    if (act === 'recip') {
      this.expression.update((e) => (e ? `1/(${e})` : '1/('));
      this.justEvaluated = false;
      return;
    }
    if (this.justEvaluated) {
      if (/[0-9.(]/.test(act) || act.startsWith('sin(') || act.startsWith('cos(') || act.startsWith('tan(') || act.startsWith('ln(') || act.startsWith('log(') || act.startsWith('sqrt(')) {
        this.expression.set('');
      } else if ('+-*/^'.includes(act)) {
        this.expression.set(this.lastAns());
      }
      this.justEvaluated = false;
    }
    this.insertText(act);
  }

  setAngleMode(m: 'deg' | 'rad') {
    this.angleMode.set(m);
  }

  reuse(item: HistoryItem) {
    this.expression.set(item.expr);
    this.result.set(item.res);
    this.justEvaluated = true;
  }

  clearHistory() {
    this.history.set([]);
  }

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private insertText(act: string) {
    this.expression.update((e) => (e + act).slice(0, 120));
  }

  private evaluate() {
    const expr = this.expression().trim();
    if (!expr) return;
    try {
      const tokens = this.addImplicitMult(this.tokenize(expr));
      const value = this.evalRpn(this.toRpn(tokens));
      if (!Number.isFinite(value)) throw new Error('not finite');
      const rounded = parseFloat(value.toPrecision(12));
      const res = this.formatResult(rounded);
      this.result.set(res);
      this.lastAns.set(String(rounded));
      this.history.update((h) => [{ expr, res }, ...h].slice(0, 6));
      this.justEvaluated = true;
    } catch {
      this.result.set(this.t('labels.error'));
      this.justEvaluated = true;
    }
  }

  private formatResult(v: number): string {
    if (Number.isInteger(v) && Math.abs(v) < 1e15) {
      return new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 0 }).format(v);
    }
    return String(parseFloat(v.toPrecision(10)));
  }

  private isNumToken(tk: string): boolean {
    return /^[0-9.]+$/.test(tk) && /[0-9]/.test(tk);
  }

  private tokenize(s: string): string[] {
    const tokens: string[] = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === ' ') { i++; continue; }
      if (/[0-9.]/.test(c)) {
        let num = '';
        while (i < s.length && /[0-9.]/.test(s[i])) { num += s[i]; i++; }
        tokens.push(num);
        continue;
      }
      if (/[a-z]/.test(c)) {
        let word = '';
        while (i < s.length && /[a-z]/.test(s[i])) { word += s[i]; i++; }
        tokens.push(word);
        continue;
      }
      if (c === 'π') { tokens.push('π'); i++; continue; }
      if ('+-*/^()!%'.includes(c)) { tokens.push(c); i++; continue; }
      throw new Error('bad char');
    }
    if (!tokens.length) throw new Error('empty');
    return tokens;
  }

  private addImplicitMult(tokens: string[]): string[] {
    const out: string[] = [];
    const leftEnd = (t: string) => this.isNumToken(t) || t === 'π' || t === 'e' || t === ')' || t === '!' || t === '%';
    const rightStart = (t: string) => this.isNumToken(t) || t === 'π' || t === 'e' || t === '(' || /^[a-z]+$/.test(t);
    for (let i = 0; i < tokens.length; i++) {
      out.push(tokens[i]);
      if (i + 1 < tokens.length && leftEnd(tokens[i]) && rightStart(tokens[i + 1])) {
        out.push('*');
      }
    }
    return out;
  }

  private toRpn(tokens: string[]): string[] {
    const out: string[] = [];
    const ops: string[] = [];
    const prec: Record<string, number> = { '+': 2, '-': 2, '*': 3, '/': 3, 'u-': 3.5, '^': 4 };
    const rightAssoc = new Set(['^', 'u-']);
    const funcs = new Set(['sin', 'cos', 'tan', 'ln', 'log', 'sqrt', 'abs']);
    let prev: 'num' | 'op' | 'open' | 'close' | 'func' | null = null;
    for (const tk of tokens) {
      if (this.isNumToken(tk) || tk === 'π' || tk === 'e') {
        out.push(tk);
        prev = 'num';
      } else if (funcs.has(tk)) {
        ops.push(tk);
        prev = 'func';
      } else if (tk === '(') {
        ops.push(tk);
        prev = 'open';
      } else if (tk === ')') {
        while (ops.length && ops[ops.length - 1] !== '(') out.push(ops.pop() as string);
        if (!ops.length) throw new Error('mismatched');
        ops.pop();
        if (ops.length && funcs.has(ops[ops.length - 1])) out.push(ops.pop() as string);
        prev = 'close';
      } else if (tk === '!' || tk === '%') {
        out.push(tk);
        prev = 'num';
      } else if ('+-*/^'.includes(tk)) {
        let op = tk;
        if (tk === '-' && (prev === null || prev === 'op' || prev === 'open')) op = 'u-';
        if (tk === '+' && (prev === null || prev === 'op' || prev === 'open')) {
          prev = 'op';
          continue;
        }
        if (op === 'u-') {
          // Unary minus binds to the next operand only; never pop pending operators.
          ops.push(op);
          prev = 'op';
          continue;
        }
        while (ops.length) {
          const top = ops[ops.length - 1];
          if (top === '(' || funcs.has(top)) break;
          const pTop = prec[top] ?? 0;
          const pOp = prec[op] ?? 0;
          if (pTop > pOp || (pTop === pOp && !rightAssoc.has(op))) out.push(ops.pop() as string);
          else break;
        }
        ops.push(op);
        prev = 'op';
      } else {
        throw new Error('bad token');
      }
    }
    while (ops.length) {
      const op = ops.pop() as string;
      if (op === '(') throw new Error('mismatched');
      out.push(op);
    }
    return out;
  }

  private evalRpn(rpn: string[]): number {
    const st: number[] = [];
    const rad = this.angleMode() === 'rad';
    const toRad = (x: number) => (rad ? x : (x * Math.PI) / 180);
    for (const tk of rpn) {
      if (tk === 'π') st.push(Math.PI);
      else if (tk === 'e') st.push(Math.E);
      else if (this.isNumToken(tk)) st.push(parseFloat(tk));
      else if (tk === 'u-') st.push(-(st.pop() ?? NaN));
      else if (tk === '!') st.push(this.fact(st.pop() ?? NaN));
      else if (tk === '%') st.push((st.pop() ?? NaN) / 100);
      else if (tk === '+' || tk === '-' || tk === '*' || tk === '/' || tk === '^') {
        const b = st.pop() ?? NaN;
        const a = st.pop() ?? NaN;
        st.push(tk === '+' ? a + b : tk === '-' ? a - b : tk === '*' ? a * b : tk === '/' ? a / b : Math.pow(a, b));
      } else {
        const x = st.pop() ?? NaN;
        switch (tk) {
          case 'sin': st.push(Math.sin(toRad(x))); break;
          case 'cos': st.push(Math.cos(toRad(x))); break;
          case 'tan': {
            const v = Math.tan(toRad(x));
            st.push(Math.abs(v) > 1e15 ? NaN : v);
            break;
          }
          case 'ln': st.push(Math.log(x)); break;
          case 'log': st.push(Math.log10(x)); break;
          case 'sqrt': st.push(Math.sqrt(x)); break;
          case 'abs': st.push(Math.abs(x)); break;
          default: throw new Error('bad func');
        }
      }
    }
    if (st.length !== 1) throw new Error('bad expr');
    return st[0];
  }

  private fact(x: number): number {
    if (!Number.isInteger(x) || x < 0 || x > 170) return NaN;
    let r = 1;
    for (let i = 2; i <= x; i++) r *= i;
    return r;
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
