import { Component, OnDestroy, effect, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [RouterLink, IconComponent],
  templateUrl: './about.component.html',
  styleUrl: './about.component.scss',
})
export class AboutComponent implements OnDestroy {
  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly members = [
    { key: 'obaidullah', icon: 'sparkles' },
    { key: 'hassan', icon: 'settings' },
    { key: 'bilal', icon: 'activity' },
    { key: 'jauhar', icon: 'star' },
  ];

  readonly facts = [
    { icon: 'zap', key: 'tools' },
    { icon: 'languages', key: 'languages' },
    { icon: 'server-off', key: 'signup' },
    { icon: 'lock', key: 'browser' },
    { icon: 'check', key: 'cost' },
  ];

  readonly howSteps = [
    { icon: 'zap', key: 's1' },
    { icon: 'menu', key: 's2' },
    { icon: 'search', key: 's3' },
  ];

  readonly examples = [
    { icon: 'banknote', key: 'loan', route: 'emi-calculator' },
    { icon: 'file-text', key: 'image', route: 'image-converter' },
  ];

  readonly useCases = [
    { icon: 'calculator', key: 'calc' },
    { icon: 'copy', key: 'files' },
    { icon: 'type', key: 'text' },
  ];

  readonly benefits = ['b1', 'b2', 'b3', 'b4'];

  readonly limits = [
    { icon: 'file-text', key: 'l1' },
    { icon: 'triangle-alert', key: 'l2' },
    { icon: 'info', key: 'l3' },
    { icon: 'globe', key: 'l4' },
  ];

  readonly faqs = ['f1', 'f2', 'f3', 'f4', 'f5'];

  readonly portfolioUrl = 'https://jaur-supra-me-portfolio.vercel.app/';
  readonly email = 'jaurazmi42@gmail.com';

  constructor() {
    effect(() => {
      const lang = this.translate.lang();
      this.pageTitle.setTitle(this.translate.t('about.metaTitle'));
      this.meta.updateTag({ name: 'description', content: this.translate.t('about.metaDescription') });
      this.setSeoLinks(lang, 'about');
    });
  }

  ngOnDestroy(): void {
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  link(path: string): string {
    return '/' + this.translate.lang() + '/' + path;
  }

  private setSeoLinks(lang: string, path: string): void {
    const doc = this.document;
    if (!doc?.head) return;
    const url = (l: string) => `https://jaurtools.com/${l}/${path}`;
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
