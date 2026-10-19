import { Component, OnDestroy, effect, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, IconComponent],
  templateUrl: './not-found.component.html',
  styleUrl: './not-found.component.scss',
})
export class NotFoundComponent implements OnDestroy {
  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);

  constructor() {
    effect(() => {
      this.translate.lang();
      this.pageTitle.setTitle(this.translate.t('notfound.metaTitle'));
      this.meta.updateTag({ name: 'robots', content: 'noindex, follow' });
    });
  }

  ngOnDestroy(): void {
    this.meta.removeTag("name='robots'");
  }
}
