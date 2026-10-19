import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

const EN_ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function enUnderThousand(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h > 0) {
    parts.push(EN_ONES[h] + ' hundred');
    if (rest > 0) parts.push('and');
  }
  if (rest > 0) {
    if (rest < 20) parts.push(EN_ONES[rest]);
    else parts.push(EN_TENS[Math.floor(rest / 10)] + (rest % 10 > 0 ? '-' + EN_ONES[rest % 10] : ''));
  }
  return parts.join(' ');
}

function enWords(n: number): string {
  if (n === 0) return 'zero';
  if (n < 0) return 'minus ' + enWords(-n);
  const scales: [number, string][] = [
    [1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand'],
  ];
  const parts: string[] = [];
  let rest = n;
  for (const [scale, name] of scales) {
    const count = Math.floor(rest / scale);
    if (count > 0) {
      parts.push(enUnderThousand(count) + ' ' + name);
      rest -= count * scale;
    }
  }
  if (rest > 0) parts.push(enUnderThousand(rest));
  return parts.join(' ');
}

const HI_99 = ['शून्य', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ', 'दस',
  'ग्यारह', 'बारह', 'तेरह', 'चौदह', 'पंद्रह', 'सोलह', 'सत्रह', 'अठारह', 'उन्नीस',
  'बीस', 'इक्कीस', 'बाईस', 'तेईस', 'चौबीस', 'पच्चीस', 'छब्बीस', 'सत्ताईस', 'अट्ठाईस', 'उनतीस',
  'तीस', 'इकतीस', 'बत्तीस', 'तैंतीस', 'चौंतीस', 'पैंतीस', 'छत्तीस', 'सैंतीस', 'अड़तीस', 'उनतालीस',
  'चालीस', 'इकतालीस', 'बयालीस', 'तैंतालीस', 'चवालीस', 'पैंतालीस', 'छियालीस', 'सैंतालीस', 'अड़तालीस', 'उनचास',
  'पचास', 'इक्यावन', 'बावन', 'तिरपन', 'चौवन', 'पचपन', 'छप्पन', 'सत्तावन', 'अट्ठावन', 'उनसठ',
  'साठ', 'इकसठ', 'बासठ', 'तिरसठ', 'चौंसठ', 'पैंसठ', 'छियासठ', 'सड़सठ', 'अट्ठसठ', 'उनहत्तर',
  'सत्तर', 'इकहत्तर', 'बहत्तर', 'तिहत्तर', 'चौहत्तर', 'पचहत्तर', 'छिहत्तर', 'सतहत्तर', 'अठहत्तर', 'उन्यासी',
  'अस्सी', 'इक्यासी', 'बयासी', 'तिरासी', 'चौरासी', 'पचासी', 'छियासी', 'सत्तासी', 'अट्ठासी', 'नवासी',
  'नब्बे', 'इक्यानवे', 'बानवे', 'तिरानवे', 'चौरानवे', 'पचानवे', 'छियानवे', 'सत्तानवे', 'अट्ठानवे', 'निन्यानवे'];

function hiWords(n: number): string {
  if (n === 0) return 'शून्य';
  if (n < 0) return 'ऋण ' + hiWords(-n);
  const parts: string[] = [];
  let rest = n;
  const crore = Math.floor(rest / 1e7);
  if (crore > 0) { parts.push(hiUnderThousand(crore) + ' करोड़'); rest -= crore * 1e7; }
  const lakh = Math.floor(rest / 1e5);
  if (lakh > 0) { parts.push(hiUnderThousand(lakh) + ' लाख'); rest -= lakh * 1e5; }
  const thousand = Math.floor(rest / 1e3);
  if (thousand > 0) { parts.push(hiUnderThousand(thousand) + ' हज़ार'); rest -= thousand * 1e3; }
  if (rest > 0) parts.push(hiUnderThousand(rest));
  return parts.join(' ');
}

function hiUnderThousand(n: number): string {
  if (n < 100) return HI_99[n];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return HI_99[h] + ' सौ' + (rest > 0 ? ' ' + HI_99[rest] : '');
}

const AR_ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
const AR_ONES_ACC = ['', 'واحدًا', 'اثنين', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
const AR_TENS = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];

function arUnderHundred(n: number): string {
  if (n < 10) return AR_ONES[n];
  if (n === 10) return 'عشرة';
  if (n === 11) return 'أحد عشر';
  if (n === 12) return 'اثنا عشر';
  if (n < 20) return AR_ONES_ACC[n - 10] + ' عشر';
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o === 0 ? AR_TENS[t] : AR_ONES[o] + ' و' + AR_TENS[t];
}

const AR_HUNDREDS = ['', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

function arUnderThousand(n: number): string {
  if (n < 100) return arUnderHundred(n);
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const head = AR_HUNDREDS[h];
  return rest === 0 ? head : head + ' و' + arUnderHundred(rest);
}

function arGroup(count: number, one: string, two: string, few: string, many: string): string {
  if (count === 1) return one;
  if (count === 2) return two;
  if (count <= 10) return arUnderThousand(count) + ' ' + few;
  if (count < 100) return arUnderHundred(count) + ' ' + many;
  return arUnderThousand(count) + ' ' + one;
}

function arWords(n: number): string {
  if (n === 0) return 'صفر';
  if (n < 0) return 'سالب ' + arWords(-n);
  const parts: string[] = [];
  let rest = n;
  const millions = Math.floor(rest / 1e6);
  if (millions > 0) { parts.push(arGroup(millions, 'مليون', 'مليونان', 'ملايين', 'مليونًا')); rest -= millions * 1e6; }
  const thousands = Math.floor(rest / 1e3);
  if (thousands > 0) { parts.push(arGroup(thousands, 'ألف', 'ألفان', 'آلاف', 'ألفًا')); rest -= thousands * 1e3; }
  if (rest > 0) parts.push(arUnderThousand(rest));
  return parts.join(' و');
}


@Component({
  selector: 'app-number-to-words-converter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './number-to-words-converter.component.html',
  styleUrl: './number-to-words-converter.component.scss',
})
export class NumberToWordsConverterComponent implements OnDestroy {
  readonly slug = 'number-to-words-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['number-converter', 'url-encoder-decoder', 'length-converter', 'time-unit-converter'];

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

  readonly numText = signal('12345');

  readonly parsed = computed(() => {
    const s = this.numText().replace(/[\s,]/g, '').trim();
    if (!/^-?\d+$/.test(s)) return null;
    const n = Number(s);
    if (!Number.isSafeInteger(n) || Math.abs(n) >= 1e15) return null;
    return n;
  });

  readonly words = computed(() => {
    const n = this.parsed();
    if (n === null) return '';
    const lang = this.translate.lang();
    if (lang === 'hi') return hiWords(n);
    if (lang === 'ar') return Math.abs(n) >= 1e9 ? '' : arWords(n);
    return enWords(n);
  });

  readonly wordsFailed = computed(() => this.parsed() !== null && this.words() === '');

  readonly formatted = computed(() => {
    const n = this.parsed();
    if (n === null) return '';
    return new Intl.NumberFormat(this.locale()).format(n);
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
    return Math.min(max, Math.max(min, Math.round(v * 10000) / 10000));
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
