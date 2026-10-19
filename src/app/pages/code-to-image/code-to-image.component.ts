import { Component, computed, effect, inject, OnDestroy, signal, viewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface Token {
  text: string;
  kind: 'plain' | 'keyword' | 'string' | 'comment' | 'number' | 'fn';
}

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do',
  'switch', 'case', 'break', 'continue', 'new', 'class', 'extends', 'import',
  'from', 'export', 'default', 'try', 'catch', 'finally', 'throw', 'typeof',
  'instanceof', 'in', 'of', 'this', 'true', 'false', 'null', 'undefined',
  'async', 'await', 'static', 'get', 'set', 'interface', 'type', 'enum',
  'public', 'private', 'protected', 'readonly', 'def', 'print', 'lambda',
  'with', 'as', 'pass', 'raise', 'elif', 'int', 'float', 'str', 'bool',
]);

const TOKEN_RE =
  /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_][A-Za-z0-9_]*)\s*(?=\()|\b([A-Za-z_][A-Za-z0-9_]*)\b/g;

const DEFAULT_CODE = `function greet(name: string): string {
  // Say hello to the user
  const message = "Hello, " + name + "!";
  return message;
}

const total = greet("JaurTools");
console.log(total); // prints greeting`;

@Component({
  selector: 'app-code-to-image',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './code-to-image.component.html',
  styleUrl: './code-to-image.component.scss',
})
export class CodeToImageComponent implements OnDestroy {
  readonly slug = 'code-to-image';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['chart-maker', 'text-on-photo', 'shape-cropper', 'photo-joiner'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('previewCanvas');

  readonly code = signal(DEFAULT_CODE);
  readonly language = signal('TypeScript');
  readonly theme = signal<'dark' | 'light'>('dark');
  readonly fontSize = signal(16);
  readonly lineNumbers = signal(true);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    effect(() => {
      this.code();
      this.language();
      this.theme();
      this.fontSize();
      this.lineNumbers();
      this.render();
    });
  }

  readonly lineCount = computed(() => this.code().split('\n').length);
  readonly charCount = computed(() => this.code().length);

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

  setCode(v: string): void { this.code.set(v); }
  setLanguage(v: string): void { this.language.set(v); }
  setTheme(v: 'dark' | 'light'): void { this.theme.set(v); }
  setFontSize(v: number): void {
    this.fontSize.set(Math.min(28, Math.max(10, Math.round(v) || 16)));
  }
  setLineNumbers(v: boolean): void { this.lineNumbers.set(v); }

  private tokenize(line: string): Token[] {
    const tokens: Token[] = [];
    let last = 0;
    TOKEN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TOKEN_RE.exec(line)) !== null) {
      if (m.index > last) {
        tokens.push({ text: line.slice(last, m.index), kind: 'plain' });
      }
      const [full, comment, str, num, fn, word] = m;
      if (comment) tokens.push({ text: full, kind: 'comment' });
      else if (str) tokens.push({ text: full, kind: 'string' });
      else if (num) tokens.push({ text: full, kind: 'number' });
      else if (fn) tokens.push({ text: fn, kind: 'fn' });
      else if (word && KEYWORDS.has(word)) tokens.push({ text: word, kind: 'keyword' });
      else tokens.push({ text: full, kind: 'plain' });
      last = m.index + full.length;
      if (full.length === 0) TOKEN_RE.lastIndex++;
    }
    if (last < line.length) {
      tokens.push({ text: line.slice(last), kind: 'plain' });
    }
    return tokens;
  }

  render(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dark = this.theme() === 'dark';
    const fs = this.fontSize();
    const lineH = Math.round(fs * 1.55);
    const pad = 28;
    const headerH = 58;
    const gutterW = this.lineNumbers() ? 56 : 0;
    const font = `${fs}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.font = font;
    const lines = this.code().split('\n');
    let textW = 0;
    for (const line of lines) {
      textW = Math.max(textW, ctx.measureText(line).width);
    }
    const W = Math.ceil(pad * 2 + gutterW + textW + 24);
    const H = Math.ceil(headerH + pad + lines.length * lineH + pad);
    canvas.width = W;
    canvas.height = H;
    const bg = dark ? '#0f172a' : '#ffffff';
    const fg = dark ? '#e2e8f0' : '#0f172a';
    const muted = dark ? '#64748b' : '#94a3b8';
    ctx.fillStyle = bg;
    this.roundRect(ctx, 0, 0, W, H, 14);
    ctx.fill();
    const dots: [string, number][] = [
      ['#ef4444', 0], ['#f59e0b', 1], ['#22c55e', 2],
    ];
    dots.forEach(([c, i]) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(pad + i * 26 + 8, headerH / 2, 8, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = muted;
    ctx.font = `600 ${Math.max(13, fs - 2)}px Arial, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.language() || 'code', W - pad, headerH / 2);
    ctx.strokeStyle = dark ? '#1e293b' : '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, headerH);
    ctx.lineTo(W, headerH);
    ctx.stroke();
    const colors: Record<Token['kind'], string> = {
      plain: fg,
      keyword: dark ? '#c084fc' : '#7c3aed',
      string: dark ? '#86efac' : '#15803d',
      comment: muted,
      number: dark ? '#fbbf24' : '#b45309',
      fn: dark ? '#7dd3fc' : '#0369a1',
    };
    ctx.font = font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const y0 = headerH + pad + lineH * 0.78;
    lines.forEach((line, i) => {
      const y = y0 + i * lineH;
      if (this.lineNumbers()) {
        ctx.fillStyle = muted;
        ctx.textAlign = 'right';
        ctx.fillText(String(i + 1), pad + 34, y);
        ctx.textAlign = 'left';
      }
      let x = pad + gutterW;
      for (const tok of this.tokenize(line)) {
        ctx.fillStyle = colors[tok.kind];
        ctx.fillText(tok.text, x, y);
        x += ctx.measureText(tok.text).width;
      }
    });
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  download(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return;
    const a = this.document.createElement('a');
    a.download = 'code.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  }

  ngOnDestroy(): void {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }

  private updateSeo(): void {
    const lang = this.translate.lang();
    this.pageTitle.setTitle(this.t('metaTitle'));
    this.meta.updateTag({ name: 'description', content: this.t('metaDescription') });
    this.meta.updateTag({ name: 'keywords', content: this.t('keywords') });
    this.setLink('canonical', `https://jaurtools.com/${lang}/${this.slug}`);
    for (const l of ['en', 'hi', 'ar']) {
      this.setLink('alternate', `https://jaurtools.com/${l}/${this.slug}`, l);
    }
  }

  private setLink(rel: string, href: string, hreflang?: string): void {
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

  private refreshJsonLd(): void {
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
