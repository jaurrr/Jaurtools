import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-sig-figs-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './sig-figs-calculator.component.html',
  styleUrl: './sig-figs-calculator.component.scss',
})
export class SigFigsCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.analysis().count);
  copyMain(): void {
    const text = String(this.copyText());
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

  readonly slug = 'sig-figs-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['speed-calculator', 'voltage-drop-calculator', 'transistor-bias-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);


  readonly inputText = signal('0.004070');
  readonly targetSig = signal(3);


  private parseParts(): { mantissa: string; digits: string; hasDot: boolean; valid: boolean; value: number } {
    const raw = this.inputText().trim();
    const value = Number(raw);
    if (!raw || !Number.isFinite(value)) {
      return { mantissa: '', digits: '', hasDot: false, valid: false, value: NaN };
    }
    let m = raw.replace(/^[+-]/, '').split(/[eE]/)[0];
    return { mantissa: m, digits: m.replace('.', ''), hasDot: m.includes('.'), valid: true, value };
  }

  readonly analysis = computed(() => {
    const p = this.parseParts();
    if (!p.valid || !p.digits) return { count: 0, first: 0, last: -1, value: NaN };
    const d = p.digits;
    let first = -1;
    for (let i = 0; i < d.length; i++) {
      if (d[i] !== '0') { first = i; break; }
    }
    if (first === -1) {
      return { count: d.length, first: 0, last: d.length - 1, value: p.value };
    }
    let last = d.length - 1;
    if (!p.hasDot) {
      last = first;
      for (let i = d.length - 1; i >= first; i--) {
        if (d[i] !== '0') { last = i; break; }
      }
    }
    return { count: last - first + 1, first, last, value: p.value };
  });

  readonly segments = computed((): Array<{ ch: string; sig: boolean }> => {
    const p = this.parseParts();
    const a = this.analysis();
    if (!p.valid) return [];
    const segs: Array<{ ch: string; sig: boolean }> = [];
    let di = 0;
    for (const ch of p.mantissa) {
      if (ch >= '0' && ch <= '9') {
        segs.push({ ch, sig: di >= a.first && di <= a.last });
        di++;
      } else {
        segs.push({ ch, sig: false });
      }
    }
    return segs;
  });

  readonly rounded = computed(() => {
    const a = this.analysis();
    const n = this.targetSig();
    if (!a.count || !Number.isFinite(a.value)) return '';
    const v = a.value;
    if (v === 0) return '0';
    const mag = Math.floor(Math.log10(Math.abs(v)));
    const factor = 10 ** (n - 1 - mag);
    const r = Math.round(v * factor) / factor;
    return r.toPrecision(n);
  });

  readonly scientific = computed(() => {
    const a = this.analysis();
    if (!a.count || !Number.isFinite(a.value)) return '';
    return a.value.toExponential(4).replace('e', ' × 10^');
  });

  readonly valid = computed(() => this.parseParts().valid);

  setInputText(v: string) { this.inputText.set(v); }
  setTargetSig(v: number) { this.targetSig.set(this.clampNum(v, 1, 21)); }


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
