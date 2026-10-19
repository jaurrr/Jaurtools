import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const TEST_SECONDS = 5;

@Component({
  selector: 'app-mouse-tester',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './mouse-tester.component.html',
  styleUrl: './mouse-tester.component.scss',
})
export class MouseTesterComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.cps().toFixed(1));
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

  readonly slug = 'mouse-tester';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['keyboard-tester', 'key-rollover-test', 'touchscreen-test', 'gamepad-tester'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly buttonCounts = signal<Record<number, number>>({ 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 });
  readonly lastButton = signal(-1);

  readonly cpsRunning = signal(false);
  readonly cpsClicks = signal(0);
  readonly cpsLeft = signal(TEST_SECONDS);
  readonly bestCps = signal(0);

  readonly dblCount = signal(0);
  readonly dblLast = signal(0);

  readonly scrollUp = signal(0);
  readonly scrollDown = signal(0);

  private tickId: ReturnType<typeof setInterval> | null = null;
  private endId: ReturnType<typeof setTimeout> | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly cps = computed(() =>
    this.cpsClicks() > 0 ? this.cpsClicks() / TEST_SECONDS : 0
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

  buttonName(n: number): string {
    const keys = ['btnLeft', 'btnMiddle', 'btnRight', 'btnBack', 'btnForward'];
    return this.t('labels.' + (keys[n] ?? 'btnLeft'));
  }

  onButtonDown(e: MouseEvent) {
    e.preventDefault();
    const n = e.button;
    this.lastButton.set(n);
    this.buttonCounts.set({ ...this.buttonCounts(), [n]: (this.buttonCounts()[n] ?? 0) + 1 });
  }

  startCps() {
    this.stopCpsTimers();
    this.cpsClicks.set(0);
    this.cpsLeft.set(TEST_SECONDS);
    this.cpsRunning.set(true);
    const started = Date.now();
    this.tickId = setInterval(() => {
      const left = TEST_SECONDS - (Date.now() - started) / 1000;
      this.cpsLeft.set(Math.max(0, Math.round(left * 10) / 10));
    }, 100);
    this.endId = setTimeout(() => {
      this.stopCpsTimers();
      this.cpsRunning.set(false);
      if (this.cps() > this.bestCps()) this.bestCps.set(this.cps());
    }, TEST_SECONDS * 1000);
  }

  onCpsClick() {
    if (this.cpsRunning()) this.cpsClicks.set(this.cpsClicks() + 1);
  }

  onDblClick() {
    this.dblCount.set(this.dblCount() + 1);
  }

  onWheel(e: WheelEvent) {
    e.preventDefault();
    if (e.deltaY > 0) this.scrollDown.set(this.scrollDown() + 1);
    else if (e.deltaY < 0) this.scrollUp.set(this.scrollUp() + 1);
  }

  resetAll() {
    this.stopCpsTimers();
    this.buttonCounts.set({ 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 });
    this.lastButton.set(-1);
    this.cpsRunning.set(false);
    this.cpsClicks.set(0);
    this.cpsLeft.set(TEST_SECONDS);
    this.bestCps.set(0);
    this.dblCount.set(0);
    this.dblLast.set(0);
    this.scrollUp.set(0);
    this.scrollDown.set(0);
  }

  private stopCpsTimers() {
    if (this.tickId) clearInterval(this.tickId);
    if (this.endId) clearTimeout(this.endId);
    this.tickId = null;
    this.endId = null;
  }

  ngOnDestroy() {
    this.stopCpsTimers();
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
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
