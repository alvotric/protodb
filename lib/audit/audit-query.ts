export const AUDIT_PAGE_SIZE_DEFAULT = 25;
export const AUDIT_PAGE_SIZE_MAX = 50;
const AUDIT_PAGE_MAX = 100_000;
const FILTER_MAX_LENGTH = 200;

export type AuditResult = "success" | "failed";
export type AuditQueryFilters = {
  actor: string;
  action: string;
  resource: string;
  result: AuditResult | "";
  from: string;
  to: string;
  search: string;
  page: number;
  pageSize: number;
};

export class AuditQueryError extends Error {}

const ALLOWED_QUERY_KEYS = new Set(["actor", "action", "resource", "result", "from", "to", "search", "page", "pageSize"]);

function singleParam(params: URLSearchParams, name: string): string | null {
  const values = params.getAll(name);
  if (values.length > 1) throw new AuditQueryError(`Parameter "${name}" must be provided only once.`);
  return values[0] ?? null;
}

function readFilter(params: URLSearchParams, name: string): string {
  const raw = singleParam(params, name);
  if (raw === null) return "";
  const value = raw.trim();
  if (value.length > FILTER_MAX_LENGTH) {
    throw new AuditQueryError(`Parameter "${name}" must not exceed ${FILTER_MAX_LENGTH} characters.`);
  }
  return value;
}

function readDate(params: URLSearchParams, name: "from" | "to"): string {
  const raw = singleParam(params, name);
  if (raw === null || raw === "") return "";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const dateTimeMatch = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|([+-])(\d{2}):(\d{2}))$/);
  const dateTime = dateTimeMatch !== null;
  if (!dateOnly && !dateTime) {
    throw new AuditQueryError(`Parameter "${name}" must be an ISO date or timezone-qualified timestamp.`);
  }
  const datePart = dateOnly ? raw : dateTimeMatch?.[1];
  const validDate = datePart ? new Date(`${datePart}T00:00:00.000Z`) : null;
  if (!datePart || !validDate || Number.isNaN(validDate.getTime()) || validDate.toISOString().slice(0, 10) !== datePart) {
    throw new AuditQueryError(`Parameter "${name}" is not a valid date.`);
  }
  if (dateTimeMatch) {
    const [, , hour, minute, second = "0", , zone, , offsetHour, offsetMinute] = dateTimeMatch;
    if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 ||
        (zone !== "Z" && (Number(offsetHour) > 14 || Number(offsetMinute) > 59 ||
          (Number(offsetHour) === 14 && Number(offsetMinute) !== 0)))) {
      throw new AuditQueryError(`Parameter "${name}" is not a valid timestamp.`);
    }
  }
  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) {
    throw new AuditQueryError(`Parameter "${name}" is not a valid date.`);
  }
  return value.toISOString();
}

function readInteger(params: URLSearchParams, name: "page" | "pageSize", defaultValue: number): number {
  const raw = singleParam(params, name);
  if (raw === null || raw === "") return defaultValue;
  if (!/^\d+$/.test(raw)) throw new AuditQueryError(`Parameter "${name}" must be a non-negative integer.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new AuditQueryError(`Parameter "${name}" is outside the supported range.`);
  return value;
}

export function parseAuditQuery(params: URLSearchParams): AuditQueryFilters {
  for (const key of params.keys()) {
    if (!ALLOWED_QUERY_KEYS.has(key)) throw new AuditQueryError(`Unknown audit filter "${key}".`);
  }

  const actor = readFilter(params, "actor");
  const action = readFilter(params, "action");
  const resource = readFilter(params, "resource");
  const resultValue = singleParam(params, "result") ?? "";
  if (resultValue !== "" && resultValue !== "success" && resultValue !== "failed") {
    throw new AuditQueryError('Parameter "result" must be "success" or "failed".');
  }
  const from = readDate(params, "from");
  const to = readDate(params, "to");
  if (from && to && new Date(from).getTime() >= new Date(to).getTime()) {
    throw new AuditQueryError('"from" must be earlier than "to". The start is inclusive and the end is exclusive.');
  }

  const page = readInteger(params, "page", 0);
  if (page > AUDIT_PAGE_MAX) throw new AuditQueryError(`Parameter "page" must not exceed ${AUDIT_PAGE_MAX}.`);
  const pageSize = readInteger(params, "pageSize", AUDIT_PAGE_SIZE_DEFAULT);
  if (pageSize < 1 || pageSize > AUDIT_PAGE_SIZE_MAX) {
    throw new AuditQueryError(`Parameter "pageSize" must be between 1 and ${AUDIT_PAGE_SIZE_MAX}.`);
  }

  return { actor, action, resource, result: resultValue, from, to, search: readFilter(params, "search"), page, pageSize };
}

export type AuditSqlStatements = {
  count: { text: string; values: unknown[] };
  list: { text: string; values: unknown[] };
};

export function buildAuditSql(filters: AuditQueryFilters): AuditSqlStatements {
  const conditions: string[] = [];
  const values: unknown[] = [];
  const add = (condition: (placeholder: string) => string, value: unknown) => {
    values.push(value);
    conditions.push(condition(`$${values.length}`));
  };

  if (filters.actor) add((p) => `position(lower(${p}) in lower(actor)) > 0`, filters.actor);
  if (filters.action) add((p) => `position(lower(${p}) in lower(action)) > 0`, filters.action);
  if (filters.resource) add((p) => `position(lower(${p}) in lower(resource)) > 0`, filters.resource);
  if (filters.result) add((p) => `result = ${p}`, filters.result);
  if (filters.from) add((p) => `at >= ${p}::timestamptz`, filters.from);
  if (filters.to) add((p) => `at < ${p}::timestamptz`, filters.to);
  if (filters.search) {
    add(
      (p) => `position(lower(${p}) in lower(concat_ws(' ', actor, action, resource, result))) > 0`,
      filters.search
    );
  }

  const where = conditions.length ? ` where ${conditions.join(" and ")}` : "";
  const offset = filters.page * filters.pageSize;
  if (!Number.isSafeInteger(offset)) throw new AuditQueryError("The requested page is outside the supported range.");

  return {
    count: {
      text: `select count(*)::text as total from protodb_admin.audit_log${where}`,
      values,
    },
    list: {
      text: `select id::text as id, actor, action, resource, result, ip, at
            from protodb_admin.audit_log${where}
            order by at desc, id desc
            limit $${values.length + 1} offset $${values.length + 2}`,
      values: [...values, filters.pageSize, offset],
    },
  };
}

export function canReadAudit(role: string): boolean {
  return role === "Owner" || role === "Admin";
}
