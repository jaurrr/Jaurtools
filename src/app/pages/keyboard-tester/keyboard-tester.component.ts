import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface KeyDef {
  code: string;
  label: string;
  wide?: number;
}

interface KeyInfo {
  key: string;
  code: string;
  keyCode: number;
  location: number;
  repeat: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

const KEY_ROWS: KeyDef[][] = [
  [
    { code: 'Escape', label: 'Esc' },
    { code: 'F1', label: 'F1' }, { code: 'F2', label: 'F2' }, { code: 'F3', label: 'F3' },
    { code: 'F4', label: 'F4' }, { code: 'F5', label: 'F5' }, { code: 'F6', label: 'F6' },
    { code: 'F7', label: 'F7' }, { code: 'F8', label: 'F8' }, { code: 'F9', label: 'F9' },
    { code: 'F10', label: 'F10' }, { code: 'F11', label: 'F11' }, { code: 'F12', label: 'F12' },
  ],
  [
    { code: 'Backquote', label: '`' }, { code: 'Digit1', label: '1' }, { code: 'Digit2', label: '2' },
    { code: 'Digit3', label: '3' }, { code: 'Digit4', label: '4' }, { code: 'Digit5', label: '5' },
    { code: 'Digit6', label: '6' }, { code: 'Digit7', label: '7' }, { code: 'Digit8', label: '8' },
    { code: 'Digit9', label: '9' }, { code: 'Digit0', label: '0' }, { code: 'Minus', label: '-' },
    { code: 'Equal', label: '=' }, { code: 'Backspace', label: 'Backspace', wide: 2 },
  ],
  [
    { code: 'Tab', label: 'Tab', wide: 1.6 }, { code: 'KeyQ', label: 'Q' }, { code: 'KeyW', label: 'W' },
    { code: 'KeyE', label: 'E' }, { code: 'KeyR', label: 'R' }, { code: 'KeyT', label: 'T' },
    { code: 'KeyY', label: 'Y' }, { code: 'KeyU', label: 'U' }, { code: 'KeyI', label: 'I' },
    { code: 'KeyO', label: 'O' }, { code: 'KeyP', label: 'P' }, { code: 'BracketLeft', label: '[' },
    { code: 'BracketRight', label: ']' }, { code: 'Backslash', label: '\\' },
  ],
  [
    { code: 'CapsLock', label: 'Caps', wide: 1.9 }, { code: 'KeyA', label: 'A' }, { code: 'KeyS', label: 'S' },
    { code: 'KeyD', label: 'D' }, { code: 'KeyF', label: 'F' }, { code: 'KeyG', label: 'G' },
    { code: 'KeyH', label: 'H' }, { code: 'KeyJ', label: 'J' }, { code: 'KeyK', label: 'K' },
    { code: 'KeyL', label: 'L' }, { code: 'Semicolon', label: ';' }, { code: 'Quote', label: "'" },
    { code: 'Enter', label: 'Enter', wide: 2.2 },
  ],
  [
    { code: 'ShiftLeft', label: 'Shift', wide: 2.4 }, { code: 'KeyZ', label: 'Z' }, { code: 'KeyX', label: 'X' },
    { code: 'KeyC', label: 'C' }, { code: 'KeyV', label: 'V' }, { code: 'KeyB', label: 'B' },
    { code: 'KeyN', label: 'N' }, { code: 'KeyM', label: 'M' }, { code: 'Comma', label: ',' },
    { code: 'Period', label: '.' }, { code: 'Slash', label: '/' }, { code: 'ShiftRight', label: 'Shift', wide: 2.4 },
  ],
  [
    { code: 'ControlLeft', label: 'Ctrl', wide: 1.6 }, { code: 'MetaLeft', label: 'Win', wide: 1.4 },
    { code: 'AltLeft', label: 'Alt', wide: 1.4 }, { code: 'Space', label: 'Space', wide: 7 },
    { code: 'AltRight', label: 'Alt', wide: 1.4 }, { code: 'MetaRight', label: 'Win', wide: 1.4 },
    { code: 'ControlRight', label: 'Ctrl', wide: 1.6 },
  ],
];

@Component({
  selector: 'app-keyboard-tester',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './keyboard-tester.component.html',
  styleUrl: './keyboard-tester.component.scss',
})
export class KeyboardTesterComponent implements OnDestroy {
  readonly slug = 'keyboard-tester';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['key-rollover-test', 'mouse-tester', 'touchscreen-test', 'gamepad-tester'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly keyRows = KEY_ROWS;
  readonly pressedKeys = signal<string[]>([]);
  readonly seenKeys = signal<string[]>([]);
  readonly lastInfo = signal<KeyInfo | null>(null);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly locationLabel = computed(() => {
    const info = this.lastInfo();
    if (!info) return '';
    const key = info.location === 1 ? 'locLeft' : info.location === 2 ? 'locRight' : info.location === 3 ? 'locNumpad' : 'locStandard';
    return this.t('labels.' + key);
  });

  readonly modifierText = computed(() => {
    const info = this.lastInfo();
    if (!info) return '';
    const mods: string[] = [];
    if (info.ctrl) mods.push(this.t('labels.modCtrl'));
    if (info.alt) mods.push(this.t('labels.modAlt'));
    if (info.shift) mods.push(this.t('labels.modShift'));
    if (info.meta) mods.push(this.t('labels.modMeta'));
    return mods.length ? mods.join(' + ') : this.t('labels.modNone');
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

  isDown(code: string): boolean {
    return this.pressedKeys().includes(code);
  }

  focusPanel(el: HTMLElement) {
    el.focus();
  }

  onKeyDown(e: KeyboardEvent) {
    if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    this.lastInfo.set({
      key: e.key === ' ' ? 'Space' : e.key,
      code: e.code,
      keyCode: e.keyCode,
      location: e.location,
      repeat: e.repeat,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      meta: e.metaKey,
    });
    if (!e.repeat) {
      if (!this.pressedKeys().includes(e.code)) {
        this.pressedKeys.set([...this.pressedKeys(), e.code]);
      }
      if (!this.seenKeys().includes(e.code)) {
        this.seenKeys.set([...this.seenKeys(), e.code]);
      }
    }
  }

  onKeyUp(e: KeyboardEvent) {
    this.pressedKeys.set(this.pressedKeys().filter((c) => c !== e.code));
  }

  clearAll() {
    this.pressedKeys.set([]);
    this.seenKeys.set([]);
    this.lastInfo.set(null);
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
