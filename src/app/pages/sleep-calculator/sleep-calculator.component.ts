import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-sleep-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './sleep-calculator.component.html',
  styleUrl: './sleep-calculator.component.scss',
})
export class SleepCalculatorComponent implements OnDestroy {
  readonly slug = 'sleep-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['target-heart-rate-calculator', 'bmi-calculator', 'pace-calculator', 'ovulation-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly mode = signal<'wake' | 'bed'>('wake');
  readonly wakeTime = signal('06:30');
  readonly bedTime = signal('23:00');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly picked = signal(6);
  setPicked(n: number) { this.picked.set(n); }
  readonly pickedOption = computed(() => this.options()?.find((o) => o.cycles === this.picked()) ?? null);

  readonly copied = signal(false);
  copyTime(): void {
    const o = this.pickedOption();
    if (!o) return;
    const text = `${this.t('name')}: ${o.time} (${o.cycles} ${this.t('labels.cyclesLabel')})`;
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
  readonly options = computed(() => {
    const nf = new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 1 });
    const cycles = [6, 5, 4];
    if (this.mode() === 'wake') {
      const t = this.toMin(this.wakeTime());
      if (t === null) return null;
      return cycles.map((n) => ({
        cycles: n,
        time: this.fmtTime(t - (n * 90 + 15)),
        sleepHrs: nf.format((n * 90) / 60),
      }));
    }
    const b = this.toMin(this.bedTime());
    if (b === null) return null;
    return cycles.map((n) => ({
      cycles: n,
      time: this.fmtTime(b + 15 + n * 90),
      sleepHrs: nf.format((n * 90) / 60),
    }));
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

  setMode(v: 'wake' | 'bed') { this.mode.set(v); }
  setWakeTime(v: string) { this.wakeTime.set(v ?? ''); }
  setBedTime(v: string) { this.bedTime.set(v ?? ''); }

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private toMin(s: string): number | null {
    const m = /^(\d{2}):(\d{2})$/.exec(s ?? '');
    if (!m) return null;
    const h = +m[1];
    const min = +m[2];
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  private fmtTime(mins: number): string {
    const norm = ((mins % 1440) + 1440) % 1440;
    const d = new Date(2000, 0, 1, Math.floor(norm / 60), norm % 60);
    return new Intl.DateTimeFormat(this.locale(), { hour: 'numeric', minute: '2-digit' }).format(d);
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
