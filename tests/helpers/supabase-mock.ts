type Row = Record<string, unknown>;

interface FilterOp {
  col: string;
  op: string;
  val: unknown;
}

interface OrderOp {
  col: string;
  ascending: boolean;
}

type Mutation =
  | { kind: "insert"; rows: Row[] }
  | { kind: "upsert"; row: Row; conflictKey: string }
  | { kind: "update"; patch: Row }
  | { kind: "delete" };

export class QueryBuilder {
  private rows: Row[];

  private filters: FilterOp[] = [];

  private orders: OrderOp[] = [];

  private limitVal: number | null = null;

  private mutation: Mutation | null = null;

  private _inserts: { table: string; row: Row }[] | null;

  private _table: string;

  constructor(
    rows: Row[],
    inserts: { table: string; row: Row }[] | null,
    tableName: string,
  ) {
    this.rows = [...rows];
    this._inserts = inserts;
    this._table = tableName;
  }

  // ------ thenable: await triggers execution ------

  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    _onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this._execute().then(onfulfilled as (value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>, _onrejected);
  }

  // Prevent `new QueryBuilder()` from working with `await` — only chain builders.
  // This property makes the object "thenable" but the real logic is in then().
  private async _execute(): Promise<{ data: Row[]; error: null }> {
    if (this.mutation) {
      const m = this.mutation;
      this.mutation = null;
      const filtered = this.applyFilters();
      if (m.kind === "insert") {
        for (const r of m.rows) {
          if (this._inserts) this._inserts.push({ table: this._table, row: r });
        }
        return { data: m.rows, error: null };
      }
      if (m.kind === "upsert") {
        if (this._inserts) {
          this._inserts.push({ table: this._table, row: { ...m.row, _upsert: true as const } });
        }
        const idx = this.rows.findIndex((r) => r[m.conflictKey] === m.row[m.conflictKey]);
        if (idx >= 0) {
          this.rows[idx] = { ...this.rows[idx], ...m.row };
        } else {
          this.rows.push({ ...m.row });
        }
        return { data: [m.row], error: null };
      }
      if (m.kind === "update") {
        for (const r of filtered) {
          const idx = this.rows.indexOf(r);
          if (idx >= 0) this.rows[idx] = { ...this.rows[idx], ...m.patch };
        }
        return { data: filtered, error: null };
      }
      if (m.kind === "delete") {
        for (const r of filtered) {
          const idx = this.rows.indexOf(r);
          if (idx >= 0) this.rows.splice(idx, 1);
        }
        return { data: filtered, error: null };
      }
    }
    return this.exec();
  }

  // ------ filter / ordering (chainable) ------

  select(_cols?: string): this {
    return this;
  }

  eq(col: string, val: unknown): this {
    this.filters.push({ col, op: "eq", val });
    return this;
  }

  neq(col: string, val: unknown): this {
    this.filters.push({ col, op: "neq", val });
    return this;
  }

  not(col: string, op: string, val: unknown): this {
    this.filters.push({ col, op: `not_${op}`, val });
    return this;
  }

  or(filterStr: string): this {
    this.filters.push({ col: "_or", op: "or", val: filterStr });
    return this;
  }

  in(col: string, vals: unknown[]): this {
    this.filters.push({ col, op: "in", val: vals });
    return this;
  }

  ilike(col: string, pattern: string): this {
    this.filters.push({ col, op: "ilike", val: pattern });
    return this;
  }

  gt(col: string, val: unknown): this {
    this.filters.push({ col, op: "gt", val });
    return this;
  }

  gte(col: string, val: unknown): this {
    this.filters.push({ col, op: "gte", val });
    return this;
  }

  lt(col: string, val: unknown): this {
    this.filters.push({ col, op: "lt", val });
    return this;
  }

  lte(col: string, val: unknown): this {
    this.filters.push({ col, op: "lte", val });
    return this;
  }

  limit(n: number): this {
    this.limitVal = n;
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }): this {
    this.orders.push({ col, ascending: opts?.ascending !== false });
    return this;
  }

  // ------ mutations (chainable — terminal via await) ------

  insert(row: Row | Row[]): this {
    this.mutation = { kind: "insert", rows: Array.isArray(row) ? row : [row] };
    return this;
  }

  upsert(row: Row, opts?: { onConflict?: string; ignoreDuplicates?: boolean }): this {
    this.mutation = { kind: "upsert", row, conflictKey: opts?.onConflict ?? "id" };
    return this;
  }

  update(patch: Row): this {
    this.mutation = { kind: "update", patch };
    return this;
  }

  delete(): this {
    this.mutation = { kind: "delete" };
    return this;
  }

  // Suppress count queries — not needed for current tests
  count = undefined;

  // ------ helpers ------

  private applyFilters(): Row[] {
    let result = [...this.rows];
    for (const f of this.filters) {
      if (f.op === "or") {
        const orStr = f.val as string;
        const clauses = orStr.split(",").map((c) => c.trim());
        result = result.filter((r) =>
          clauses.some((clause) => {
            const [colEq, opEq, valEq] = clause.split(".");
            if (!colEq || !opEq || valEq === undefined) return false;
            if (opEq === "eq") return r[colEq] === valEq;
            if (opEq === "is" && valEq === "null") return r[colEq] == null;
            if (opEq === "gte") return String(r[colEq]) >= String(valEq);
            if (opEq === "lte") return String(r[colEq]) <= String(valEq);
            if (opEq === "gt") return String(r[colEq]) > String(valEq);
            if (opEq === "lt") return String(r[colEq]) < String(valEq);
            if (opEq === "neq") return r[colEq] !== valEq;
            return false;
          }),
        );
        continue;
      }
      if (f.op === "eq") result = result.filter((r) => r[f.col] === f.val);
      else if (f.op === "neq") result = result.filter((r) => r[f.col] !== f.val);
      else if (f.op === "not_is" && f.val === null) result = result.filter((r) => r[f.col] != null);
      else if (f.op === "in") {
        const vals = f.val as unknown[];
        result = result.filter((r) => vals.includes(r[f.col]));
      } else if (f.op === "ilike") {
        const p = f.val as string;
        const re = new RegExp(
          "^" + p.replace(/%/g, ".*").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$",
          "i",
        );
        result = result.filter((r) => typeof r[f.col] === "string" && re.test(r[f.col] as string));
      } else if (f.op === "gt") result = result.filter((r) => String(r[f.col]) > String(f.val));
      else if (f.op === "gte") result = result.filter((r) => String(r[f.col]) >= String(f.val));
      else if (f.op === "lt") result = result.filter((r) => String(r[f.col]) < String(f.val));
      else if (f.op === "lte") result = result.filter((r) => String(r[f.col]) <= String(f.val));
    }
    return result;
  }

  exec(): { data: Row[]; error: null } {
    let result = this.applyFilters();
    if (this.orders.length > 0) {
      result = [...result].sort((a, b) => {
        for (const o of this.orders) {
          const va = String(a[o.col] ?? "");
          const vb = String(b[o.col] ?? "");
          const cmp = va.localeCompare(vb);
          if (cmp !== 0) return o.ascending ? cmp : -cmp;
        }
        return 0;
      });
    }
    if (this.limitVal !== null) result = result.slice(0, this.limitVal);
    return { data: result, error: null };
  }

  async maybeSingle(): Promise<{ data: Row | null; error: null }> {
    const { data } = this.exec();
    return { data: data[0] ?? null, error: null };
  }
}

export interface MockAdminClient {
  from(table: string): QueryBuilder;
}

export class SupabaseMock {
  private tables = new Map<string, Row[]>();

  private inserts: { table: string; row: Row }[] = [];

  client: MockAdminClient = {
    from: (table: string) => {
      const rows = this.tables.get(table) ?? [];
      return new QueryBuilder(rows, this.inserts, table);
    },
  };

  seed(table: string, rows: Row[]): void {
    this.tables.set(table, rows.map((r) => ({ ...r })));
  }

  clear(): void {
    this.tables.clear();
    this.inserts.length = 0;
  }

  insertsFor(table: string): Row[] {
    return this.inserts.filter((i) => i.table === table).map((i) => i.row);
  }

  getRows(table: string): Row[] {
    return this.tables.get(table) ?? [];
  }
}

export const supabaseMock = new SupabaseMock();

export function getMockAdminClient(): MockAdminClient {
  return supabaseMock.client;
}

export function resetSupabaseMock(): void {
  supabaseMock.clear();
}
