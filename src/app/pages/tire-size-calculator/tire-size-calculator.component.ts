import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-tire-size-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './tire-size-calculator.component.html',
  styleUrl: './tire-size-calculator.component.scss',
})
export class TireSizeCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.fmt1().format(this.actualSpeed()) + this.t('labels.kmhUnit'));
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

  readonly slug = 'tire-size-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['speed-calculator', 'voltage-drop-calculator', 'stair-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);


  readonly oldW = signal(205);
  readonly oldA = signal(55);
  readonly oldR = signal(16);
  readonly newW = signal(215);
  readonly newA = signal(60);
  readonly newR = signal(16);

  private dims(w: number, a: number, r: number) {
    const sidewall = (w * a) / 100;
    const diameter = r * 25.4 + 2 * sidewall;
    const circumference = Math.PI * diameter;
    return { sidewall, diameter, circumference, revsPerKm: 1000000 / circumference };
  }

  readonly oldDims = computed(() => this.dims(this.oldW(), this.oldA(), this.oldR()));
  readonly newDims = computed(() => this.dims(this.newW(), this.newA(), this.newR()));

  readonly diffPct = computed(() => {
    const o = this.oldDims().circumference;
    return o > 0 ? ((this.newDims().circumference - o) / o) * 100 : 0;
  });
  readonly actualSpeed = computed(() => 100 * (1 + this.diffPct() / 100));
  readonly clearanceChange = computed(
    () => (this.newDims().diameter - this.oldDims().diameter) / 2
  );
  readonly verdict = computed(() =>
    Math.abs(this.diffPct()) <= 3 ? this.t('labels.okLabel') : this.t('labels.warnLabel')
  );

  readonly fmt1 = computed(
    () =>
      new Intl.NumberFormat(this.locale(), {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })
  );
  readonly fmt2 = computed(
    () =>
      new Intl.NumberFormat(this.locale(), {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
  );

  setOldW(v: number) { this.oldW.set(this.clampNum(v, 125, 355)); }
  setOldA(v: number) { this.oldA.set(this.clampNum(v, 20, 85)); }
  setOldR(v: number) { this.oldR.set(this.clampNum(v, 10, 24)); }
  setNewW(v: number) { this.newW.set(this.clampNum(v, 125, 355)); }
  setNewA(v: number) { this.newA.set(this.clampNum(v, 20, 85)); }
  setNewR(v: number) { this.newR.set(this.clampNum(v, 10, 24)); }
  swapTires() {
    const ow = this.oldW(), oa = this.oldA(), orr = this.oldR();
    this.oldW.set(this.newW()); this.oldA.set(this.newA()); this.oldR.set(this.newR());
    this.newW.set(ow); this.newA.set(oa); this.newR.set(orr);
  }


  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
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
  private updateSeo() {
    const lang = this.translate.lang();
    this.pageTitle.setTitle(this.t('metaTitle'));
    this.meta.updateTag({ name: 'description', content: this.t('metaDescription') });
    this.meta.updateTag({ name: 'keywords', content: this.t('keywords') });
    this.setLink('canonical', `https://jaurtools.com/${lang}/${this.slug}`);
    for (const l of ['en', 'hi', 'ar']) this.setLink('alternate', `https://jaurtools.com/${l}/${this.slug}`, l);
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
      '@type': 'Question', name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    }));
    const json = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity })
      .replace(/</g, '\u003c');
    const el = this.document.createElement('script');
    el.type = 'application/ld+json';
    el.textContent = json;
    this.document.head.appendChild(el);
    this.jsonLdEl = el;
  }
}
