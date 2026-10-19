import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { CATEGORIES, TOOLS } from '../../core/tools-registry';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [RouterLink, IconComponent],
  templateUrl: './search.component.html',
  styleUrl: './search.component.scss',
})
export class SearchComponent implements OnDestroy {
  readonly translate = inject(TranslateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly tools = TOOLS;
  readonly q = signal('');
  readonly cat = signal('');
  readonly letter = signal('');

  readonly activeCategoryLabel = computed(() => {
    const found = CATEGORIES.find((c) => c.id === this.cat());
    return found ? this.translate.t(found.label) : '';
  });

  readonly results = computed(() => {
    const needle = this.q().trim().toLowerCase();
    const cat = this.cat();
    const letter = this.letter().trim().toLowerCase();
    return this.tools.filter((tool) => {
      if (cat && tool.category !== cat) return false;
      const name = this.translate.t(`${tool.slug}.name`).toLowerCase();
      if (letter) {
        const nameFirst = name.trim().charAt(0);
        const slugFirst = tool.slug.charAt(0).toLowerCase();
        if (nameFirst !== letter && slugFirst !== letter) return false;
      }
      if (!needle) return true;
      const slugWords = tool.slug.replace(/-/g, ' ');
      return (
        name.includes(needle) ||
        slugWords.includes(needle) ||
        tool.slug.includes(needle.replace(/\s+/g, '-'))
      );
    });
  });

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      const q = params.get('q') ?? '';
      const cat = params.get('cat') ?? '';
      const letter = params.get('letter') ?? '';
      if (q !== this.q()) this.q.set(q);
      if (cat !== this.cat()) this.cat.set(cat);
      if (letter !== this.letter()) this.letter.set(letter);
    });

    effect(() => {
      const lang = this.translate.lang();
      this.pageTitle.setTitle(this.translate.t('search.metaTitle'));
      this.meta.updateTag({ name: 'description', content: this.translate.t('search.metaDescription') });
      this.meta.updateTag({ name: 'robots', content: 'noindex, follow' });
      this.setSeoLinks(lang, 'search');
    });
  }

    ngOnDestroy(): void {
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
    this.meta.removeTag("name='robots'");
  }

  onType(value: string): void {
    this.q.set(value);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: value.trim() ? value : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  clearCategory(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { cat: null },
      queryParamsHandling: 'merge',
    });
  }

  clearLetter(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { letter: null },
      queryParamsHandling: 'merge',
    });
  }

  toolName(slug: string): string {
    return this.translate.t(`${slug}.name`);
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
