import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { PDFDocument } from 'pdf-lib';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import {
  attachToolSeo,
  baseName,
  downloadBytes,
  fmtBytes,
  readPdfInput,
} from '../../utils/pdf-toolkit';

interface MetaFields {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
}

const EMPTY: MetaFields = { title: '', author: '', subject: '', keywords: '', creator: '', producer: '' };

@Component({
  selector: 'app-pdf-metadata-editor',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './pdf-metadata-editor.component.html',
  styleUrl: './pdf-metadata-editor.component.scss',
})
export class PdfMetadataEditorComponent implements OnDestroy {
  readonly slug = 'pdf-metadata-editor';
  readonly lastReviewed = '2026-10-19';
  readonly relatedSlugs = ['protect-pdf', 'pdf-to-text', 'compress-pdf'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly detachSeo = attachToolSeo(this, this.pageTitle, this.meta, this.document);

  readonly fileName = signal('');
  readonly loaded = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly status = signal('');
  readonly outSize = signal(0);
  readonly current = signal<MetaFields>({ ...EMPTY });
  readonly created = signal('');
  readonly modified = signal('');
  readonly pageCount = signal(0);
  readonly preserveProducer = signal(true);

  readonly title = signal('');
  readonly author = signal('');
  readonly subject = signal('');
  readonly keywords = signal('');
  readonly creator = signal('');
  readonly producer = signal('');

  readonly changedCount = computed(() => {
    const c = this.current();
    let n = 0;
    if (this.title() !== c.title) n++;
    if (this.author() !== c.author) n++;
    if (this.subject() !== c.subject) n++;
    if (this.keywords() !== c.keywords) n++;
    if (this.creator() !== c.creator) n++;
    if (this.producer() !== c.producer) n++;
    return n;
  });
  readonly outName = computed(() => `${baseName(this.fileName())}-metadata.pdf`);

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

  tc(key: string): string {
    this.translate.lang();
    const raw = (this.translate.t as unknown as (k: string) => unknown)(`common.${key}`);
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
  fmt(n: number): string {
    return fmtBytes(n);
  }
  row(label: string, value: string): { label: string; value: string } {
    return { label, value };
  }

  readonly rows = computed(() => [
    this.row(this.t('labels.fTitle'), this.current().title),
    this.row(this.t('labels.fAuthor'), this.current().author),
    this.row(this.t('labels.fSubject'), this.current().subject),
    this.row(this.t('labels.fKeywords'), this.current().keywords),
    this.row(this.t('labels.fCreator'), this.current().creator),
    this.row(this.t('labels.fProducer'), this.current().producer),
  ]);

  setField(key: keyof MetaFields, v: string): void {
    this[key].set(v);
  }
  setPreserve(v: boolean): void {
    this.preserveProducer.set(v);
  }

  resetToCurrent(): void {
    const c = this.current();
    this.title.set(c.title);
    this.author.set(c.author);
    this.subject.set(c.subject);
    this.keywords.set(c.keywords);
    this.creator.set(c.creator);
    this.producer.set(c.producer);
    this.status.set(this.t('labels.statusReset'));
  }

  clearFields(): void {
    this.title.set('');
    this.author.set('');
    this.subject.set('');
    this.keywords.set('');
    this.creator.set('');
    this.producer.set('');
    this.setPreserve(false);
    this.status.set(this.t('labels.statusCleared'));
  }

  async onFileSelected(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const res = await readPdfInput(input);
    this.error.set('');
    this.status.set('');
    this.loaded.set(false);
    this.outSize.set(0);
    if (!res.ok) {
      this.error.set(this.t(res.code === 'size' ? 'labels.errSize' : 'labels.errType'));
      input.value = '';
      return;
    }
    try {
      const doc = await PDFDocument.load(res.bytes, { updateMetadata: false });
      const c: MetaFields = {
        title: doc.getTitle() ?? '',
        author: doc.getAuthor() ?? '',
        subject: doc.getSubject() ?? '',
        keywords: doc.getKeywords() ?? '',
        creator: doc.getCreator() ?? '',
        producer: doc.getProducer() ?? '',
      };
      this.current.set(c);
      this.created.set(this.fmtDate(doc.getCreationDate()));
      this.modified.set(this.fmtDate(doc.getModificationDate()));
      this.pageCount.set(doc.getPageCount());
      this.title.set(c.title);
      this.author.set(c.author);
      this.subject.set(c.subject);
      this.keywords.set(c.keywords);
      this.creator.set(c.creator);
      this.producer.set(c.producer);
      this.pdfBytes = res.bytes;
      this.fileName.set(res.name);
      this.loaded.set(true);
    } catch {
      this.error.set(this.t('labels.errRead'));
      input.value = '';
    }
  }

  async save(): Promise<void> {
    if (!this.pdfBytes || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.status.set('');
    try {
      const doc = await PDFDocument.load(this.pdfBytes.slice(), { updateMetadata: false });
      doc.setTitle(this.title());
      doc.setAuthor(this.author());
      doc.setSubject(this.subject());
      doc.setKeywords(this.keywords().split(',').map((k) => k.trim()).filter(Boolean));
      doc.setCreator(this.creator());
      doc.setProducer(this.preserveProducer() ? this.current().producer : this.producer());
      doc.setModificationDate(new Date());
      const bytes = await doc.save();
      this.outBytes = bytes;
      this.outSize.set(bytes.length);
      this.status.set(this.t('labels.statusSaved'));
    } catch {
      this.error.set(this.t('labels.errBuild'));
    } finally {
      this.busy.set(false);
    }
  }

  download(): void {
    if (!this.outBytes) return;
    downloadBytes(this.document, this.outBytes, this.outName(), 'application/pdf');
  }

  ngOnDestroy(): void {
    this.detachSeo();
  }

  private pdfBytes: Uint8Array | null = null;
  private outBytes: Uint8Array | null = null;

  private fmtDate(d: Date | undefined): string {
    if (!d) return '—';
    try {
      return d.toLocaleString();
    } catch {
      return '—';
    }
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }
}
