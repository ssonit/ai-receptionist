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
  | { kind: "upsert"; rows: Row[]; conflictKeys: string[] }
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

  /** The seeded array itself, so insert/upsert can append to stored state. */
  private _stored: Row[];

  constructor(
    rows: Row[],
    inserts: { table: string; row: Row }[] | null,
    tableName: string,
  ) {
    this.rows = [...rows];
    this._stored = rows;
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
          const created = { ...r };
          this.rows.push(created);
          this._stored.push(created);
        }
        return { data: m.rows, error: null };
      }
      if (m.kind === "upsert") {
        for (const row of m.rows) {
          if (this._inserts) {
            this._inserts.push({ table: this._table, row: { ...row, _upsert: true as const } });
          }
          // Composite conflict targets ("workspace_id,cal_booking_uid") must
          // compare every column. Treating the whole string as one key made
          // every row look like a match on `undefined === undefined`.
          const existing = this.rows.find((r) =>
            m.conflictKeys.every((key) => r[key] === row[key]),
          );
          if (existing) {
            Object.assign(existing, row);
          } else {
            const created = { ...row };
            this.rows.push(created);
            this._stored.push(created);
          }
        }
        return { data: m.rows, error: null };
      }
      if (m.kind === "update") {
        // Mutate in place: `rows` is a shallow copy of the seeded array, so
        // replacing the element would only patch the copy and `getRows()`
        // would still report the pre-update state.
        for (const r of filtered) {
          Object.assign(r, m.patch);
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

  is(col: string, val: unknown): this {
    this.filters.push({ col, op: "is", val });
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

  upsert(
    row: Row | Row[],
    opts?: { onConflict?: string; ignoreDuplicates?: boolean },
  ): this {
    const conflictKeys = (opts?.onConflict ?? "id")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    // PostgREST accepts a batch; upsertCalBookings sends one.
    this.mutation = {
      kind: "upsert",
      rows: Array.isArray(row) ? row : [row],
      conflictKeys,
    };
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
      else if (f.op === "is" && f.val === null) result = result.filter((r) => r[f.col] == null);
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
    // Copy on read: PostgREST hands back freshly parsed JSON, so callers must
    // not receive live references into the seeded rows (a later update would
    // otherwise appear to mutate a value the caller read earlier).
    return { data: result.map((r) => ({ ...r })), error: null };
  }

  async maybeSingle(): Promise<{ data: Row | null; error: null }> {
    const { data } = this.exec();
    return { data: data[0] ?? null, error: null };
  }
}

export interface MockAuthUser {
  email: string;
  email_confirmed_at: string | null;
}

export interface MockAdminClient {
  from(table: string): QueryBuilder;
  auth: {
    admin: {
      getUserById(id: string): Promise<{
        data: { user: { id: string; email: string; email_confirmed_at: string | null } | null };
        error: { message: string } | null;
      }>;
    };
  };
}

export class SupabaseMock {
  private tables = new Map<string, Row[]>();

  private inserts: { table: string; row: Row }[] = [];

  private authUsers = new Map<string, MockAuthUser>();

  client: MockAdminClient = {
    from: (table: string) => {
      const rows = this.tables.get(table) ?? [];
      return new QueryBuilder(rows, this.inserts, table);
    },
    auth: {
      admin: {
        getUserById: async (id: string) => {
          const user = this.authUsers.get(id);
          if (!user) {
            return {
              data: { user: null },
              error: { message: "User not found" },
            };
          }
          return {
            data: {
              user: {
                id,
                email: user.email,
                email_confirmed_at: user.email_confirmed_at,
              },
            },
            error: null,
          };
        },
      },
    },
  };

  seed(table: string, rows: Row[]): void {
    this.tables.set(table, rows.map((r) => ({ ...r })));
  }

  seedAuthUser(id: string, user: MockAuthUser): void {
    this.authUsers.set(id, { ...user });
  }

  clear(): void {
    this.tables.clear();
    this.inserts.length = 0;
    this.authUsers.clear();
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
