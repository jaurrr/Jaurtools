import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta, DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const SVG_NS = 'http://www.w3.org/2000/svg';
const GEOMETRY_TAGS = ['path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse'];

@Component({
  selector: 'app-svg-stroke-to-fill',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './svg-stroke-to-fill.component.html',
  styleUrl: './svg-stroke-to-fill.component.scss',
})
export class SvgStrokeToFillComponent implements OnDestroy {
  readonly slug = 'svg-stroke-to-fill';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['svg-editor', 'svg-optimizer', 'svg-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly sanitizer = inject(DomSanitizer);

  readonly svgInput = signal(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60">\n' +
      '  <line x1="10" y1="30" x2="110" y2="30" stroke="#4f46e5" stroke-width="10" stroke-linecap="round"/>\n' +
      '  <circle cx="60" cy="30" r="18" fill="none" stroke="#dc2626" stroke-width="6"/>\n</svg>'
  );
  readonly samples = signal(64);
  readonly outputSvg = signal('');
  readonly converted = signal(0);
  readonly skipped = signal(0);
  readonly error = signal('');

  private stageEl: HTMLElement | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly svgValid = computed(() => {
    const src = this.svgInput().trim();
    if (!src) return false;
    try {
      const doc = new DOMParser().parseFromString(src, 'image/svg+xml');
      return doc.querySelector('parsererror') === null && doc.documentElement.nodeName.toLowerCase() === 'svg';
    } catch {
      return false;
    }
  });

  readonly preview = computed((): SafeHtml =>
    this.outputSvg() ? this.sanitizer.bypassSecurityTrustHtml(this.outputSvg()) : ''
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

  setSvgInput(v: string) {
    this.svgInput.set(v);
    this.error.set('');
  }

  setSamples(v: number) {
    this.samples.set(Math.round(this.clampNum(v, 16, 200)));
  }

  private ensureStage(): HTMLElement {
    if (!this.stageEl) {
      this.stageEl = this.document.createElement('div');
      this.stageEl.setAttribute('aria-hidden', 'true');
      this.stageEl.style.cssText = 'position:absolute;left:-9999px;top:0;width:10px;height:10px;overflow:hidden;';
      this.document.body.appendChild(this.stageEl);
    }
    return this.stageEl;
  }

  private strokeWidthOf(el: Element): number {
    const attr = el.getAttribute('stroke-width');
    if (attr) {
      const v = parseFloat(attr);
      if (Number.isFinite(v)) return v;
    }
    return 1;
  }

  convert() {
    this.error.set('');
    this.outputSvg.set('');
    this.converted.set(0);
    this.skipped.set(0);
    if (!this.svgValid()) {
      this.error.set(this.t('labels.errorInvalid'));
      return;
    }
    const stage = this.ensureStage();
    stage.innerHTML = this.svgInput();
    const svg = stage.querySelector('svg');
    if (!svg) {
      this.error.set(this.t('labels.errorInvalid'));
      return;
    }
    const n = this.samples();
    let done = 0;
    let skipped = 0;
    const targets = Array.from(svg.querySelectorAll(GEOMETRY_TAGS.join(',')));
    for (const node of targets) {
      const el = node as unknown as Element & SVGGeometryElement;
      if (el.closest('defs')) {
        continue;
      }
      const stroke = el.getAttribute('stroke');
      if (!stroke || stroke === 'none') continue;
      const w = this.strokeWidthOf(el);
      if (!(w > 0)) continue;
      let len = 0;
      try {
        len = el.getTotalLength();
      } catch {
        skipped += 1;
        continue;
      }
      if (!(len > 0)) {
        skipped += 1;
        continue;
      }
      const tag = el.tagName.toLowerCase();
      const closed = tag === 'polygon' || tag === 'rect' || tag === 'circle' || tag === 'ellipse';
      const count = closed ? n : Math.max(2, n);
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i <= count; i += 1) {
        const p = el.getPointAtLength((len * i) / count);
        pts.push({ x: p.x, y: p.y });
      }
      const left: string[] = [];
      const right: string[] = [];
      for (let i = 0; i < pts.length; i += 1) {
        const p = pts[i];
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(pts.length - 1, i + 1)];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const m = Math.hypot(dx, dy);
        if (m === 0) {
          left.push(`${p.x.toFixed(2)},${p.y.toFixed(2)}`);
          right.push(`${p.x.toFixed(2)},${p.y.toFixed(2)}`);
          continue;
        }
        dx /= m;
        dy /= m;
        const nx = -dy * (w / 2);
        const ny = dx * (w / 2);
        left.push(`${(p.x + nx).toFixed(2)},${(p.y + ny).toFixed(2)}`);
        right.push(`${(p.x - nx).toFixed(2)},${(p.y - ny).toFixed(2)}`);
      }
      const ribbon = this.document.createElementNS(SVG_NS, 'path');
      ribbon.setAttribute('d', `M${left.join(' L')} L${right.reverse().join(' L')} Z`);
      ribbon.setAttribute('fill', stroke);
      const transform = el.getAttribute('transform');
      if (transform) ribbon.setAttribute('transform', transform);
      el.parentNode?.insertBefore(ribbon, el.nextSibling);
      el.removeAttribute('stroke');
      el.removeAttribute('stroke-width');
      el.removeAttribute('stroke-linecap');
      el.removeAttribute('stroke-linejoin');
      el.removeAttribute('stroke-dasharray');
      done += 1;
    }
    this.converted.set(done);
    this.skipped.set(skipped);
    this.outputSvg.set(new XMLSerializer().serializeToString(svg));
    stage.innerHTML = '';
  }

  downloadSvg() {
    if (!this.outputSvg()) return;
    const url = URL.createObjectURL(new Blob([this.outputSvg()], { type: 'image/svg+xml' }));
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'stroke-to-fill.svg';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  ngOnDestroy() {
    this.stageEl?.remove();
    this.stageEl = null;
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
