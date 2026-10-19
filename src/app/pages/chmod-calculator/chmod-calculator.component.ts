import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type PermClass = 'owner' | 'group' | 'other';
type PermBit = 'r' | 'w' | 'x';
interface Perm {
  r: boolean;
  w: boolean;
  x: boolean;
}

@Component({
  selector: 'app-chmod-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './chmod-calculator.component.html',
  styleUrl: './chmod-calculator.component.scss',
})
export class ChmodCalculatorComponent implements OnDestroy {
  readonly slug = 'chmod-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['cron-builder', 'csp-generator', 'bcrypt-hash-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly classes: PermClass[] = ['owner', 'group', 'other'];
  readonly bits: PermBit[] = ['r', 'w', 'x'];

  readonly perms = signal<Record<PermClass, Perm>>({
    owner: { r: true, w: true, x: true },
    group: { r: true, w: false, x: true },
    other: { r: true, w: false, x: true },
  });
  readonly setuid = signal(false);
  readonly setgid = signal(false);
  readonly sticky = signal(false);
  readonly octalInput = signal('755');
  readonly symbolicInput = signal('rwxr-xr-x');
  readonly error = signal('');
  readonly copiedKey = signal('');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private digitOf(p: Perm): number {
    return (p.r ? 4 : 0) + (p.w ? 2 : 0) + (p.x ? 1 : 0);
  }

  readonly octal3 = computed(() => {
    const p = this.perms();
    return `${this.digitOf(p.owner)}${this.digitOf(p.group)}${this.digitOf(p.other)}`;
  });

  readonly specialDigit = computed(
    () => (this.setuid() ? 4 : 0) + (this.setgid() ? 2 : 0) + (this.sticky() ? 1 : 0),
  );

  readonly octal4 = computed(() =>
    this.specialDigit() === 0 ? this.octal3() : `${this.specialDigit()}${this.octal3()}`,
  );

  private symClass(p: Perm, special: boolean, specialChar: 's' | 't'): string {
    const r = p.r ? 'r' : '-';
    const w = p.w ? 'w' : '-';
    let x: string;
    if (special) {
      x = p.x ? specialChar : specialChar.toUpperCase();
    } else {
      x = p.x ? 'x' : '-';
    }
    return r + w + x;
  }

  readonly symbolic = computed(() => {
    const p = this.perms();
    return (
      this.symClass(p.owner, this.setuid(), 's') +
      this.symClass(p.group, this.setgid(), 's') +
      this.symClass(p.other, this.sticky(), 't')
    );
  });

  readonly verbose = computed(() => {
    const p = this.perms();
    const v = (q: Perm) => `${q.r ? 'r' : ''}${q.w ? 'w' : ''}${q.x ? 'x' : ''}` || '-';
    return `u=${v(p.owner)},g=${v(p.group)},o=${v(p.other)}`;
  });

  readonly chmodCommand = computed(
    () => `chmod ${this.octal4()} ${this.t('labels.filePlaceholder')}`,
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

  permBit(cls: PermClass, bit: PermBit): boolean {
    return this.perms()[cls][bit];
  }

  classLabel(c: PermClass): string {
    return this.t(`labels.${c}Label`);
  }

  bitLabel(b: PermBit): string {
    return this.t(`labels.${b}Label`);
  }

  toggleBit(cls: PermClass, bit: PermBit): void {
    const p = this.perms();
    this.perms.set({ ...p, [cls]: { ...p[cls], [bit]: !p[cls][bit] } });
    this.error.set('');
    this.syncInputs();
  }

  toggleSpecial(which: 'setuid' | 'setgid' | 'sticky'): void {
    if (which === 'setuid') {
      this.setuid.set(!this.setuid());
    } else if (which === 'setgid') {
      this.setgid.set(!this.setgid());
    } else {
      this.sticky.set(!this.sticky());
    }
    this.error.set('');
    this.syncInputs();
  }

  setOctalInput(v: string): void {
    this.octalInput.set(v);
  }

  setSymbolicInput(v: string): void {
    this.symbolicInput.set(v);
  }

  applyOctal(): void {
    const v = this.octalInput().trim();
    if (!/^[0-7]{3,4}$/.test(v)) {
      this.error.set(this.t('labels.invalidOctal'));
      return;
    }
    const digits = v.length === 4 ? v.slice(1) : v;
    const special = v.length === 4 ? parseInt(v[0], 8) : 0;
    const mk = (d: string): Perm => {
      const n = parseInt(d, 8);
      return { r: (n & 4) !== 0, w: (n & 2) !== 0, x: (n & 1) !== 0 };
    };
    this.perms.set({ owner: mk(digits[0]), group: mk(digits[1]), other: mk(digits[2]) });
    this.setuid.set((special & 4) !== 0);
    this.setgid.set((special & 2) !== 0);
    this.sticky.set((special & 1) !== 0);
    this.error.set('');
    this.syncInputs();
  }

  applySymbolic(): void {
    const v = this.symbolicInput().trim();
    if (!/^[rwxstST-]{9}$/.test(v)) {
      this.error.set(this.t('labels.invalidSymbolic'));
      return;
    }
    const parseCls = (s: string, specialChar: 's' | 't'): { perm: Perm; special: boolean } => {
      const perm: Perm = { r: s[0] === 'r', w: s[1] === 'w', x: false };
      let special = false;
      const c = s[2];
      if (c === 'x') {
        perm.x = true;
      } else if (c === specialChar) {
        perm.x = true;
        special = true;
      } else if (c === specialChar.toUpperCase()) {
        perm.x = false;
        special = true;
      }
      return { perm, special };
    };
    const o = parseCls(v.slice(0, 3), 's');
    const g = parseCls(v.slice(3, 6), 's');
    const tCls = parseCls(v.slice(6, 9), 't');
    this.perms.set({ owner: o.perm, group: g.perm, other: tCls.perm });
    this.setuid.set(o.special);
    this.setgid.set(g.special);
    this.sticky.set(tCls.special);
    this.error.set('');
    this.syncInputs();
  }

  copy(text: string, key: string): void {
    const done = () => {
      this.copiedKey.set(key);
      window.setTimeout(() => this.copiedKey.set(''), 2000);
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

  private syncInputs(): void {
    this.octalInput.set(this.octal4());
    this.symbolicInput.set(this.symbolic());
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
