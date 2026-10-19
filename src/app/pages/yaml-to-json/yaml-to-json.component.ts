import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-yaml-to-json',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './yaml-to-json.component.html',
  styleUrl: './yaml-to-json.component.scss',
})
export class YamlToJsonComponent implements OnDestroy {
  readonly slug = 'yaml-to-json';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['yaml-formatter', 'xml-to-json', 'fake-json-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly direction = signal<'yaml2json' | 'json2yaml'>('yaml2json');
  readonly input = signal('name: JaurTools\nfree: true\ntools: 600\nfeatures:\n  - search\n  - voice');
  readonly copied = signal(false);

  setDirection(d: 'yaml2json' | 'json2yaml'): void {
    this.direction.set(d);
  }

  setInput(v: string): void {
    this.input.set(v.slice(0, 50000));
  }

  loadSample(): void {
    if (this.direction() === 'yaml2json') {
      this.input.set('name: JaurTools\nfree: true\ntools: 600\nfeatures:\n  - search\n  - voice');
    } else {
      this.input.set('{\n  "name": "JaurTools",\n  "free": true,\n  "tools": 600\n}');
    }
  }

  clearInput(): void {
    this.input.set('');
  }

  swapDirection(): void {
    const out = this.result().text;
    this.direction.update((d) => (d === 'yaml2json' ? 'json2yaml' : 'yaml2json'));
    if (out) this.input.set(out);
  }

  readonly result = computed((): { error: string; text: string } => {
    const src = this.input().trim();
    if (!src) return { error: '', text: '' };
    try {
      if (this.direction() === 'yaml2json') {
        return { error: '', text: JSON.stringify(this.parseYaml(src), null, 2) };
      }
      return { error: '', text: this.emitYaml(JSON.parse(src), 0) };
    } catch {
      return { error: this.t('labels.parseErrorLabel'), text: '' };
    }
  });

  readonly charCount = computed(() => this.result().text.length);

  copyOutput(): void {
    if (!navigator.clipboard) return;
    navigator.clipboard
      .writeText(this.result().text)
      .then(() => {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 1600);
      })
      ;
  }

  downloadOutput(): void {
    const isJson = this.direction() === 'yaml2json';
    const blob = new Blob([this.result().text], { type: isJson ? 'application/json;charset=utf-8' : 'application/yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = isJson ? 'converted.json' : 'converted.yaml';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  private yamlBlank(l: string): boolean {
    return l.trim() === '' || l.trim().startsWith('#');
  }

  private yamlIndent(l: string): number {
    const m = /^[ ]*/.exec(l);
    return m ? m[0].length : 0;
  }

  private yamlKeyColon(c: string): number {
    let inS = false;
    let inD = false;
    for (let k = 0; k < c.length; k++) {
      const ch = c[k];
      if (ch === "'" && !inD) inS = !inS;
      else if (ch === '"' && !inS) inD = !inD;
      else if (ch === ':' && !inS && !inD && (k + 1 >= c.length || /\s/.test(c[k + 1]))) return k;
    }
    return -1;
  }

  private yamlStripComment(s: string): string {
    let inS = false;
    let inD = false;
    for (let k = 0; k < s.length; k++) {
      const ch = s[k];
      if (ch === "'" && !inD) inS = !inS;
      else if (ch === '"' && !inS) inD = !inD;
      else if (ch === '#' && !inS && !inD && (k === 0 || /\s/.test(s[k - 1]))) return s.slice(0, k).trimEnd();
    }
    return s;
  }

  private yamlScalar(s: string): unknown {
    const t = this.yamlStripComment(s).trim();
    if (t === '' || t === '~' || /^[Nn][Uu][Ll][Ll]$/.test(t)) return null;
    if (/^[Tt][Rr][Uu][Ee]$/.test(t)) return true;
    if (/^[Ff][Aa][Ll][Ss][Ee]$/.test(t)) return false;
    if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
      const inner = t.slice(1, -1);
      return t.startsWith('"') ? inner.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\') : inner;
    }
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return parseFloat(t);
    if (/^0x[0-9a-fA-F]+$/.test(t)) return parseInt(t, 16);
    return t;
  }

  private yamlBlock(lines: string[], i: number, parentIndent: number): { value: unknown; next: number } {
    let j = i;
    while (j < lines.length && this.yamlBlank(lines[j])) j++;
    if (j >= lines.length) return { value: null, next: j };
    const ind = this.yamlIndent(lines[j]);
    const content = lines[j].slice(ind);
    const isSeq = content === '-' || content.startsWith('- ');
    if (isSeq) {
      if (ind < parentIndent) return { value: null, next: j };
      return this.yamlSeq(lines, j, ind);
    }
    if (ind <= parentIndent) return { value: null, next: j };
    if (this.yamlKeyColon(content) !== -1) return this.yamlMap(lines, j, ind);
    return { value: this.yamlScalar(content), next: j + 1 };
  }

  private yamlSeq(lines: string[], i: number, indent: number): { value: unknown; next: number } {
    const arr: unknown[] = [];
    let j = i;
    while (j < lines.length) {
      while (j < lines.length && this.yamlBlank(lines[j])) j++;
      if (j >= lines.length) break;
      const ind = this.yamlIndent(lines[j]);
      if (ind !== indent) break;
      const content = lines[j].slice(ind);
      if (content !== '-' && !content.startsWith('- ')) break;
      const rest = content === '-' ? '' : content.slice(2);
      if (rest.trim() === '') {
        const nested = this.yamlBlock(lines, j + 1, indent);
        arr.push(nested.value);
        j = nested.next;
      } else {
        const rc = this.yamlKeyColon(rest);
        if (rc !== -1) {
          const obj: Record<string, unknown> = {};
          obj[rest.slice(0, rc).trim()] = this.yamlScalar(rest.slice(rc + 1));
          let k = j + 1;
          while (k < lines.length) {
            while (k < lines.length && this.yamlBlank(lines[k])) k++;
            if (k >= lines.length) break;
            const ki = this.yamlIndent(lines[k]);
            if (ki <= indent) break;
            const kc = lines[k].slice(ki);
            const kcColon = this.yamlKeyColon(kc);
            if (kcColon === -1) break;
            const kk = kc.slice(0, kcColon).trim();
            const kv = kc.slice(kcColon + 1).trim();
            if (kv === '') {
              const nested = this.yamlBlock(lines, k + 1, ki);
              obj[kk] = nested.value;
              k = nested.next;
            } else {
              obj[kk] = this.yamlScalar(kv);
              k++;
            }
          }
          arr.push(obj);
          j = k;
        } else {
          arr.push(this.yamlScalar(rest));
          j++;
        }
      }
    }
    return { value: arr, next: j };
  }

  private yamlMap(lines: string[], i: number, indent: number): { value: unknown; next: number } {
    const obj: Record<string, unknown> = {};
    let j = i;
    while (j < lines.length) {
      while (j < lines.length && this.yamlBlank(lines[j])) j++;
      if (j >= lines.length) break;
      const ind = this.yamlIndent(lines[j]);
      if (ind !== indent) break;
      const content = lines[j].slice(ind);
      const colon = this.yamlKeyColon(content);
      if (colon === -1) break;
      const key = content.slice(0, colon).trim();
      const rest = content.slice(colon + 1).trim();
      if (rest !== '') {
        obj[key] = this.yamlScalar(rest);
        j++;
      } else {
        const nested = this.yamlBlock(lines, j + 1, indent);
        obj[key] = nested.value;
        j = nested.next;
      }
    }
    return { value: obj, next: j };
  }

  private parseYaml(src: string): unknown {
    for (const l of src.split('\n')) {
      if (/^\s*\t/.test(l)) throw new Error('tabs are not allowed in YAML indentation');
    }
    const lines = src.split('\n').filter((l) => {
      const t = l.trim();
      return t !== '---' && t !== '...';
    });
    return this.yamlBlock(lines, 0, -1).value;
  }

  private emitYaml(v: unknown, indent: number): string {
    const pad = ' '.repeat(indent);
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'boolean' || typeof v === 'number') return String(v);
    if (typeof v === 'string') {
      if (v === '' || /[:#\[\]{},&*!|>'"%@`\n]/.test(v) || /^\s|\s$/.test(v) || /^(true|false|null|~|\d)/i.test(v)) {
        return '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
      }
      return v;
    }
    if (Array.isArray(v)) {
      if (!v.length) return '[]';
      return v.map((item) => {
        if (item !== null && typeof item === 'object') {
          const inner = this.emitYaml(item, indent + 2).split('\n');
          return pad + '- ' + inner[0].trimStart() + (inner.length > 1 ? '\n' + inner.slice(1).join('\n') : '');
        }
        return pad + '- ' + this.emitYaml(item, 0);
      }).join('\n');
    }
    const rec = v as Record<string, unknown>;
    const keys = Object.keys(rec);
    if (!keys.length) return '{}';
    return keys.map((k) => {
      const val = rec[k];
      if (val !== null && typeof val === 'object') return pad + k + ':\n' + this.emitYaml(val, indent + 2);
      return pad + k + ': ' + this.emitYaml(val, 0);
    }).join('\n');
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
    return Math.min(max, Math.max(min, Math.round(v * 100) / 100));
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
