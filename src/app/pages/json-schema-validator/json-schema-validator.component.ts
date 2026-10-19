import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface SchemaIssue {
  path: string;
  message: string;
}

type MsgFn = (key: string, params?: Record<string, string>) => string;

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function checkType(v: unknown, t: string): boolean {
  if (t === 'integer') return typeof v === 'number' && Number.isInteger(v);
  if (t === 'number') return typeof v === 'number';
  return typeOf(v) === t;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function displayPath(path: string): string {
  if (path === '') return '$';
  return path.startsWith('[') ? '$' + path : '$.' + path;
}

function validate(v: unknown, s: unknown, path: string, issues: SchemaIssue[], msg: MsgFn): void {
  if (s === true || s === undefined) return;
  if (s === false) {
    issues.push({ path: displayPath(path), message: msg('falseSchema') });
    return;
  }
  if (s === null || typeof s !== 'object' || Array.isArray(s)) return;
  const sch = s as Record<string, unknown>;

  const t = sch['type'];
  if (t !== undefined) {
    const types = (Array.isArray(t) ? t : [t]) as string[];
    if (!types.some((x) => checkType(v, x))) {
      issues.push({
        path: displayPath(path),
        message: msg('typeMismatch', { expected: types.join(' | '), actual: typeOf(v) }),
      });
      return;
    }
  }

  if (sch['enum'] !== undefined) {
    const allowed = sch['enum'] as unknown[];
    if (Array.isArray(allowed) && !allowed.some((e) => sameJson(e, v))) {
      issues.push({ path: displayPath(path), message: msg('enum') });
    }
  }
  if (sch['const'] !== undefined && !sameJson(sch['const'], v)) {
    issues.push({ path: displayPath(path), message: msg('const') });
  }

  if (typeof v === 'string') {
    const minL = sch['minLength'];
    const maxL = sch['maxLength'];
    if (typeof minL === 'number' && v.length < minL) {
      issues.push({ path: displayPath(path), message: msg('minLength', { min: String(minL) }) });
    }
    if (typeof maxL === 'number' && v.length > maxL) {
      issues.push({ path: displayPath(path), message: msg('maxLength', { max: String(maxL) }) });
    }
    if (typeof sch['pattern'] === 'string') {
      try {
        if (!new RegExp(sch['pattern'] as string).test(v)) {
          issues.push({ path: displayPath(path), message: msg('pattern') });
        }
      } catch {
        issues.push({
          path: displayPath(path),
          message: msg('invalidPattern', { pattern: sch['pattern'] as string }),
        });
      }
    }
  }

  if (typeof v === 'number') {
    const min = sch['minimum'];
    const max = sch['maximum'];
    const exMin = sch['exclusiveMinimum'];
    const exMax = sch['exclusiveMaximum'];
    if (typeof min === 'number' && v < min) {
      issues.push({ path: displayPath(path), message: msg('minimum', { value: String(v), min: String(min) }) });
    }
    if (typeof max === 'number' && v > max) {
      issues.push({ path: displayPath(path), message: msg('maximum', { value: String(v), max: String(max) }) });
    }
    if (typeof exMin === 'number' && v <= exMin) {
      issues.push({ path: displayPath(path), message: msg('exclusiveMinimum', { value: String(v), min: String(exMin) }) });
    } else if (exMin === true && typeof min === 'number' && v <= min) {
      issues.push({ path: displayPath(path), message: msg('exclusiveMinimum', { value: String(v), min: String(min) }) });
    }
    if (typeof exMax === 'number' && v >= exMax) {
      issues.push({ path: displayPath(path), message: msg('exclusiveMaximum', { value: String(v), max: String(exMax) }) });
    } else if (exMax === true && typeof max === 'number' && v >= max) {
      issues.push({ path: displayPath(path), message: msg('exclusiveMaximum', { value: String(v), max: String(max) }) });
    }
    if (typeof sch['multipleOf'] === 'number' && sch['multipleOf'] !== 0) {
      const base = sch['multipleOf'] as number;
      const q = v / base;
      if (Math.abs(q - Math.round(q)) > 1e-9) {
        issues.push({ path: displayPath(path), message: msg('multipleOf', { value: String(v), base: String(base) }) });
      }
    }
  }

  if (Array.isArray(v)) {
    const minI = sch['minItems'];
    const maxI = sch['maxItems'];
    if (typeof minI === 'number' && v.length < minI) {
      issues.push({ path: displayPath(path), message: msg('minItems', { min: String(minI) }) });
    }
    if (typeof maxI === 'number' && v.length > maxI) {
      issues.push({ path: displayPath(path), message: msg('maxItems', { max: String(maxI) }) });
    }
    if (sch['uniqueItems'] === true) {
      const seen = new Set<string>();
      for (const item of v) {
        const key = JSON.stringify(item) ?? typeof item;
        if (seen.has(key)) {
          issues.push({ path: displayPath(path), message: msg('uniqueItems') });
          break;
        }
        seen.add(key);
      }
    }
    const items = sch['items'];
    if (Array.isArray(items)) {
      items.forEach((sub, i) => {
        if (i < v.length) validate(v[i], sub, `${path}[${i}]`, issues, msg);
      });
      const addl = sch['additionalItems'];
      if (addl !== undefined) {
        for (let i = items.length; i < v.length; i++) validate(v[i], addl, `${path}[${i}]`, issues, msg);
      }
    } else if (items !== undefined) {
      v.forEach((item, i) => validate(item, items, `${path}[${i}]`, issues, msg));
    }
  }

  if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj);
    const minP = sch['minProperties'];
    const maxP = sch['maxProperties'];
    if (typeof minP === 'number' && keys.length < minP) {
      issues.push({ path: displayPath(path), message: msg('minProperties', { min: String(minP) }) });
    }
    if (typeof maxP === 'number' && keys.length > maxP) {
      issues.push({ path: displayPath(path), message: msg('maxProperties', { max: String(maxP) }) });
    }
    const required = sch['required'];
    if (Array.isArray(required)) {
      for (const r of required) {
        if (typeof r === 'string' && !(r in obj)) {
          issues.push({ path: displayPath(path), message: msg('required', { prop: r }) });
        }
      }
    }
    const props = sch['properties'];
    const propMap = props !== null && typeof props === 'object' && !Array.isArray(props)
      ? (props as Record<string, unknown>)
      : {};
    for (const k of keys) {
      const p = path ? `${path}.${k}` : k;
      if (k in propMap) {
        validate(obj[k], propMap[k], p, issues, msg);
        continue;
      }
      const patterns = sch['patternProperties'];
      let matched = false;
      if (patterns !== null && typeof patterns === 'object' && !Array.isArray(patterns)) {
        for (const pat of Object.keys(patterns)) {
          try {
            if (new RegExp(pat).test(k)) {
              validate(obj[k], (patterns as Record<string, unknown>)[pat], p, issues, msg);
              matched = true;
            }
          } catch {
            /* ignore bad pattern */
          }
        }
      }
      if (matched) continue;
      const addl = sch['additionalProperties'];
      if (addl === false) {
        issues.push({ path: displayPath(path), message: msg('additionalProp', { prop: k }) });
      } else if (addl !== undefined && addl !== true) {
        validate(obj[k], addl, p, issues, msg);
      }
    }
  }

  const allOf = sch['allOf'];
  if (Array.isArray(allOf)) {
    const before = issues.length;
    for (const sub of allOf) validate(v, sub, path, issues, msg);
    if (issues.length > before) {
      issues.push({ path: displayPath(path), message: msg('allOf') });
    }
  }
  const anyOf = sch['anyOf'];
  if (Array.isArray(anyOf)) {
    const ok = anyOf.some((sub) => {
      const tmp: SchemaIssue[] = [];
      validate(v, sub, path, tmp, msg);
      return tmp.length === 0;
    });
    if (!ok) issues.push({ path: displayPath(path), message: msg('anyOf') });
  }
  const oneOf = sch['oneOf'];
  if (Array.isArray(oneOf)) {
    const count = oneOf.filter((sub) => {
      const tmp: SchemaIssue[] = [];
      validate(v, sub, path, tmp, msg);
      return tmp.length === 0;
    }).length;
    if (count !== 1) {
      issues.push({ path: displayPath(path), message: msg('oneOf', { count: String(count) }) });
    }
  }
  if (sch['not'] !== undefined) {
    const tmp: SchemaIssue[] = [];
    validate(v, sch['not'], path, tmp, msg);
    if (tmp.length === 0) issues.push({ path: displayPath(path), message: msg('not') });
  }
}

const SAMPLE_SCHEMA = `{
  "type": "object",
  "required": ["name", "age"],
  "properties": {
    "name": { "type": "string", "minLength": 1 },
    "age": { "type": "integer", "minimum": 0, "maximum": 150 },
    "email": { "type": "string", "pattern": "^[^@\\\\s]+@[^@\\\\s]+\\\\.[^@\\\\s]+$" },
    "tags": { "type": "array", "items": { "type": "string" }, "uniqueItems": true }
  },
  "additionalProperties": false
}`;

const SAMPLE_VALID = `{
  "name": "Asha Sharma",
  "age": 30,
  "email": "asha@example.com",
  "tags": ["admin", "editor"]
}`;

const SAMPLE_INVALID = `{
  "name": "",
  "age": 200,
  "email": "not-an-email",
  "tags": ["admin", "admin"],
  "nickname": "Ash"
}`;

@Component({
  selector: 'app-json-schema-validator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './json-schema-validator.component.html',
  styleUrl: './json-schema-validator.component.scss',
})
export class JsonSchemaValidatorComponent implements OnDestroy {
  readonly slug = 'json-schema-validator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['json-validator', 'json-formatter', 'json-diff'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly schemaText = signal(SAMPLE_SCHEMA);
  readonly instanceText = signal(SAMPLE_VALID);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly result = computed(() => {
    const schemaRaw = this.schemaText();
    const instRaw = this.instanceText();
    let schema: unknown;
    try {
      schema = schemaRaw.trim() ? JSON.parse(schemaRaw) : true;
    } catch (e) {
      return {
        schemaError: e instanceof Error ? e.message : 'Invalid schema',
        instanceError: null as string | null,
        issues: [] as SchemaIssue[],
        valid: false,
        checked: false,
      };
    }
    if (!instRaw.trim()) {
      return { schemaError: null as string | null, instanceError: null as string | null, issues: [] as SchemaIssue[], valid: false, checked: false };
    }
    let instance: unknown;
    try {
      instance = JSON.parse(instRaw);
    } catch (e) {
      return {
        schemaError: null as string | null,
        instanceError: e instanceof Error ? e.message : 'Invalid JSON',
        issues: [] as SchemaIssue[],
        valid: false,
        checked: false,
      };
    }
    const issues: SchemaIssue[] = [];
    const msgFn: MsgFn = (k, p) => this.msg(k, p);
    validate(instance, schema, '', issues, msgFn);
    return { schemaError: null as string | null, instanceError: null as string | null, issues, valid: issues.length === 0, checked: true };
  });

  readonly faqs = computed(() => {
    this.translate.lang();
    const raw = this.lookup('faqs');
    return Array.isArray(raw) ? (raw as { q: string; a: string }[]) : [];
  });

  msg(key: string, params?: Record<string, string>): string {
    this.translate.lang();
    let s = this.t('messages.' + key);
    if (params) {
      for (const k of Object.keys(params)) s = s.split('{' + k + '}').join(params[k]);
    }
    return s;
  }

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

  setSchema(v: string): void {
    this.schemaText.set(v);
  }

  setInstance(v: string): void {
    this.instanceText.set(v);
  }

  loadValid(): void {
    this.instanceText.set(SAMPLE_VALID);
  }

  loadInvalid(): void {
    this.instanceText.set(SAMPLE_INVALID);
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
