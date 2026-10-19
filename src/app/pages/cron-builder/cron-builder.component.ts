import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type FieldMode = 'every' | 'step' | 'list' | 'range';
type FieldId = 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'dayOfWeek';
interface CronField {
  mode: FieldMode;
  step: number;
  list: string;
  from: number;
  to: number;
}
interface FieldDef {
  id: FieldId;
  min: number;
  max: number;
}
interface Preset {
  id: string;
  fields: CronField[];
}

const FIELD_DEFS: FieldDef[] = [
  { id: 'minute', min: 0, max: 59 },
  { id: 'hour', min: 0, max: 23 },
  { id: 'dayOfMonth', min: 1, max: 31 },
  { id: 'month', min: 1, max: 12 },
  { id: 'dayOfWeek', min: 0, max: 7 },
];

const EVERY: CronField = { mode: 'every', step: 1, list: '', from: 0, to: 0 };
const at = (v: number): CronField => ({ mode: 'list', step: 1, list: String(v), from: 0, to: 0 });

const PRESETS: Preset[] = [
  { id: 'everyMinute', fields: [EVERY, EVERY, EVERY, EVERY, EVERY] },
  {
    id: 'every5min',
    fields: [{ ...EVERY, mode: 'step', step: 5 }, EVERY, EVERY, EVERY, EVERY],
  },
  { id: 'hourly', fields: [at(0), EVERY, EVERY, EVERY, EVERY] },
  { id: 'dailyMidnight', fields: [at(0), at(0), EVERY, EVERY, EVERY] },
  { id: 'dailyNoon', fields: [at(0), at(12), EVERY, EVERY, EVERY] },
  { id: 'weeklyMon', fields: [at(0), at(9), EVERY, EVERY, at(1)] },
  { id: 'monthly', fields: [at(0), at(0), at(1), EVERY, EVERY] },
  { id: 'yearly', fields: [at(0), at(0), at(1), at(1), EVERY] },
  {
    id: 'weekdays',
    fields: [at(0), at(9), EVERY, EVERY, { ...EVERY, mode: 'range', from: 1, to: 5 }],
  },
];

@Component({
  selector: 'app-cron-builder',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './cron-builder.component.html',
  styleUrl: './cron-builder.component.scss',
})
export class CronBuilderComponent implements OnDestroy {
  readonly slug = 'cron-builder';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['cron-parser', 'chmod-calculator', 'csp-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fieldDefs = FIELD_DEFS;
  readonly presets = PRESETS;

  readonly activePreset = signal<string>('every5min');
  readonly fields = signal<CronField[]>(PRESETS[1].fields.map((f) => ({ ...f })));
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly expression = computed(() => {
    const defs = this.fieldDefs;
    return this.fields()
      .map((f, i) => this.fieldExpr(f, defs[i]))
      .join(' ');
  });

  readonly fieldErrors = computed(() => {
    const defs = this.fieldDefs;
    return this.fields().map((f, i) => {
      const expr = this.fieldExpr(f, defs[i]);
      return this.parseField(expr, defs[i].min, defs[i].max) === null;
    });
  });

  readonly isValid = computed(() => this.fieldErrors().every((e) => !e));

  readonly description = computed(() => {
    if (!this.isValid()) {
      return this.t('labels.invalidLabel');
    }
    return this.describeExpr(this.expression());
  });

  readonly nextRuns = computed(() => {
    if (!this.isValid()) {
      return [];
    }
    return this.computeNextRuns(this.expression(), 5);
  });

  readonly runFormatter = computed(() =>
    new Intl.DateTimeFormat(this.locale(), { dateStyle: 'medium', timeStyle: 'short' }),
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

  fieldLabel(id: FieldId): string {
    return this.t(`labels.field_${id}`);
  }

  modeLabel(mode: FieldMode): string {
    return this.t(`labels.mode_${mode}`);
  }

  presetLabel(id: string): string {
    return this.t(`labels.preset_${id}`);
  }

  applyPreset(id: string): void {
    const p = this.presets.find((x) => x.id === id);
    if (!p) {
      return;
    }
    this.fields.set(p.fields.map((f) => ({ ...f })));
    this.activePreset.set(id);
  }

  updateField(index: number, patch: Partial<CronField>): void {
    const next = this.fields().map((f, i) => (i === index ? { ...f, ...patch } : f));
    this.fields.set(next);
    this.activePreset.set('custom');
  }

  setMode(index: number, mode: string): void {
    if (mode === 'every' || mode === 'step' || mode === 'list' || mode === 'range') {
      const def = this.fieldDefs[index];
      const cur = this.fields()[index];
      const patch: Partial<CronField> = { mode };
      if (mode === 'range' && (cur.from < def.min || cur.from > def.max)) {
        patch.from = def.min;
        patch.to = def.max;
      }
      this.updateField(index, patch);
    }
  }

  copy(): void {
    const text = this.expression();
    const done = () => {
      this.copied.set(true);
      window.setTimeout(() => this.copied.set(false), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => this.fallbackCopy(text, done));
    } else {
      this.fallbackCopy(text, done);
    }
  }

  private fallbackCopy(text: string, done: () => void): void {
    const ta = this.document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    this.document.body.appendChild(ta);
    ta.select();
    try {
      this.document.execCommand('copy');
    } catch {
      // clipboard unavailable; user can copy manually
    }
    this.document.body.removeChild(ta);
    done();
  }

  private fieldExpr(f: CronField, def: FieldDef): string {
    if (f.mode === 'every') {
      return '*';
    }
    if (f.mode === 'step') {
      const s = Math.max(1, Math.floor(f.step) || 1);
      return `*/${s}`;
    }
    if (f.mode === 'range') {
      return `${f.from}-${f.to}`;
    }
    return f.list.trim() === '' ? '*' : f.list.trim().replace(/\s+/g, '');
  }

  parseField(field: string, min: number, max: number): Set<number> | null {
    const values = new Set<number>();
    if (field === '*') {
      for (let v = min; v <= max; v++) {
        values.add(v);
      }
      return values;
    }
    for (const part of field.split(',')) {
      if (part === '') {
        return null;
      }
      const stepMatch = /^(\*|\d+-\d+)\/(\d+)$/.exec(part);
      if (stepMatch) {
        const step = parseInt(stepMatch[2], 10);
        if (step < 1) {
          return null;
        }
        let lo = min;
        let hi = max;
        if (stepMatch[1] !== '*') {
          const [a, b] = stepMatch[1].split('-').map(Number);
          if (a < min || b > max || a > b) {
            return null;
          }
          lo = a;
          hi = b;
        }
        for (let v = lo; v <= hi; v += step) {
          values.add(v);
        }
        continue;
      }
      const rangeMatch = /^(\d+)-(\d+)$/.exec(part);
      if (rangeMatch) {
        const a = Number(rangeMatch[1]);
        const b = Number(rangeMatch[2]);
        if (a < min || b > max || a > b) {
          return null;
        }
        for (let v = a; v <= b; v++) {
          values.add(v);
        }
        continue;
      }
      if (/^\d+$/.test(part)) {
        const v = Number(part);
        if (v < min || v > max) {
          return null;
        }
        values.add(v);
        continue;
      }
      return null;
    }
    return values;
  }

  computeNextRuns(expr: string, count: number): Date[] {
    const fields = expr.trim().split(/\s+/);
    if (fields.length !== 5) {
      return [];
    }
    const mins = this.parseField(fields[0], 0, 59);
    const hrs = this.parseField(fields[1], 0, 23);
    const dom = this.parseField(fields[2], 1, 31);
    const mon = this.parseField(fields[3], 1, 12);
    const dow = this.parseField(fields[4], 0, 7);
    if (!mins || !hrs || !dom || !mon || !dow) {
      return [];
    }
    if (dow.has(7)) {
      dow.delete(7);
      dow.add(0);
    }
    const domStar = fields[2] === '*';
    const dowStar = fields[4] === '*';
    const runs: Date[] = [];
    const d = new Date();
    d.setSeconds(0, 0);
    d.setMinutes(d.getMinutes() + 1);
    let guard = 0;
    while (runs.length < count && guard < 525600) {
      guard++;
      const domMatch = dom.has(d.getDate());
      const dowMatch = dow.has(d.getDay());
      const dayMatch =
        domStar && dowStar ? true : domStar ? dowMatch : dowStar ? domMatch : domMatch || dowMatch;
      if (mins.has(d.getMinutes()) && hrs.has(d.getHours()) && mon.has(d.getMonth() + 1) && dayMatch) {
        runs.push(new Date(d));
      }
      d.setMinutes(d.getMinutes() + 1);
    }
    return runs;
  }

  private describeExpr(expr: string): string {
    const f = expr.trim().split(/\s+/);
    const [mi, hr, dm, mo, dw] = f;
    const fill = (tpl: string, vals: Record<string, string>) =>
      tpl.replace(/\{(\w+)\}/g, (_m, k: string) => vals[k] ?? '');
    if (expr === '* * * * *') {
      return this.t('labels.descEveryMinute');
    }
    const stepMin = /^\*\/(\d+)$/.exec(mi);
    if (stepMin && hr === '*' && dm === '*' && mo === '*' && dw === '*') {
      return fill(this.t('labels.descEveryNMinutes'), { n: stepMin[1] });
    }
    if (hr === '*' && dm === '*' && mo === '*' && dw === '*') {
      const mins = this.parseField(mi, 0, 59);
      if (mins) {
        return fill(this.t('labels.descHourlyAt'), { m: [...mins].sort((a, b) => a - b).join(', ') });
      }
    }
    if (/^\d+$/.test(mi) && /^\d+$/.test(hr) && dm === '*' && mo === '*' && dw === '*') {
      return fill(this.t('labels.descDailyAt'), { t: this.hhmm(Number(hr), Number(mi)) });
    }
    if (/^\d+$/.test(mi) && /^\d+$/.test(hr) && dm === '*' && mo === '*') {
      const days = this.parseField(dw, 0, 7);
      if (days) {
        if (days.has(7)) {
          days.delete(7);
          days.add(0);
        }
        const names = this.list('labels.dayNames');
        const picked = [...days].sort((a, b) => a - b).map((d2) => names[d2] ?? String(d2));
        return fill(this.t('labels.descWeeklyAt'), {
          days: picked.join(', '),
          t: this.hhmm(Number(hr), Number(mi)),
        });
      }
    }
    if (/^\d+$/.test(mi) && /^\d+$/.test(hr) && dw === '*' && mo === '*') {
      const doms = this.parseField(dm, 1, 31);
      if (doms) {
        return fill(this.t('labels.descMonthlyAt'), {
          d: [...doms].sort((a, b) => a - b).join(', '),
          t: this.hhmm(Number(hr), Number(mi)),
        });
      }
    }
    if (/^\d+$/.test(mi) && /^\d+$/.test(hr) && dw === '*') {
      const doms = this.parseField(dm, 1, 31);
      const mons = this.parseField(mo, 1, 12);
      if (doms && mons) {
        const names = this.list('labels.monthNames');
        return fill(this.t('labels.descYearlyAt'), {
          d: [...doms].sort((a, b) => a - b).join(', '),
          mon: [...mons].sort((a, b) => a - b).map((m2) => names[m2 - 1] ?? String(m2)).join(', '),
          t: this.hhmm(Number(hr), Number(mi)),
        });
      }
    }
    return fill(this.t('labels.descCustom'), { expr });
  }

  private hhmm(h: number, m: number): string {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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
    for (const l of ['en', 'hi', 'ar']) {
      this.setLink('alternate', `https://jaurtools.com/${l}/${this.slug}`, l);
    }
  }

  private setLink(rel: string, href: string, hreflang?: string) {
    const head = this.document.head;
    const selector = hreflang
      ? `link[rel="${rel}"][hreflang="${hreflang}"]`
      : `link[rel="${rel}"]:not([hreflang])`;
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
