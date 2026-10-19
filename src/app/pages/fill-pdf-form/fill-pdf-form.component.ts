import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { PDFDocument, StandardFonts, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup } from 'pdf-lib';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type Mode = 'fill' | 'create';
type FieldKind = 'text' | 'check' | 'dropdown' | 'radio' | 'other';

interface FillField {
  name: string;
  kind: FieldKind;
  options: string[];
  value: string;
}

interface NewField {
  label: string;
  type: 'text' | 'check' | 'dropdown';
  options: string;
}

const MAX_BYTES = 50 * 1024 * 1024;

@Component({
  selector: 'app-fill-pdf-form',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './fill-pdf-form.component.html',
  styleUrl: './fill-pdf-form.component.scss',
})
export class FillPdfFormComponent implements OnDestroy {
  readonly slug = 'fill-pdf-form';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['sign-pdf', 'watermark-pdf', 'pdf-to-text'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly mode = signal<Mode>('fill');
  readonly fileName = signal('');
  readonly error = signal('');
  readonly busy = signal(false);
  readonly status = signal('');
  readonly fields = signal<FillField[]>([]);
  readonly newFields = signal<NewField[]>([{ label: '', type: 'text', options: '' }]);

  readonly hasFields = computed(() => this.fields().length > 0);

  private pdfBytes: Uint8Array | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
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

  setMode(m: Mode): void {
    this.mode.set(m);
    this.error.set('');
    this.status.set('');
  }

  async onFileSelected(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.error.set('');
    this.status.set('');
    if (!this.isPdf(file)) {
      this.error.set(this.t('labels.errType'));
      input.value = '';
      return;
    }
    if (file.size > MAX_BYTES) {
      this.error.set(this.t('labels.errSize'));
      input.value = '';
      return;
    }
    this.busy.set(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const form = doc.getForm();
      const list: FillField[] = form.getFields().map((f) => {
        const kind = this.kindOf(f);
        let options: string[] = [];
        try {
          if (kind === 'dropdown') options = form.getDropdown(f.getName()).getOptions();
          else if (kind === 'radio') options = form.getRadioGroup(f.getName()).getOptions();
        } catch {
          options = [];
        }
        return {
          name: f.getName(),
          kind,
          options,
          value: kind === 'check' ? 'off' : (options[0] ?? ''),
        };
      });
      this.pdfBytes = bytes;
      this.fileName.set(file.name);
      this.fields.set(list);
      this.status.set(this.t('labels.statusLoaded').replace('{n}', String(list.length)));
    } catch {
      this.error.set(this.t('labels.errParse'));
      this.pdfBytes = null;
      this.fields.set([]);
      this.fileName.set('');
    } finally {
      this.busy.set(false);
    }
  }

  setFieldValue(i: number, v: string): void {
    const next = this.fields().slice();
    next[i] = { ...next[i], value: v };
    this.fields.set(next);
  }

  async applyAndDownload(): Promise<void> {
    if (!this.pdfBytes || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const doc = await PDFDocument.load(this.pdfBytes, { ignoreEncryption: true });
      const form = doc.getForm();
      for (const f of this.fields()) {
        try {
          if (f.kind === 'text') form.getTextField(f.name).setText(f.value);
          else if (f.kind === 'check') {
            const cb = form.getCheckBox(f.name);
            if (f.value === 'on') cb.check();
            else cb.uncheck();
          } else if (f.kind === 'dropdown') {
            if (f.value) form.getDropdown(f.name).select(f.value);
          } else if (f.kind === 'radio') {
            if (f.value) form.getRadioGroup(f.name).select(f.value);
          }
        } catch {
          /* skip fields this viewer cannot set */
        }
      }
      try {
        form.updateFieldAppearances();
      } catch {
        /* appearance streams are optional; viewers can render their own */
      }
      const out = await doc.save({ useObjectStreams: true });
      this.download(out, this.suffixed(this.fileName(), '-filled'), 'application/pdf');
      this.status.set(this.t('labels.statusDone'));
    } catch {
      this.error.set(this.t('labels.errProcess'));
    } finally {
      this.busy.set(false);
    }
  }

  addRow(): void {
    this.newFields.set([...this.newFields(), { label: '', type: 'text', options: '' }]);
  }

  removeRow(i: number): void {
    const next = this.newFields().slice();
    next.splice(i, 1);
    this.newFields.set(next.length ? next : [{ label: '', type: 'text', options: '' }]);
  }

  setRow(i: number, patch: Partial<NewField>): void {
    const next = this.newFields().slice();
    next[i] = { ...next[i], ...patch };
    this.newFields.set(next);
  }

  async buildForm(): Promise<void> {
    const rows = this.newFields().filter((r) => r.label.trim().length > 0);
    if (!rows.length || this.busy()) {
      if (!rows.length) this.error.set(this.t('labels.errNoFields'));
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const form = doc.getForm();
      let page = doc.addPage([595.28, 841.89]);
      let y = 790;
      rows.forEach((r, i) => {
        if (y < 130) {
          page = doc.addPage([595.28, 841.89]);
          y = 790;
        }
        page.drawText(r.label, { x: 56, y, size: 12, font });
        const name = `field_${i + 1}`;
        if (r.type === 'text') {
          const tf = form.createTextField(name);
          tf.addToPage(page, { x: 56, y: y - 36, width: 320, height: 24 });
        } else if (r.type === 'check') {
          const cb = form.createCheckBox(name);
          cb.addToPage(page, { x: 56, y: y - 32, width: 20, height: 20 });
        } else {
          const dd = form.createDropdown(name);
          const opts = r.options.split(',').map((s) => s.trim()).filter(Boolean);
          const safe = opts.length ? opts : ['Option 1', 'Option 2'];
          dd.addOptions(safe);
          dd.select(safe[0]);
          dd.addToPage(page, { x: 56, y: y - 36, width: 320, height: 24 });
        }
        y -= 76;
      });
      const out = await doc.save({ useObjectStreams: true });
      this.download(out, 'fillable-form.pdf', 'application/pdf');
      this.status.set(this.t('labels.statusDone'));
    } catch {
      this.error.set(this.t('labels.errProcess'));
    } finally {
      this.busy.set(false);
    }
  }

  ngOnDestroy(): void {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private kindOf(f: object): FieldKind {
    if (f instanceof PDFTextField) return 'text';
    if (f instanceof PDFCheckBox) return 'check';
    if (f instanceof PDFDropdown) return 'dropdown';
    if (f instanceof PDFRadioGroup) return 'radio';
    return 'other';
  }

  private isPdf(file: File): boolean {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  }

  private suffixed(name: string, suffix: string): string {
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(0, dot) + suffix + name.slice(dot) : name + suffix + '.pdf';
  }

  private download(bytes: Uint8Array, name: string, type: string): void {
    const ab = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(ab).set(bytes);
    const url = URL.createObjectURL(new Blob([ab], { type }));
    const a = this.document.createElement('a');
    a.href = url;
    a.download = name;
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 8000);
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
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
    const selector = hreflang
      ? `link[rel="${rel}"][hreflang="${hreflang}"]`
      : `link[rel="${rel}"]:not([hreflang])`;
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
