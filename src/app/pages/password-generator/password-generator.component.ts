import { DOCUMENT } from '@angular/common';
import { Component, computed, effect, HostListener, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

const SLUG = 'password-generator';
const SITE_URL = 'https://jaurtools.com';
const MIN_LEN = 8;
const MAX_LEN = 64;
const GUESSES_PER_SECOND = 1e10;

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.<>?';

/** Built-in wordlist for passphrase mode (128 common words = 7 bits of entropy each). */
const WORDS = [
  'able', 'about', 'above', 'actor', 'after', 'again', 'agent', 'agree', 'ahead', 'alarm',
  'alert', 'alike', 'alive', 'allow', 'alone', 'along', 'always', 'among', 'amount', 'angel',
  'anger', 'angle', 'apple', 'apply', 'argue', 'arise', 'array', 'arrow', 'aside', 'avoid',
  'awake', 'award', 'aware', 'bacon', 'badge', 'balance', 'balloon', 'banner', 'basic', 'beach',
  'beard', 'begin', 'behind', 'berry', 'birth', 'blade', 'blame', 'blank', 'blast', 'blend',
  'bless', 'blind', 'block', 'blood', 'bloom', 'board', 'boast', 'body', 'boil', 'bold',
  'boost', 'booth', 'brain', 'brand', 'brave', 'bread', 'break', 'brick', 'bridge', 'brief',
  'bright', 'bring', 'broad', 'brown', 'brush', 'build', 'bunch', 'buyer', 'cabin', 'cable',
  'cake', 'calm', 'camera', 'camp', 'cancel', 'canyon', 'cargo', 'carpet', 'carry', 'catch',
  'cease', 'chain', 'chair', 'chalk', 'change', 'chaos', 'charge', 'chase', 'cheap', 'check',
  'cheese', 'chest', 'chief', 'child', 'choice', 'choose', 'church', 'cider', 'city', 'civil',
  'claim', 'class', 'clean', 'clear', 'clerk', 'click', 'cliff', 'climb', 'clock', 'close',
  'cloth', 'cloud', 'coach', 'coast', 'comic', 'comfort', 'common', 'coral',
];

type Band = 'weak' | 'fair' | 'good' | 'strong' | 'excellent';
type Mode = 'random' | 'passphrase';

const BANDS: Band[] = ['weak', 'fair', 'good', 'strong', 'excellent'];

@Component({
  selector: 'app-password-generator',
  standalone: true,
  imports: [FormsModule, RouterLink, IconComponent, MicroRatingComponent],
  templateUrl: './password-generator.component.html',
  styleUrl: './password-generator.component.scss',
})
export class PasswordGeneratorComponent implements OnInit, OnDestroy {
  protected tr = inject(TranslateService);
  private title = inject(Title);
  private meta = inject(Meta);
  private doc = inject(DOCUMENT);

  readonly slug = SLUG;
  readonly mode = signal<Mode>('random');
  readonly length = signal(16);
  readonly useUpper = signal(true);
  readonly useLower = signal(true);
  readonly useDigits = signal(true);
  readonly useSymbols = signal(true);
  readonly excludeAmbiguous = signal(false);
  readonly wordCount = signal(4);
  readonly separator = signal('-');
  readonly password = signal('');
  readonly copied = signal(false);
  readonly bulkCount = signal(10);
  readonly bulkList = signal<string[]>([]);

  readonly minLen = MIN_LEN;
  readonly maxLen = MAX_LEN;
  readonly relatedSlugs = ['qr-code-generator'];

  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  private locale = computed(() => {
    const lang = this.tr.lang();
    if (lang === 'hi') return 'hi-IN';
    if (lang === 'ar') return 'ar-SA-u-ca-gregory';
    return 'en-US';
  });
  private numFmt = computed(() => new Intl.NumberFormat(this.locale()));

  readonly sets = computed<string[]>(() => {
    const clean = (chars: string, ambiguous: string): string =>
      this.excludeAmbiguous()
        ? chars
            .split('')
            .filter((c) => !ambiguous.includes(c))
            .join('')
        : chars;
    const out: string[] = [];
    if (this.useUpper()) out.push(clean(UPPER, 'IO'));
    if (this.useLower()) out.push(clean(LOWER, 'l'));
    if (this.useDigits()) out.push(clean(DIGITS, '10'));
    if (this.useSymbols()) out.push(SYMBOLS);
    return out;
  });

  readonly poolSize = computed(() => this.sets().reduce((n, s) => n + s.length, 0));

  readonly entropy = computed(() => {
    if (this.mode() === 'passphrase') {
      return this.wordCount() * Math.log2(WORDS.length);
    }
    const pool = this.poolSize();
    if (pool < 2) return 0;
    return this.length() * Math.log2(pool);
  });

  readonly band = computed<Band>(() => {
    const e = this.entropy();
    if (e < 45) return 'weak';
    if (e < 60) return 'fair';
    if (e < 80) return 'good';
    if (e < 100) return 'strong';
    return 'excellent';
  });

  readonly bandIndex = computed(() => BANDS.indexOf(this.band()));
  readonly segments = [0, 1, 2, 3, 4];

  readonly bandPct = computed(() => Math.min(100, Math.round((this.entropy() / 128) * 100)));

  readonly crackText = computed(() => {
    const bits = this.entropy();
    const log10Seconds = (bits - 1) * Math.log10(2) - Math.log10(GUESSES_PER_SECOND);
    if (bits <= 0) return this.t('ui.crackInstant');
    if (log10Seconds > 18) return this.t('ui.crackUniverse');
    const seconds = Math.pow(10, log10Seconds);
    const put = (key: string, n: number): string =>
      this.t(`ui.${key}`).replace('{n}', this.numFmt().format(Math.round(n)));
    if (seconds < 1) return this.t('ui.crackInstant');
    if (seconds < 60) return put('crackSeconds', seconds);
    if (seconds < 3600) return put('crackMinutes', seconds / 60);
    if (seconds < 86400) return put('crackHours', seconds / 3600);
    if (seconds < 31557600) return put('crackDays', seconds / 86400);
    return put('crackYears', seconds / 31557600);
  });

  readonly canGenerate = computed(() =>
    this.mode() === 'passphrase' ? true : this.sets().length > 0,
  );

  segClass(i: number): string {
    return i <= this.bandIndex() ? `on-${this.band()}` : '';
  }

  private seo = effect(() => {
    const lang = this.tr.lang();
    this.title.setTitle(this.t('metaTitle'));
    this.meta.updateTag({ name: 'description', content: this.t('metaDescription') });
    this.upsertLink('seo-canonical', { rel: 'canonical', href: `${SITE_URL}/${lang}/${SLUG}` });
    for (const code of ['en', 'hi', 'ar']) {
      this.upsertLink(`seo-alt-${code}`, {
        rel: 'alternate',
        hreflang: code,
        href: `${SITE_URL}/${code}/${SLUG}`,
      });
    }
    this.upsertLink('seo-alt-x-default', {
      rel: 'alternate',
      hreflang: 'x-default',
      href: `${SITE_URL}/en/${SLUG}`,
    });
    this.upsertFaqJsonLd();
  });

  ngOnInit(): void {
    this.generate();
  }

  ngOnDestroy(): void {
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.doc.getElementById(`faq-jsonld-${SLUG}`)?.remove();
    this.doc.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const el = e.target as HTMLElement | null;
    const tag = el?.tagName ?? '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'c') this.copy();
    else if (key === 'r') this.generate();
    else if (key === 'g') this.generateBulk();
  }

  t(path: string): string {
    this.tr.lang();
    return this.tr.t(`${SLUG}.${path}`) as string;
  }

  list(path: string): string[] {
    this.tr.lang();
    return this.tr.t(`${SLUG}.${path}`) as unknown as string[];
  }

  faqs(): Array<{ q: string; a: string }> {
    this.tr.lang();
    return this.tr.t(`${SLUG}.faqs`) as unknown as Array<{ q: string; a: string }>;
  }

  relatedName(slug: string): string {
    this.tr.lang();
    const name = this.tr.t(`${slug}.name`) as string;
    return typeof name === 'string' && name ? name : slug;
  }

  fmt(n: number): string {
    return this.numFmt().format(Math.round(n));
  }

  setMode(mode: Mode): void {
    this.mode.set(mode);
    this.generate();
  }

  generate(): void {
    if (this.mode() === 'passphrase') this.generatePassphrase();
    else this.generateRandom();
  }

  private generateRandom(): void {
    const charSets = this.sets();
    const len = this.length();
    if (charSets.length === 0 || len < 1) return;
    const pool = charSets.join('');
    const buf = new Uint32Array(len);
    crypto.getRandomValues(buf);
    const chars = Array.from(buf, (n) => pool[n % pool.length]);
    const extra = new Uint32Array(charSets.length * 2);
    crypto.getRandomValues(extra);
    charSets.forEach((set, i) => {
      chars[extra[i * 2] % len] = set[extra[i * 2 + 1] % set.length];
    });
    this.password.set(chars.join(''));
    this.copied.set(false);
  }

  private generatePassphrase(): void {
    const n = this.wordCount();
    const sep = this.separator();
    const buf = new Uint32Array(n);
    crypto.getRandomValues(buf);
    const words = Array.from(buf, (v) => WORDS[v % WORDS.length]);
    this.password.set(words.join(sep));
    this.copied.set(false);
  }

  generateBulk(): void {
    const count = Math.min(100, Math.max(1, this.bulkCount()));
    this.bulkCount.set(count);
    const out: string[] = [];
    const keep = this.password();
    for (let i = 0; i < count; i++) {
      this.generate();
      out.push(this.password());
    }
    this.password.set(keep);
    this.bulkList.set(out);
    this.copied.set(false);
  }

  downloadBulk(format: 'txt' | 'csv'): void {
    const list = this.bulkList();
    if (list.length === 0) return;
    const body =
      format === 'csv'
        ? 'index,password\n' + list.map((p, i) => `${i + 1},"${p.replace(/"/g, '""')}"`).join('\n')
        : list.join('\n');
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.doc.createElement('a');
    a.href = url;
    a.download = `passwords.${format}`;
    this.doc.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  onLengthInput(value: string): void {
    const n = Math.min(MAX_LEN, Math.max(MIN_LEN, Number(value) || MIN_LEN));
    this.length.set(n);
  }

  onWordCountInput(value: string): void {
    const n = Math.min(8, Math.max(3, Number(value) || 4));
    this.wordCount.set(n);
  }

  onBulkCountInput(value: string): void {
    const n = Math.min(100, Math.max(1, Number(value) || 10));
    this.bulkCount.set(n);
  }

  toggle(set: 'upper' | 'lower' | 'digits' | 'symbols' | 'ambiguous'): void {
    if (set === 'upper') this.useUpper.update((v) => !v);
    else if (set === 'lower') this.useLower.update((v) => !v);
    else if (set === 'digits') this.useDigits.update((v) => !v);
    else if (set === 'symbols') this.useSymbols.update((v) => !v);
    else this.excludeAmbiguous.update((v) => !v);
    if (this.canGenerate()) this.generate();
  }

  async copy(): Promise<void> {
    const value = this.password();
    if (!value) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value).catch(() => undefined);
      } else {
        throw new Error('no clipboard api');
      }
    } catch {
      const ta = this.doc.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      this.doc.body.appendChild(ta);
      ta.select();
      this.doc.execCommand('copy');
      ta.remove();
    }
    this.copied.set(true);
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
  }

  private upsertLink(id: string, attrs: Record<string, string>): void {
    let el = this.doc.head.querySelector<HTMLLinkElement>(`#${id}`);
    if (!el) {
      el = this.doc.createElement('link');
      el.id = id;
      this.doc.head.appendChild(el);
    }
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  }

  private upsertFaqJsonLd(): void {
    const id = `faq-jsonld-${SLUG}`;
    this.doc.getElementById(id)?.remove();
    const data = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: this.faqs().map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    };
    const script = this.doc.createElement('script');
    script.id = id;
    script.type = 'application/ld+json';
    script.text = JSON.stringify(data).replace(/</g, '\\u003c');
    this.doc.head.appendChild(script);
  }
}
