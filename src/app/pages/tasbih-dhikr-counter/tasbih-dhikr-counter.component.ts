import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface Dhikr {
  en: string;
  hi: string;
  ar: string;
}

const DHIKRS: Dhikr[] = [
  { en: 'SubhanAllah', hi: 'सुभानअल्लाह', ar: 'سبحان الله' },
  { en: 'Alhamdulillah', hi: 'अल्हम्दुलिल्लाह', ar: 'الحمد لله' },
  { en: 'Allahu Akbar', hi: 'अल्लाहु अकबर', ar: 'الله أكبر' },
  { en: 'La ilaha illallah', hi: 'ला इलाहा इल्लल्लाह', ar: 'لا إله إلا الله' },
  { en: 'Astaghfirullah', hi: 'अस्तग़फ़िरुल्लाह', ar: 'أستغفر الله' },
];

const PRESETS = [33, 100, 500, 1000];
const STORAGE_KEY = 'jaurtools-tasbih-v1';
const RING_C = 2 * Math.PI * 54;

@Component({
  selector: 'app-tasbih-dhikr-counter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './tasbih-dhikr-counter.component.html',
  styleUrl: './tasbih-dhikr-counter.component.scss',
})
export class TasbihDhikrCounterComponent implements OnDestroy {
  readonly slug = 'tasbih-dhikr-counter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['invitation-maker', 'online-notepad', 'speed-reader'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly navigatorRef: Navigator | null =
    typeof navigator !== 'undefined' ? navigator : null;

  readonly count = signal(0);
  readonly target = signal(100);
  readonly dhikrIndex = signal(0);
  readonly vibrateOn = signal(true);

  readonly dhikrs = DHIKRS;
  readonly presets = PRESETS;
  readonly ringC = RING_C;

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const p = JSON.parse(saved) as { count?: number; target?: number; dhikrIndex?: number };
        if (typeof p.count === 'number' && p.count >= 0) this.count.set(Math.floor(p.count));
        if (typeof p.target === 'number' && p.target > 0) this.target.set(Math.floor(p.target));
        if (typeof p.dhikrIndex === 'number' && DHIKRS[p.dhikrIndex]) this.dhikrIndex.set(p.dhikrIndex);
      }
    } catch {
      // storage unavailable; start fresh
    }
    effect(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ count: this.count(), target: this.target(), dhikrIndex: this.dhikrIndex() })
        );
      } catch {
        // ignore
      }
    });
  }

  readonly rounds = computed(() => {
    const t = this.target();
    if (t <= 0) return 0;
    return Math.floor(this.count() / t);
  });

  readonly progress = computed(() => {
    const t = this.target();
    if (t <= 0) return 0;
    return ((this.count() % t) / t) * 100;
  });

  readonly ringOffset = computed(() => RING_C * (1 - this.progress() / 100));

  readonly inRound = computed(() => {
    const t = this.target();
    if (t <= 0) return 0;
    return this.count() % t;
  });

  dhikrName(d: Dhikr): string {
    const lang = this.translate.lang();
    return lang === 'hi' ? d.hi : lang === 'ar' ? d.ar : d.en;
  }

  tap(): void {
    this.count.update((c) => c + 1);
    const t = this.target();
    if (this.vibrateOn() && this.navigatorRef && 'vibrate' in this.navigatorRef) {
      try {
        if (t > 0 && this.count() % t === 0) this.navigatorRef.vibrate([120, 60, 120]);
        else this.navigatorRef.vibrate(25);
      } catch {
        // vibration not permitted; ignore
      }
    }
  }

  reset(): void {
    this.count.set(0);
  }

  setTarget(v: number): void {
    const next = this.clampNum(v, 1, 100000);
    this.target.set(next);
  }

  setDhikr(i: number): void {
    this.dhikrIndex.set(i);
  }

  toggleVibrate(): void {
    this.vibrateOn.update((v) => !v);
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

  ngOnDestroy(): void {
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

  private updateSeo(): void {
    const lang = this.translate.lang();
    this.pageTitle.setTitle(this.t('metaTitle'));
    this.meta.updateTag({ name: 'description', content: this.t('metaDescription') });
    this.meta.updateTag({ name: 'keywords', content: this.t('keywords') });
    this.setLink('canonical', `https://jaurtools.com/${lang}/${this.slug}`);
    for (const l of ['en', 'hi', 'ar']) {
      this.setLink('alternate', `https://jaurtools.com/${l}/${this.slug}`, l);
    }
  }

  private setLink(rel: string, href: string, hreflang?: string): void {
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

  private refreshJsonLd(): void {
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
