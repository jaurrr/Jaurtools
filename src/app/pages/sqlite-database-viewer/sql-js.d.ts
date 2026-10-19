// Minimal ambient typings for sql.js 1.8.0 (MIT licence).
// Covers exactly the API surface this tool uses.
declare module 'sql.js' {
  export interface SqliteQueryResult {
    columns: string[];
    values: unknown[][];
  }
  export interface SqliteDatabase {
    exec(sql: string): SqliteQueryResult[];
    close(): void;
  }
  export interface SqliteStatic {
    Database: new (data?: Uint8Array | number[]) => SqliteDatabase;
  }
  export default function initSqlJs(options?: {
    locateFile?: (file: string) => string;
  }): Promise<SqliteStatic>;
}
