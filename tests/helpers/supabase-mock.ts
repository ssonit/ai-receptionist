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

export class QueryBuilder {
  private rows: Row[];

  private filters: FilterOp[] = [];

  private orders: OrderOp[] = [];

  private limitVal: number | null = null;

  constructor(
    rows: Row[],
    private logInserts: { table: string; row: Row }[] | null,
    private tableName: string,
  ) {
    this.rows = [...rows];
  }

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
    this.orders.push({
      col,
      ascending: opts?.ascending !== false,
    });
    return this;
  }

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

      if (f.op === "eq") {
        result = result.filter((r) => r[f.col] === f.val);
      } else if (f.op === "neq") {
        result = result.filter((r) => r[f.col] !== f.val);
      } else if (f.op === "not_is" && f.val === null) {
        result = result.filter((r) => r[f.col] != null);
      } else if (f.op === "in") {
        const vals = f.val as unknown[];
        result = result.filter((r) => vals.includes(r[f.col]));
      } else if (f.op === "ilike") {
        const p = f.val as string;
        const re = new RegExp(
          "^" + p.replace(/%/g, ".*").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$",
          "i",
        );
        result = result.filter(
          (r) => typeof r[f.col] === "string" && re.test(r[f.col] as string),
        );
      } else if (f.op === "gt") {
        result = result.filter((r) => String(r[f.col]) > String(f.val));
      } else if (f.op === "gte") {
        result = result.filter((r) => String(r[f.col]) >= String(f.val));
      } else if (f.op === "lt") {
        result = result.filter((r) => String(r[f.col]) < String(f.val));
      } else if (f.op === "lte") {
        result = result.filter((r) => String(r[f.col]) <= String(f.val));
      }
    }

    return result;
  }

  private applyOrders(input: Row[]): Row[] {
    if (this.orders.length === 0) return input;
    return [...input].sort((a, b) => {
      for (const o of this.orders) {
        const va = String(a[o.col] ?? "");
        const vb = String(b[o.col] ?? "");
        const cmp = va.localeCompare(vb);
        if (cmp !== 0) return o.ascending ? cmp : -cmp;
      }
      return 0;
    });
  }

  /** Execute query — returns filtered + ordered + limited rows. */
  exec(): { data: Row[]; error: null } {
    let result = this.applyFilters();
    result = this.applyOrders(result);
    if (this.limitVal !== null) {
      result = result.slice(0, this.limitVal);
    }
    return { data: result, error: null };
  }

  async maybeSingle(): Promise<{ data: Row | null; error: null }> {
    const { data } = this.exec();
    return { data: data[0] ?? null, error: null };
  }

  async insert(
    row: Row | Row[],
  ): Promise<{ error: null; data?: Row[] }> {
    const rows = Array.isArray(row) ? row : [row];
    for (const r of rows) {
      if (this.logInserts) {
        this.logInserts.push({ table: this.tableName, row: r });
      }
    }
    return { error: null, data: rows };
  }

  async upsert(
    row: Row,
    opts?: { onConflict?: string; ignoreDuplicates?: boolean },
  ): Promise<{ error: null }> {
    if (this.logInserts) {
      this.logInserts.push({ table: this.tableName, row: { ...row, _upsert: true as const } });
    }
    // Merge into stored rows: replace matching row by onConflict key or append
    const conflictKey = opts?.onConflict ?? "id";
    const idx = this.rows.findIndex(
      (r) => r[conflictKey] === row[conflictKey],
    );
    if (idx >= 0) {
      this.rows[idx] = { ...this.rows[idx], ...row };
    } else {
      this.rows.push({ ...row });
    }
    return { error: null };
  }

  async update(
    patch: Row,
  ): Promise<{ error: null }> {
    const { data } = this.exec();
    for (const r of data) {
      const idx = this.rows.indexOf(r);
      if (idx >= 0) {
        this.rows[idx] = { ...this.rows[idx], ...patch };
      }
    }
    return { error: null };
  }

  async delete(): Promise<{ error: null }> {
    const { data } = this.exec();
    for (const r of data) {
      const idx = this.rows.indexOf(r);
      if (idx >= 0) {
        this.rows.splice(idx, 1);
      }
    }
    return { error: null };
  }

  // Suppress count queries — not needed for current tests
  count = undefined;
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
