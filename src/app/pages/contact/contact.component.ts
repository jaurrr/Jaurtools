import { Component, OnDestroy, effect, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';

import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './contact.component.html',
  styleUrl: './contact.component.scss',
})
export class ContactComponent implements OnDestroy {
  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly email = 'jaurazmi42@gmail.com';

  constructor() {
    effect(() => {
      const lang = this.translate.lang();
      this.pageTitle.setTitle(this.translate.t('contact.metaTitle'));
      this.meta.updateTag({ name: 'description', content: this.translate.t('contact.metaDescription') });
      this.setSeoLinks(lang, 'contact');
    });
  }

    ngOnDestroy(): void {
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
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
