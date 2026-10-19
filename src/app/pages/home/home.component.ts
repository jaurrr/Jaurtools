import { Component, ElementRef, OnDestroy, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';

import { CATEGORIES, toolBySlug, toolsByCategory } from '../../core/tools-registry';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface VoiceRecognizer {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  abort(): void;
}

interface LabelItem {
  title: string;
  text: string;
}

interface WhyItem extends LabelItem {
  icon: string;
}

const TRENDING_SLUGS = [
  'sip-calculator',
  'emi-calculator',
  'bmi-calculator',
  'age-calculator',
  'qr-code-generator',
  'password-generator',
  'word-counter',
  'percentage-calculator',
  'loan-calculator',
  'unit-converter',
  'gst-calculator',
  'income-tax-calculator',
  'fixed-deposit-calculator',
  'date-calculator',
  'merge-pdf',
  'compress-pdf',
  'image-compressor',
  'color-picker',
  'json-formatter',
  'base64-encoder-decoder',
  'url-encoder-decoder',
  'pan-validator',
  'qr-code-scanner',
  'image-resizer',
  'solid-background-remover',
];

const HERO_FLOAT_ICONS = ['calculator', 'qr-code', 'file-text', 'type', 'percent', 'clock', 'zap', 'ruler'];

const RECENT_STORAGE_KEY = 'jt-recent';
const RECENT_MAX = 12;
const RECENT_SHOWN = 6;

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, IconComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnDestroy {
  readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  @ViewChild('searchBox') private searchBox?: ElementRef<HTMLInputElement>;

  readonly categories = CATEGORIES;
  readonly letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  readonly heroIcons = HERO_FLOAT_ICONS;

  readonly trendingTools = TRENDING_SLUGS.flatMap((slug) => {
    const entry = toolBySlug(slug);
    return entry ? [entry] : [];
  });

  readonly trustBadges = [
    { icon: 'zap', label: 'home.badgeNoInstall' },
    { icon: 'lock', label: 'home.badgeNoLogin' },
    { icon: 'shield-check', label: 'home.badgePrivacy' },
    { icon: 'database', label: 'home.badgeNoDatabase' },
    { icon: 'server-off', label: 'home.badgeNoServer' },
    { icon: 'heart-pulse', label: 'home.badgeNoTension' },
  ];

  readonly steps: LabelItem[] = [
    { title: 'home.step1Title', text: 'home.step1Text' },
    { title: 'home.step2Title', text: 'home.step2Text' },
    { title: 'home.step3Title', text: 'home.step3Text' },
  ];

  readonly whyItems: WhyItem[] = [
    { icon: 'user-x', title: 'home.why1Title', text: 'home.why1Text' },
    { icon: 'globe', title: 'home.why2Title', text: 'home.why2Text' },
    { icon: 'smartphone', title: 'home.why3Title', text: 'home.why3Text' },
    { icon: 'sparkles', title: 'home.why4Title', text: 'home.why4Text' },
  ];

  readonly query = signal('');
  readonly listening = signal(false);
  readonly voiceSupported = signal(false);
  readonly recentSlugs = signal<string[]>([]);
  private voice: VoiceRecognizer | null = null;

  readonly recentTools = computed(() =>
    this.recentSlugs().flatMap((slug) => {
      const entry = toolBySlug(slug);
      return entry ? [entry] : [];
    }),
  );

  private readonly slashKeyHandler = (event: KeyboardEvent): void => {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase() ?? '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return;
    event.preventDefault();
    this.searchBox?.nativeElement.focus();
  };

  constructor() {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    this.voiceSupported.set(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    this.recentSlugs.set(this.readRecent());

    this.document.addEventListener('keydown', this.slashKeyHandler);

    effect(() => {
      const lang = this.translate.lang();
      this.pageTitle.setTitle(this.translate.t('home.metaTitle'));
      this.meta.updateTag({ name: 'description', content: this.translate.t('home.metaDescription') });
      this.setSeoLinks(lang, '');
    });
  }

  ngOnDestroy(): void {
    this.document.removeEventListener('keydown', this.slashKeyHandler);
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  onSearchSubmit(event: Event): void {
    event.preventDefault();
    const q = this.query().trim();
    this.router.navigate(['/', this.translate.lang(), 'search'], {
      queryParams: q ? { q } : {},
    });
  }

  startVoice(): void {
    const w = window as unknown as {
      SpeechRecognition?: new () => VoiceRecognizer;
      webkitSpeechRecognition?: new () => VoiceRecognizer;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    try {
      this.voice?.abort();
      const rec = new Ctor();
      this.voice = rec;
      const lang = this.translate.lang();
      rec.lang = lang === 'hi' ? 'hi-IN' : lang === 'ar' ? 'ar-SA' : 'en-US';
      rec.interimResults = false;
      rec.onresult = (event) => {
        const text = event.results?.[0]?.[0]?.transcript?.trim() ?? '';
        if (text) {
          this.query.set(text);
          this.router.navigate(['/', this.translate.lang(), 'search'], { queryParams: { q: text } });
        }
      };
      const done = () => this.listening.set(false);
      rec.onend = done;
      rec.onerror = done;
      this.listening.set(true);
      rec.start();
    } catch {
      this.listening.set(false);
    }
  }

  toolName(slug: string): string {
    return this.translate.t(`${slug}.name`);
  }

  toolDesc(slug: string): string {
    const raw = this.translate.t(`${slug}.tagline`);
    const text = typeof raw === 'string' ? raw : '';
    return text.length > 96 ? `${text.slice(0, 96).trimEnd()}…` : text;
  }

  toolCount(categoryId: string): number {
    return toolsByCategory(categoryId).length;
  }

  clearRecent(): void {
    try {
      localStorage.removeItem(RECENT_STORAGE_KEY);
    } catch {
      // storage unavailable — just clear the in-memory list
    }
    this.recentSlugs.set([]);
  }

  private readRecent(): string[] {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY) ?? '[]');
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((slug): slug is string => typeof slug === 'string' && toolBySlug(slug) !== undefined)
        .slice(0, RECENT_SHOWN);
    } catch {
      return [];
    }
  }

  private setSeoLinks(lang: string, path: string): void {
    const doc = this.document;
    if (!doc?.head) return;
    const url = (l: string) => `https://jaurtools.com/${l}${path ? `/${path}` : '/'}`;
    this.setLink(doc, 'canonical', url(lang));
    for (const l of ['en', 'hi', 'ar']) this.setLink(doc, 'alternate', url(l), l);
    this.setLink(doc, 'alternate', url('en'), 'x-default');
  }

  private setLink(doc: Document, rel: string, href: string, hreflang?: string): void {
    const selector = hreflang ? `link[rel="${rel}"][hreflang="${hreflang}"]` : `link[rel="${rel}"]:not([hreflang])`;
    let el = doc.head.querySelector<HTMLLinkElement>(selector);
    if (!el) {
      el = doc.createElement('link');
      el.rel = rel;
      if (hreflang) el.hreflang = hreflang;
      doc.head.appendChild(el);
    }
    el.href = href;
  }
}
