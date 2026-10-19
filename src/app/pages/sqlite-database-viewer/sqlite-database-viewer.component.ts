import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import initSqlJs from 'sql.js';
type SqliteEngine = Awaited<ReturnType<typeof initSqlJs>>;
type SqliteDatabase = InstanceType<SqliteEngine['Database']>;
type SqliteStatic = SqliteEngine;

interface TableColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue: string;
}

interface TableSummary {
  name: string;
  rows: number;
}

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const PAGE_SIZES = [10, 25, 50, 100];

const SAMPLE_SCHEMA = `CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  age INTEGER,
  city TEXT
);
INSERT INTO users (name, email, age, city) VALUES
  ('Aarav Sharma', 'aarav@example.com', 28, 'Delhi'),
  ('Priya Verma', 'priya@example.com', 34, 'Mumbai'),
  ('Rohan Iyer', 'rohan@example.com', 25, 'Delhi'),
  ('Sana Khan', 'sana@example.com', 31, 'Hyderabad'),
  ('Kabir Rao', 'kabir@example.com', 29, 'Mumbai');
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  item TEXT NOT NULL,
  amount REAL NOT NULL
);
INSERT INTO orders (user_id, item, amount) VALUES
  (1, 'Keyboard', 2499.00),
  (2, 'Mouse', 899.50),
  (1, 'Monitor', 12499.00),
  (4, 'Headphones', 1999.00);`;

const SAMPLE_QUERY = `SELECT city, COUNT(*) AS users
FROM users
GROUP BY city
ORDER BY users DESC;`;

@Component({
  selector: 'app-sqlite-database-viewer',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './sqlite-database-viewer.component.html',
  styleUrl: './sqlite-database-viewer.component.scss',
})
export class SqliteDatabaseViewerComponent implements OnDestroy {
  readonly slug = 'sqlite-database-viewer';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['svg-to-jsx-converter', 'svg-wave-divider-generator', 'word-counter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fileName = signal('');
  readonly error = signal('');
  readonly loading = signal(false);
  readonly dbReady = signal(false);
  readonly tables = signal<TableSummary[]>([]);
  readonly selectedTable = signal('');
  readonly schema = signal<TableColumnInfo[]>([]);
  readonly columns = signal<string[]>([]);
  readonly rows = signal<unknown[][]>([]);
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly totalRows = signal(0);
  readonly sql = signal('');
  readonly queryColumns = signal<string[]>([]);
  readonly queryRows = signal<unknown[][]>([]);
  readonly queryNote = signal('');
  readonly queryError = signal('');
  readonly queryRan = signal(false);
  readonly copied = signal(false);

  readonly pageSizes = PAGE_SIZES;

  private db: SqliteDatabase | null = null;
  private enginePromise: Promise<SqliteStatic> | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalRows() / this.pageSize()))
  );

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

  cellText(value: unknown): string {
    if (value === null || value === undefined) return 'NULL';
    if (value instanceof Uint8Array) return this.t('labels.binaryLabel');
    return String(value);
  }

  isNull(value: unknown): boolean {
    return value === null || value === undefined;
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.error.set('');
    if (!/\.(db|sqlite|sqlite3|db3|s3db)$/i.test(file.name)) {
      this.error.set(this.t('labels.fileTypeError'));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      this.error.set(this.t('labels.fileSizeError'));
      return;
    }
    this.loading.set(true);
    try {
      const engine = await this.sqliteEngine();
      const buffer = await file.arrayBuffer();
      this.closeDb();
      this.db = new engine.Database(new Uint8Array(buffer));
      this.db.exec('SELECT name FROM sqlite_master LIMIT 1;');
      this.fileName.set(file.name);
      this.afterDbOpened();
    } catch {
      this.closeDb();
      this.error.set(this.t('labels.readError'));
    } finally {
      this.loading.set(false);
    }
  }

  async loadSample(): Promise<void> {
    this.error.set('');
    this.loading.set(true);
    try {
      const engine = await this.sqliteEngine();
      this.closeDb();
      this.db = new engine.Database();
      this.db.exec(SAMPLE_SCHEMA);
      this.fileName.set(this.t('labels.sampleName'));
      this.sql.set(SAMPLE_QUERY);
      this.afterDbOpened();
      this.runQuery();
    } catch {
      this.closeDb();
      this.error.set(this.t('labels.initError'));
    } finally {
      this.loading.set(false);
    }
  }

  clearDatabase(): void {
    this.closeDb();
    this.dbReady.set(false);
    this.fileName.set('');
    this.tables.set([]);
    this.selectedTable.set('');
    this.schema.set([]);
    this.columns.set([]);
    this.rows.set([]);
    this.page.set(1);
    this.totalRows.set(0);
    this.sql.set('');
    this.queryColumns.set([]);
    this.queryRows.set([]);
    this.queryNote.set('');
    this.queryError.set('');
    this.queryRan.set(false);
    this.error.set('');
  }

  selectTable(name: string): void {
    this.selectedTable.set(name);
    this.page.set(1);
    if (!name) {
      this.schema.set([]);
      this.columns.set([]);
      this.rows.set([]);
      this.totalRows.set(0);
      return;
    }
    this.loadSchema();
    this.loadRows();
  }

  setPageSize(size: number): void {
    this.pageSize.set(this.clampNum(Number(size), 10, 100));
    this.page.set(1);
    this.loadRows();
  }

  prevPage(): void {
    if (this.page() > 1) {
      this.page.set(this.page() - 1);
      this.loadRows();
    }
  }

  nextPage(): void {
    if (this.page() < this.totalPages()) {
      this.page.set(this.page() + 1);
      this.loadRows();
    }
  }

  runQuery(): void {
    this.queryError.set('');
    this.queryNote.set('');
    const db = this.db;
    if (!db) {
      this.queryError.set(this.t('labels.noDatabase'));
      return;
    }
    const query = this.sql().trim();
    if (!query) {
      this.queryError.set(this.t('labels.emptyQuery'));
      return;
    }
    try {
      const results = db.exec(query);
      if (results.length === 0 || results[0].values.length === 0) {
        this.queryColumns.set(results.length ? results[0].columns : []);
        this.queryRows.set([]);
        this.queryNote.set(this.t('labels.queryOkNoRows'));
      } else {
        this.queryColumns.set(results[0].columns);
        this.queryRows.set(results[0].values);
      }
      this.queryRan.set(true);
      this.refreshTables();
    } catch (e) {
      this.queryRan.set(false);
      this.queryError.set(e instanceof Error ? e.message : String(e));
    }
  }

  downloadCsv(): void {
    const useQuery = this.queryRan() && !this.queryError();
    const cols = useQuery ? this.queryColumns() : this.columns();
    const data = useQuery ? this.queryRows() : this.rows();
    if (cols.length === 0) return;
    const escape = (value: unknown): string => {
      const text = value === null || value === undefined ? '' : String(value);
      return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    };
    const lines = [cols.map(escape).join(',')];
    for (const row of data) lines.push(row.map(escape).join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = this.document.createElement('a');
    anchor.href = url;
    anchor.download = (useQuery ? 'query-result' : this.selectedTable() || 'table') + '.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async copyTsv(): Promise<void> {
    const useQuery = this.queryRan() && !this.queryError();
    const cols = useQuery ? this.queryColumns() : this.columns();
    const data = useQuery ? this.queryRows() : this.rows();
    if (cols.length === 0) return;
    const text = [cols.join('\t')]
      .concat(data.map((row) => row.map((v) => (v === null || v === undefined ? '' : String(v))).join('\t')))
      .join('\n');
    try {
      await navigator.clipboard.writeText(text).catch(() => undefined);
      this.copied.set(true);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(false), 1500);
    } catch {
      this.queryError.set(this.t('labels.copyError'));
    }
  }

  ngOnDestroy() {
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.closeDb();
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private sqliteEngine(): Promise<SqliteStatic> {
    if (!this.enginePromise) {
      this.enginePromise = initSqlJs({ locateFile: (file: string) => 'assets/sql-wasm/' + file });
    }
    const p = this.enginePromise;
    if (!p) throw new Error('engine-init');
    return p;
  }

  private closeDb(): void {
    try {
      this.db?.close();
    } catch {
      /* already closed */
    }
    this.db = null;
  }

  private afterDbOpened(): void {
    this.dbReady.set(true);
    this.queryRan.set(false);
    this.queryError.set('');
    this.queryNote.set('');
    this.refreshTables();
  }

  private quoteIdent(name: string): string {
    return '"' + name.replace(/"/g, '""') + '"';
  }

  private refreshTables(): void {
    const db = this.db;
    if (!db) return;
    const results = db.exec(
      "SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name;"
    );
    const names = results.length ? results[0].values.map((row: unknown[]) => String(row[0])) : [];
    this.tables.set(names.map((name: string) => ({ name, rows: this.countRows(db, name) })));
    const current = this.selectedTable();
    const next = names.includes(current) ? current : (names[0] ?? '');
    this.selectTable(next);
  }

  private countRows(db: SqliteDatabase, table: string): number {
    try {
      const results = db.exec(`SELECT COUNT(*) AS c FROM ${this.quoteIdent(table)};`);
      return Number(results[0]?.values[0]?.[0] ?? 0);
    } catch {
      return 0;
    }
  }

  private loadSchema(): void {
    const db = this.db;
    const table = this.selectedTable();
    if (!db || !table) return;
    try {
      const results = db.exec(`PRAGMA table_info(${this.quoteIdent(table)});`);
      const cols: TableColumnInfo[] = results.length
        ? results[0].values.map((row: unknown[]) => ({
            name: String(row[1] ?? ''),
            type: String(row[2] ?? ''),
            nullable: Number(row[3] ?? 0) === 0,
            primaryKey: Number(row[5] ?? 0) > 0,
            defaultValue: row[4] === null || row[4] === undefined ? '' : String(row[4]),
          }))
        : [];
      this.schema.set(cols);
    } catch {
      this.schema.set([]);
    }
  }

  private loadRows(): void {
    const db = this.db;
    const table = this.selectedTable();
    if (!db || !table) return;
    try {
      const total = this.countRows(db, table);
      this.totalRows.set(total);
      const offset = (this.page() - 1) * this.pageSize();
      const results = db.exec(
        `SELECT * FROM ${this.quoteIdent(table)} LIMIT ${this.pageSize()} OFFSET ${offset};`
      );
      if (results.length) {
        this.columns.set(results[0].columns);
        this.rows.set(results[0].values);
      } else {
        this.columns.set([]);
        this.rows.set([]);
      }
    } catch {
      this.columns.set([]);
      this.rows.set([]);
    }
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }

  private clampNum(v: number, min: number, max: number): number {
    if (!Number.isFinite(v)) return min;
    return Math.min(max, Math.max(min, Math.round(v * 100) / 100));
  }

  private updateSeo() {
    const lang = this.translate.lang();
    this.pageTitle.setTitle(this.t('metaTitle'));
    this.meta.updateTag({ name: 'description', content: this.t('metaDescription') });
    this.meta.updateTag({ name: 'keywords', content: this.t('keywords') });
    this.setLink('canonical', `https://jaurtools.com/${lang}/${this.slug}`);
    for (const l of ['en', 'hi', 'ar']) {
      this.setLink('alternate', `https://jaurtools.com/${l}/${this.slug}`, l);
    }
  }

  private setLink(rel: string, href: string, hreflang?: string) {
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

  private refreshJsonLd() {
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
