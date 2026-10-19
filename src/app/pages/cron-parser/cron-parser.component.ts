import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface FieldDef {
  id: 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'dayOfWeek';
  min: number;
  max: number;
}
interface ParsedField {
  def: FieldDef;
  raw: string;
  valid: boolean;
  meaning: string;
}

const FIELD_DEFS: FieldDef[] = [
  { id: 'minute', min: 0, max: 59 },
  { id: 'hour', min: 0, max: 23 },
  { id: 'dayOfMonth', min: 1, max: 31 },
  { id: 'month', min: 1, max: 12 },
  { id: 'dayOfWeek', min: 0, max: 7 },
];

@Component({
  selector: 'app-cron-parser',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './cron-parser.component.html',
  styleUrl: './cron-parser.component.scss',
})
export class CronParserComponent implements OnDestroy {
  readonly slug = 'cron-parser';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['cron-builder', 'chmod-calculator', 'csp-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly exprInput = signal('0 9 * * 1');
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly parsed = computed((): ParsedField[] => {
    this.translate.lang();
    const raws = this.exprInput().trim().split(/\s+/).filter((s) => s !== '');
    return FIELD_DEFS.map((def, i) => {
      const raw = raws[i] ?? '';
      const vals = raw === '' ? null : this.parseField(raw, def.min, def.max);
      return {
        def,
        raw,
        valid: vals !== null,
        meaning: vals === null ? this.t('labels.meaningInvalid') : this.fieldMeaning(raw, def, vals),
      };
    });
  });

  readonly fieldCountOk = computed(() => {
    const raws = this.exprInput().trim().split(/\s+/).filter((s) => s !== '');
    return raws.length === 5;
  });

  readonly isValid = computed(() => this.fieldCountOk() && this.parsed().every((f) => f.valid));

  readonly normalizedExpr = computed(() => this.exprInput().trim().split(/\s+/).join(' '));

  readonly description = computed(() => {
    if (!this.isValid()) {
      return '';
    }
    return this.describeExpr(this.normalizedExpr());
  });

  readonly nextRuns = computed(() => {
    if (!this.isValid()) {
      return [];
    }
    return this.computeNextRuns(this.normalizedExpr(), 5);
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

  fieldLabel(id: FieldDef['id']): string {
    return this.t(`labels.field_${id}`);
  }

  setExpr(v: string): void {
    this.exprInput.set(v ?? '');
  }

  loadSample(): void {
    this.exprInput.set('*/15 9-17 * * 1-5');
  }

  clear(): void {
    this.exprInput.set('');
  }

  copy(): void {
    const text = this.normalizedExpr();
    if (!text) {
      return;
    }
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

  private fieldMeaning(raw: string, def: FieldDef, vals: Set<number>): string {
    if (raw === '*') {
      return this.t('labels.meaningStar');
    }
    const stepMatch = /^\*\/(\d+)$/.exec(raw);
    if (stepMatch) {
      return `${this.t('labels.meaningEveryN').replace('{n}', stepMatch[1])} ${this.t(`labels.unit_${def.id}_plural`)}`;
    }
    const arr = [...vals].map((v) => (def.id === 'dayOfWeek' && v === 7 ? 0 : v));
    const uniq = [...new Set(arr)].sort((a, b) => a - b);
    const names =
      def.id === 'month'
        ? this.list('labels.monthNames')
        : def.id === 'dayOfWeek'
          ? this.list('labels.dayNames')
          : [];
    const fmt = (v: number) =>
      def.id === 'month' || def.id === 'dayOfWeek' ? (names[v - (def.id === 'month' ? 1 : 0)] ?? String(v)) : String(v);
    if (uniq.length === 1) {
      return `${this.t('labels.meaningAt')} ${fmt(uniq[0])}`;
    }
    const contiguous = uniq.every((v, i) => i === 0 || v === uniq[i - 1] + 1);
    if (contiguous) {
      return this.t('labels.meaningFromTo').replace('{a}', fmt(uniq[0])).replace('{b}', fmt(uniq[uniq.length - 1]));
    }
    return `${this.t('labels.meaningAt')} ${uniq.map(fmt).join(', ')}`;
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
