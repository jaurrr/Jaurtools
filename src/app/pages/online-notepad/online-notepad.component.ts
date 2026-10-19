import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface Note {
  id: number;
  title: string;
  body: string;
  updated: number;
}

const STORAGE_KEY = 'jaurtools-notes-v1';

@Component({
  selector: 'app-online-notepad',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './online-notepad.component.html',
  styleUrl: './online-notepad.component.scss',
})
export class OnlineNotepadComponent implements OnDestroy {
  readonly slug = 'online-notepad';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['kindle-highlights-exporter', 'keyword-density-checker', 'poster-maker'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly windowRef = inject(DOCUMENT).defaultView;

  readonly notes = signal<Note[]>([]);
  readonly activeId = signal<number | null>(null);
  readonly editingTitle = signal('');
  readonly editingBody = signal('');
  readonly printedAt = signal(Date.now());

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as unknown;
        if (Array.isArray(parsed)) {
          const valid = parsed.filter(
            (p): p is Note =>
              typeof p === 'object' && p !== null &&
              typeof (p as Note).id === 'number' &&
              typeof (p as Note).title === 'string' &&
              typeof (p as Note).body === 'string'
          );
          this.notes.set(valid);
          if (valid.length > 0) {
            const first = [...valid].sort((a, b) => b.updated - a.updated)[0];
            this.activeId.set(first.id);
            this.editingTitle.set(first.title);
            this.editingBody.set(first.body);
          }
        }
      }
    } catch {
      // storage unavailable; start empty
    }
    effect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.notes()));
      } catch {
        // ignore
      }
    });
  }

  readonly sortedNotes = computed(() =>
    [...this.notes()].sort((a, b) => b.updated - a.updated)
  );

  readonly wordCount = computed(() =>
    this.editingBody().split(/\s+/).filter((w) => w.length > 0).length
  );
  readonly charCount = computed(() => this.editingBody().length);
  readonly readingTime = computed(() => {
    const mins = this.wordCount() / 200;
    return mins < 1 ? '<1' : String(Math.round(mins));
  });

  // wordcount.com pattern: platform presets — tap a chip to set it as the goal
  readonly goalPresets = computed(() => [
    { key: 'sms', chars: 160 },
    { key: 'x', chars: 280 },
    { key: 'instagram', chars: 2200 },
  ]);
  readonly goal = signal<number | null>(null);
  setGoal(chars: number | null) { this.goal.set(chars); }
  readonly goalProgress = computed(() => {
    const g = this.goal();
    if (!g) return 0;
    return Math.min(100, Math.max(0, (this.charCount() / g) * 100));
  });

  readonly dateFmt = computed(() =>
    new Intl.DateTimeFormat(this.locale(), { dateStyle: 'medium', timeStyle: 'short' })
  );

  newNote(): void {
    const note: Note = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      title: '',
      body: '',
      updated: Date.now(),
    };
    this.notes.update((list) => [note, ...list]);
    this.activeId.set(note.id);
    this.editingTitle.set('');
    this.editingBody.set('');
  }

  selectNote(id: number): void {
    if (id === this.activeId()) return;
    this.activeId.set(id);
    const n = this.notes().find((x) => x.id === id);
    this.editingTitle.set(n?.title || '');
    this.editingBody.set(n?.body || '');
  }

  deleteNote(id: number): void {
    this.notes.update((list) => list.filter((n) => n.id !== id));
    if (this.activeId() === id) {
      const rest = this.notes();
      if (rest.length > 0) {
        const first = [...rest].sort((a, b) => b.updated - a.updated)[0];
        this.activeId.set(first.id);
        this.editingTitle.set(first.title);
        this.editingBody.set(first.body);
      } else {
        this.activeId.set(null);
        this.editingTitle.set('');
        this.editingBody.set('');
      }
    }
  }

  setTitle(v: string): void {
    this.editingTitle.set(v.slice(0, 200));
    this.persist();
  }

  setBody(v: string): void {
    this.editingBody.set(v.slice(0, 200000));
    this.persist();
  }

  private persist(): void {
    const id = this.activeId();
    if (id === null) return;
    this.notes.update((list) =>
      list.map((n) =>
        n.id === id ? { ...n, title: this.editingTitle(), body: this.editingBody(), updated: Date.now() } : n
      )
    );
  }

  exportMarkdown(): void {
    const id = this.activeId();
    if (id === null) return;
    const title = this.editingTitle().trim() || this.t('labels.untitledLabel');
    const slug = title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'note';
    const md = '# ' + title + '\n\n' + this.editingBody().trim() + '\n';
    const blob = new Blob(['\uFEFF' + md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = slug + '.md';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  printNote(): void {
    this.printedAt.set(Date.now());
    this.windowRef?.print();
  }

  noteTitle(n: Note): string {
    return n.title.trim() || this.t('labels.untitledLabel');
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
