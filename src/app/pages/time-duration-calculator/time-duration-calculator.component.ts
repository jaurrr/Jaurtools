import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-time-duration-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './time-duration-calculator.component.html',
  styleUrl: './time-duration-calculator.component.scss',
})
export class TimeDurationCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.diff().hours + this.t('labels.hoursShort') + this.diff().minutes + this.t('labels.minutesShort'));
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

  readonly slug = 'time-duration-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['online-timer', 'time-zone-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly mode = signal<'difference' | 'add'>('difference');
  readonly t1 = signal('09:30');
  readonly t2 = signal('17:45');
  readonly base = signal('22:45');
  readonly dh = signal(2);
  readonly dm = signal(30);
  readonly ds = signal(0);
  readonly op = signal<'add' | 'sub'>('add');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly diff = computed(() => {
    const a = this.parseTime(this.t1());
    const b = this.parseTime(this.t2());
    if (a === null || b === null) return { ok: false as const };
    let mins = b - a;
    let nextDay = false;
    if (mins < 0) {
      mins += 1440;
      nextDay = true;
    }
    return {
      ok: true as const,
      nextDay,
      hours: Math.floor(mins / 60),
      minutes: mins % 60,
      totalMinutes: mins,
      totalSeconds: mins * 60,
    };
  });

  readonly added = computed(() => {
    const b = this.parseTime(this.base());
    if (b === null) return { ok: false as const };
    const delta = this.dh() * 3600 + this.dm() * 60 + this.ds();
    const total = b * 60 + (this.op() === 'add' ? delta : -delta);
    const dayOffset = Math.floor(total / 86400);
    const tod = ((total % 86400) + 86400) % 86400;
    const h = Math.floor(tod / 3600);
    const m = Math.floor((tod % 3600) / 60);
    const s = tod % 60;
    const pad = (n: number) => `${n}`.padStart(2, '0');
    return { ok: true as const, dayOffset, time: `${pad(h)}:${pad(m)}:${pad(s)}` };
  });

  readonly dayOffsetLabel = computed(() => {
    const r = this.added();
    if (!r.ok) return '';
    if (r.dayOffset === 0) return this.t('labels.sameDay');
    if (r.dayOffset === 1) return this.t('labels.plusOneDay');
    if (r.dayOffset === -1) return this.t('labels.minusOneDay');
    return (r.dayOffset > 0 ? '+' : '') + r.dayOffset + ' ' + this.t('labels.daysWord');
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

  setMode(m: 'difference' | 'add') { this.mode.set(m); }
  setT1(v: string) { this.t1.set(v ?? ''); }
  setT2(v: string) { this.t2.set(v ?? ''); }
  setBase(v: string) { this.base.set(v ?? ''); }
  setDh(v: number) { this.dh.set(this.clampNum(v, 0, 999)); }
  setDm(v: number) { this.dm.set(this.clampNum(v, 0, 59)); }
  setDs(v: number) { this.ds.set(this.clampNum(v, 0, 59)); }
  setOp(o: 'add' | 'sub') { this.op.set(o); }

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private parseTime(v: string): number | null {
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec((v ?? '').trim());
    if (!m) return null;
    const h = +m[1];
    const min = +m[2];
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
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

  readonly numFmt = computed(() =>
    new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 0 })
  );

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
