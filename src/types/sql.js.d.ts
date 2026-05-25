declare module 'sql.js' {
  interface Database {
    run(sql: string, params?: unknown[]): void
    exec(sql: string): void
    prepare(sql: string): Statement
    export(): Uint8Array
    close(): void
  }

  interface Statement {
    bind(params?: unknown[]): void
    step(): boolean
    getAsObject(): Record<string, unknown>
    free(): void
  }

  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database
  }

  export default function initSqlJs(config?: Record<string, unknown>): Promise<SqlJsStatic>
  export { Database, Statement, SqlJsStatic }
}
