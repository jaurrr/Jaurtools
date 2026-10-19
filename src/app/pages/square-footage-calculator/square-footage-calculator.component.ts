import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-square-footage-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './square-footage-calculator.component.html',
  styleUrl: './square-footage-calculator.component.scss',
})
export class SquareFootageCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.totalSqftText() + this.t('labels.sqft') + "/" + this.totalSqmText() + this.t('labels.sqm'));
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

  readonly slug = 'square-footage-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['unit-converter', 'gas-mileage-calculator', 'percentage-calculator', 'time-card-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly sys = signal<'ft' | 'm'>('ft');
  readonly waste = signal(10);
  readonly rooms = signal<{ name: string; len: number; wid: number }[]>([
    { name: 'Room 1', len: 12, wid: 10 },
  ]);
  readonly newName = signal('');
  readonly newLen = signal('');
  readonly newWid = signal('');

  setSys(s: 'ft' | 'm') { this.sys.set(s); }
  setWaste(v: number) { this.waste.set(this.clampNum(v, 0, 100)); }
  setNewName(v: string) { this.newName.set(v.slice(0, 40)); }
  setNewLen(v: string) { this.newLen.set(v); }
  setNewWid(v: string) { this.newWid.set(v); }

  addRoom() {
    const len = parseFloat(this.newLen());
    const wid = parseFloat(this.newWid());
    if (!Number.isFinite(len) || !Number.isFinite(wid) || len <= 0 || wid <= 0) return;
    const n = this.rooms().length + 1;
    const name = this.newName().trim() || `Room ${n}`;
    this.rooms.update((r) => [...r, { name, len, wid }]);
    this.newName.set('');
    this.newLen.set('');
    this.newWid.set('');
  }
  removeRoom(i: number) {
    this.rooms.update((r) => r.filter((_, x) => x !== i));
  }
  roomArea(r: { len: number; wid: number }): number {
    return r.len * r.wid;
  }
  readonly totalArea = computed(() => this.rooms().reduce((x, r) => x + this.roomArea(r), 0));
  readonly totalSqft = computed(() => (this.sys() === 'ft' ? this.totalArea() : this.totalArea() / 0.09290304));
  readonly totalSqm = computed(() => (this.sys() === 'ft' ? this.totalArea() * 0.09290304 : this.totalArea()));
  readonly material = computed(() => this.totalSqft() * (1 + this.waste() / 100));
  private fmt(v: number): string {
    return new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 2 }).format(v);
  }
  readonly totalSqftText = computed(() => this.fmt(this.totalSqft()));
  readonly totalSqmText = computed(() => this.fmt(this.totalSqm()));
  readonly materialText = computed(() => this.fmt(this.material()));
  roomAreaText(r: { len: number; wid: number }): string {
    return this.fmt(this.roomArea(r));
  }
  unitLabel(): string {
    return this.sys() === 'ft' ? this.t('labels.sqft') : this.t('labels.sqm');
  }
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang(); // re-run on language change
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
  private parseLocalDate(s: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return null;
    return d;
  }
  private fmtDate(d: Date): string {
    return new Intl.DateTimeFormat(this.locale(), { dateStyle: 'full' }).format(d);
  }
  private fmtWeekday(d: Date): string {
    return new Intl.DateTimeFormat(this.locale(), { weekday: 'long' }).format(d);
  }
  private isoDate(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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
