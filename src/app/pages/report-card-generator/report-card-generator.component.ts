import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface Subject {
  id: number;
  name: string;
  obtained: number;
  max: number;
}

@Component({
  selector: 'app-report-card-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './report-card-generator.component.html',
  styleUrl: './report-card-generator.component.scss',
})
export class ReportCardGeneratorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.oneDecimal().format(this.percentage()) + "%");
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

  readonly slug = 'report-card-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['attendance-percentage-calculator', 'stock-inventory-tracker', 'percentage-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly windowRef = inject(DOCUMENT).defaultView;

  readonly studentName = signal('');
  readonly className = signal('');
  readonly subjects = signal<Subject[]>([
    { id: 1, name: 'Hindi', obtained: 82, max: 100 },
    { id: 2, name: 'English', obtained: 76, max: 100 },
    { id: 3, name: 'Mathematics', obtained: 91, max: 100 },
    { id: 4, name: 'Science', obtained: 68, max: 100 },
    { id: 5, name: 'Social Science', obtained: 73, max: 100 },
  ]);
  readonly newSubjectName = signal('');
  readonly formError = signal('');

  private nextId = 6;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly totalObtained = computed(() =>
    this.subjects().reduce((s, x) => s + x.obtained, 0)
  );
  readonly totalMax = computed(() => this.subjects().reduce((s, x) => s + x.max, 0));

  readonly percentage = computed(() => {
    const max = this.totalMax();
    if (max <= 0) return 0;
    return (this.totalObtained() / max) * 100;
  });

  readonly gradeKey = computed(() => {
    const p = this.percentage();
    if (p >= 90) return 'aplus';
    if (p >= 80) return 'a';
    if (p >= 70) return 'bplus';
    if (p >= 60) return 'b';
    if (p >= 50) return 'c';
    if (p >= 40) return 'd';
    return 'f';
  });

  readonly divisionKey = computed(() => {
    const p = this.percentage();
    if (p >= 60) return 'first';
    if (p >= 45) return 'second';
    if (p >= 33) return 'third';
    return 'fail';
  });

  readonly passed = computed(() => this.percentage() >= 33);

  readonly oneDecimal = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  );

  subjectPercent(s: Subject): number {
    if (s.max <= 0) return 0;
    return (s.obtained / s.max) * 100;
  }

  setStudentName(v: string): void { this.studentName.set(v.slice(0, 80)); }
  setClassName(v: string): void { this.className.set(v.slice(0, 40)); }
  setNewSubjectName(v: string): void { this.newSubjectName.set(v.slice(0, 60)); }
  setSubjectName(id: number, v: string): void {
    this.subjects.update((list) =>
      list.map((s) => (s.id === id ? { ...s, name: v.slice(0, 60) } : s))
    );
  }
  setObtained(id: number, v: number): void {
    this.subjects.update((list) =>
      list.map((s) => (s.id === id ? { ...s, obtained: this.clampNum(v, 0, s.max) } : s))
    );
  }
  setMax(id: number, v: number): void {
    const next = this.clampNum(v, 1, 1000);
    this.subjects.update((list) =>
      list.map((s) =>
        s.id === id ? { ...s, max: next, obtained: Math.min(s.obtained, next) } : s
      )
    );
  }

  addSubject(): void {
    if (!this.newSubjectName().trim()) {
      this.formError.set(this.t('labels.errorSubjectName'));
      return;
    }
    this.formError.set('');
    this.subjects.update((list) => [
      ...list,
      { id: this.nextId++, name: this.newSubjectName().trim(), obtained: 0, max: 100 },
    ]);
    this.newSubjectName.set('');
  }

  removeSubject(id: number): void {
    this.subjects.update((list) => list.filter((s) => s.id !== id));
  }

  printCard(): void {
    this.windowRef?.print();
  }

  gradeName(): string {
    return this.t('grades.' + this.gradeKey());
  }

  divisionName(): string {
    return this.t('divisions.' + this.divisionKey());
  }

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

  ngOnDestroy(): void {
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

  private locale(): string {
    const lang = this.translate.lang();
    return lang === 'ar' ? 'ar-SA' : lang === 'hi' ? 'hi-IN' : 'en-IN';
  }

  private updateSeo(): void {
    const lang = this.translate.lang();
    this.pageTitle.setTitle(this.t('metaTitle'));
    this.meta.updateTag({ name: 'description', content: this.t('metaDescription') });
    this.meta.updateTag({ name: 'keywords', content: this.t('keywords') });
    this.setLink('canonical', `https://jaurtools.com/${lang}/${this.slug}`);
    for (const l of ['en', 'hi', 'ar']) {
      this.setLink('alternate', `https://jaurtools.com/${l}/${this.slug}`, l);
    }
  }

  private setLink(rel: string, href: string, hreflang?: string): void {
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

  private refreshJsonLd(): void {
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
