import { Component, computed, inject, input, signal } from '@angular/core';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-micro-rating',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './micro-rating.component.html',
  styleUrl: './micro-rating.component.scss',
})
export class MicroRatingComponent {
  private readonly translate = inject(TranslateService);

  /** Tool slug, e.g. 'word-counter'. */
  readonly slug = input.required<string>();
  /** i18n namespace under the slug holding the rating strings (default 'labels'). */
  readonly ns = input<string>('labels');

  private readonly stored = signal<string | null>(null);
  private hydrated = false;

  readonly voted = computed(() => this.stored() !== null);

  private key(path: string): string {
    return `${this.slug()}.${this.ns()}.${path}`;
  }

  t(path: string): string {
    this.translate.lang();
    const value = this.translate.t(this.key(path));
    return typeof value === 'string' ? value : this.key(path);
  }

  private readStored(): string | null {
    if (!this.hydrated) {
      this.hydrated = true;
      try {
        this.stored.set(localStorage.getItem(`jt-rating-${this.slug()}`));
      } catch {
        this.stored.set(null);
      }
    }
    return this.stored();
  }

  hasVoted(): boolean {
    return this.readStored() !== null;
  }

  vote(value: 'yes' | 'no'): void {
    if (this.readStored() !== null) return;
    try {
      localStorage.setItem(`jt-rating-${this.slug()}`, value);
    } catch {
      // private mode: keep the in-memory state only
    }
    this.stored.set(value);
  }
}
