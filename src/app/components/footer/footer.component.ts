import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CATEGORIES, type CategoryEntry } from '../../core/tools-registry';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../icon/icon.component';

const TRENDING_SLUGS: string[] = [
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
];

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink, IconComponent],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
})
export class FooterComponent {
  readonly translate = inject(TranslateService);
  readonly trending = TRENDING_SLUGS;
  readonly categories: CategoryEntry[] = CATEGORIES;
  readonly toolsExpanded = signal(false);
  readonly catsExpanded = signal(false);

  visibleTools(): string[] {
    return this.toolsExpanded() ? this.trending : this.trending.slice(0, 5);
  }

  visibleCats(): CategoryEntry[] {
    return this.catsExpanded() ? this.categories : this.categories.slice(0, 5);
  }

  toolName(slug: string): string {
    return this.translate.t(`${slug}.name`);
  }

  categoryName(category: CategoryEntry): string {
    return this.translate.t(category.label);
  }

  openCookieSettings(): void {
    window.dispatchEvent(new CustomEvent('jt:open-cookies'));
  }
}
