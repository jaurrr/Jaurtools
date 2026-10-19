import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface PadState {
  index: number;
  id: string;
  buttons: boolean[];
  axes: number[];
  hasRumble: boolean;
}

@Component({
  selector: 'app-gamepad-tester',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './gamepad-tester.component.html',
  styleUrl: './gamepad-tester.component.scss',
})
export class GamepadTesterComponent implements OnDestroy {
  readonly slug = 'gamepad-tester';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['keyboard-tester', 'mouse-tester', 'touchscreen-test', 'key-rollover-test'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly pads = signal<PadState[]>([]);
  readonly rumbleMsg = signal('');

  private rafId = 0;
  private jsonLdEl: HTMLScriptElement | null = null;
  private readonly onConnect = () => this.pollOnce();
  private readonly onDisconnect = () => this.pollOnce();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('gamepadconnected', this.onConnect);
      window.addEventListener('gamepaddisconnected', this.onDisconnect);
      this.startPolling();
    }
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly supported = computed(() => typeof navigator !== 'undefined' && 'getGamepads' in navigator);

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

  buttonLabel(i: number): string {
    return this.t('labels.button') + ' ' + (i + 1);
  }

  axisLabel(i: number): string {
    return this.t('labels.axis') + ' ' + i;
  }

  axisPct(v: number): number {
    return Math.round(((v + 1) / 2) * 100);
  }

  async testRumble(pad: PadState) {
    this.rumbleMsg.set('');
    const gps = navigator.getGamepads();
    const gp = gps[pad.index] as Gamepad & { vibrationActuator?: { playEffect: (t: string, o: object) => Promise<void> } } | null;
    const actuator = gp?.vibrationActuator;
    if (!actuator) {
      this.rumbleMsg.set(this.t('labels.rumbleUnsupported'));
      return;
    }
    try {
      await actuator.playEffect('dual-rumble', { duration: 1200, strongMagnitude: 1.0, weakMagnitude: 1.0 });
      this.rumbleMsg.set(this.t('labels.rumbleOk'));
    } catch {
      this.rumbleMsg.set(this.t('labels.rumbleUnsupported'));
    }
  }

  private startPolling() {
    const tick = () => {
      this.pollOnce();
      this.rafId = requestAnimationFrame(tick);
    };
    tick();
  }

  private pollOnce() {
    const raw = navigator.getGamepads();
    const next: PadState[] = [];
    for (const gp of raw) {
      if (!gp || !gp.connected) continue;
      next.push({
        index: gp.index,
        id: gp.id,
        buttons: gp.buttons.map((b) => b.pressed),
        axes: gp.axes.map((a) => Math.round(a * 100) / 100),
        hasRumble: !!(gp as Gamepad & { vibrationActuator?: unknown }).vibrationActuator,
      });
    }
    this.pads.set(next);
  }

  ngOnDestroy() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    window.removeEventListener('gamepadconnected', this.onConnect);
    window.removeEventListener('gamepaddisconnected', this.onDisconnect);
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
