import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface ConvertResult {
  jsx: string;
  elements: number;
  error: '' | 'empty' | 'parse' | 'notSvg';
}

const ATTR_ALIASES: Record<string, string> = { class: 'className', for: 'htmlFor' };

const SAMPLE_SVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <circle class="ring" cx="12" cy="12" r="10" fill="none"/>
  <path d="M12 8v4l2 2" stroke-linecap="round"/>
  <text x="12" y="20" text-anchor="middle" style="font-size:8px;fill:#4f46e5">Hi</text>
</svg>`;

@Component({
  selector: 'app-svg-to-jsx-converter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './svg-to-jsx-converter.component.html',
  styleUrl: './svg-to-jsx-converter.component.scss',
})
export class SvgToJsxConverterComponent implements OnDestroy {
  readonly slug = 'svg-to-jsx-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['svg-wave-divider-generator', 'sqlite-database-viewer', 'word-counter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly svgInput = signal(SAMPLE_SVG);
  readonly componentName = signal('Icon');
  readonly wrapComponent = signal(true);
  readonly useTypeScript = signal(true);
  readonly stripDimensions = signal(false);
  readonly spreadProps = signal(true);
  readonly convertStyle = signal(true);
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly output = computed((): ConvertResult => {
    this.translate.lang();
    return this.buildOutput();
  });

  readonly previewHtml = computed((): string => {
    this.svgInput();
    return this.sanitizePreview(this.svgInput());
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

  loadSample(): void {
    this.svgInput.set(SAMPLE_SVG);
  }

  clearAll(): void {
    this.svgInput.set('');
  }

  setComponentName(value: string): void {
    this.componentName.set(value.slice(0, 60));
  }

  fileName(): string {
    const base = this.safeName();
    if (!this.wrapComponent()) return base + '-jsx.txt';
    return base + (this.useTypeScript() ? '.tsx' : '.jsx');
  }

  async copyOutput(): Promise<void> {
    const jsx = this.output().jsx;
    if (!jsx) return;
    try {
      await navigator.clipboard.writeText(jsx).catch(() => undefined);
      this.copied.set(true);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(false), 1500);
    } catch {
      this.copied.set(false);
    }
  }

  downloadFile(): void {
    const jsx = this.output().jsx;
    if (!jsx) return;
    const blob = new Blob([jsx], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = this.document.createElement('a');
    anchor.href = url;
    anchor.download = this.fileName();
    anchor.click();
    URL.revokeObjectURL(url);
  }

  ngOnDestroy() {
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private buildOutput(): ConvertResult {
    const input = this.svgInput().trim();
    if (!input) return { jsx: '', elements: 0, error: 'empty' };
    let doc: Document;
    try {
      doc = new DOMParser().parseFromString(input, 'image/svg+xml');
    } catch {
      return { jsx: '', elements: 0, error: 'parse' };
    }
    if (doc.querySelector('parsererror')) return { jsx: '', elements: 0, error: 'parse' };
    const root = doc.documentElement;
    if (!root || root.tagName.toLowerCase() !== 'svg') return { jsx: '', elements: 0, error: 'notSvg' };
    const counter = { count: 0 };
    const depth = this.wrapComponent() ? 2 : 0;
    const inner = this.serializeElement(root, depth, counter, true);
    if (!this.wrapComponent()) return { jsx: inner, elements: counter.count, error: '' };
    const name = this.safeName();
    const signature = this.useTypeScript() ? '(props: React.SVGProps<SVGSVGElement>)' : '(props)';
    const jsx = `export default function ${name}${signature} {\n  return (\n${inner}\n  );\n}`;
    return { jsx, elements: counter.count, error: '' };
  }

  private serializeElement(el: Element, depth: number, counter: { count: number }, isRoot: boolean): string {
    counter.count++;
    const pad = '  '.repeat(depth);
    const tag = el.tagName;
    const attrs = this.serializeAttrs(el, isRoot);
    const open = attrs ? `<${tag} ${attrs}` : `<${tag}`;
    const elementKids: Element[] = [];
    const textKids: string[] = [];
    el.childNodes.forEach((node) => {
      if (node.nodeType === 1) {
        elementKids.push(node as Element);
      } else if (node.nodeType === 3) {
        const text = (node.textContent ?? '').trim();
        if (text) textKids.push(this.escapeJsxText(text));
      }
    });
    if (elementKids.length === 0 && textKids.length === 0) return `${pad}${open} />`;
    if (elementKids.length === 0 && textKids.length === 1) {
      return `${pad}${open}>${textKids[0]}</${tag}>`;
    }
    const kids: string[] = elementKids.map((kid) => this.serializeElement(kid, depth + 1, counter, false));
    for (const text of textKids) kids.push(`${'  '.repeat(depth + 1)}${text}`);
    return `${pad}${open}>\n${kids.join('\n')}\n${pad}</${tag}>`;
  }

  private serializeAttrs(el: Element, isRoot: boolean): string {
    const out: string[] = [];
    for (const raw of el.getAttributeNames()) {
      if (isRoot && this.stripDimensions() && (raw === 'width' || raw === 'height')) continue;
      const value = el.getAttribute(raw) ?? '';
      if (raw === 'style' && this.convertStyle()) {
        const obj = this.styleToObject(value);
        if (obj) {
          out.push(`style={{ ${obj} }}`);
          continue;
        }
      }
      let name = raw;
      if (ATTR_ALIASES[name]) {
        name = ATTR_ALIASES[name];
      } else if (name.includes(':')) {
        name = this.camelCase(name.replace(':', '-'));
      } else if (!name.startsWith('data-') && !name.startsWith('aria-') && name.includes('-')) {
        name = this.camelCase(name);
      }
      out.push(`${name}="${this.escapeAttr(value)}"`);
    }
    if (isRoot && this.wrapComponent() && this.spreadProps()) out.push('{...props}');
    return out.join(' ');
  }

  private styleToObject(style: string): string {
    const pairs: string[] = [];
    for (const decl of style.split(';')) {
      const colon = decl.indexOf(':');
      if (colon < 0) continue;
      const prop = this.camelCase(decl.slice(0, colon).trim());
      const value = decl.slice(colon + 1).trim().replace(/'/g, "\\'");
      if (prop && value) pairs.push(`${prop}: '${value}'`);
    }
    return pairs.join(', ');
  }

  private camelCase(name: string): string {
    return name.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
  }

  private escapeAttr(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  private escapeJsxText(text: string): string {
    return text.replace(/{/g, "{'{'}").replace(/}/g, "{'}'}");
  }

  private safeName(): string {
    const cleaned = this.componentName().replace(/[^A-Za-z0-9_]/g, '');
    if (!cleaned) return 'SvgIcon';
    const first = cleaned[0].toUpperCase() + cleaned.slice(1);
    return /^[A-Za-z_]/.test(first) ? first : 'Svg' + first;
  }

  private sanitizePreview(input: string): string {
    return input
      .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
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
