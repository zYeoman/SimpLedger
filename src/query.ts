// 简单查询语言（DSL）解析器：把用户输入的筛选条件解析成可执行的判定函数。
//
// 语法示例：
//   支出 餐饮 金额>100 日期:2026-08 备注~星巴克
//   支持 and（空格）、or、not、括号，如：支出 and (餐饮 or 交通)

export interface QueryTransaction {
  type: string;
  category?: string;
  account?: string;
  toAccount?: string;
  amount: number;
  date: string;
  note?: string;
}

type FieldName = "type" | "category" | "account" | "amount" | "date" | "note";

type Ast =
  | { kind: "field"; field: FieldName; op: "eq" | "gt" | "gte" | "lt" | "lte" | "contains" | "range"; value: string; value2?: string }
  | { kind: "not"; child: Ast }
  | { kind: "or"; left: Ast; right: Ast }
  | { kind: "and"; left: Ast; right: Ast };

export type QueryResult =
  | { error: string }
  | {
      predicate: (transaction: QueryTransaction) => boolean;
      hasDateConstraint: boolean;
      operation?: QueryOperation;
      limit?: number;
    };

export type QueryOperation =
  | { kind: "sort"; field: "amount" | "date"; direction: "asc" | "desc" }
  | { kind: "extreme"; type: "expense" | "income"; mode: "max" | "min" }
  | { kind: "sum"; type: "expense" | "income" }
  | { kind: "average"; type: "expense" | "income" }
  | { kind: "group"; by: "month" | "category" | "account"; type?: "expense" | "income" }
  | { kind: "top-month"; type: "expense" | "income" };

export type QueryOutcome =
  | { kind: "list"; items: QueryTransaction[]; total?: number }
  | { kind: "extreme"; transaction?: QueryTransaction }
  | { kind: "sum"; amount: number; count: number }
  | { kind: "average"; amount: number; count: number }
  | { kind: "group"; groups: { key: string; amount: number; count: number }[] }
  | { kind: "top-month"; key: string; amount: number; count: number };

const TYPE_WORDS: Record<string, string> = {
  支出: "expense",
  expense: "expense",
  收入: "income",
  income: "income",
  转账: "transfer",
  transfer: "transfer",
};

const FIELD_PATTERN =
  /^(分类|category|账户|account|金额|amount|日期|date|备注|note)(>=|<=|>|<|:|~|=)(.+)$/;

const OPERATOR_MAP: Record<string, "eq" | "gt" | "gte" | "lt" | "lte"> = {
  ":": "eq",
  "=": "eq",
  ">": "gt",
  ">=": "gte",
  "<": "lt",
  "<=": "lte",
};

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const char of input) {
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      if (current) {
        tokens.push(current);
        current = "";
      }
      quote = char;
      current = char;
      continue;
    }
    if (char === "(" || char === ")") {
      if (current) {
        tokens.push(current);
        current = "";
      }
      tokens.push(char);
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens.map((token) => {
    if (
      (token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'"))
    ) {
      return token.slice(1, -1);
    }
    return token;
  });
}

// 把 "2026-07" 这类只写月份的日期规范成完整日期，方便范围比较
function normalizeDateBound(value: string, isEnd: boolean): string {
  if (/^\d{4}-\d{2}$/.test(value)) {
    return isEnd ? `${value}-31` : `${value}-01`;
  }
  return value;
}

function parseTerm(token: string, categoryNames: string[]): Ast | { error: string } {
  const typeValue = TYPE_WORDS[token];
  if (typeValue) {
    return { kind: "field", field: "type", op: "eq", value: typeValue };
  }

  const fieldMatch = FIELD_PATTERN.exec(token);
  if (fieldMatch) {
    const fieldName = fieldMatch[1];
    const operator = fieldMatch[2];
    const rawValue = fieldMatch[3].trim();

    if (fieldName === "分类" || fieldName === "category") {
      if (!rawValue) return { error: `“${token}”缺少分类名` };
      return { kind: "field", field: "category", op: "eq", value: rawValue };
    }
    if (fieldName === "账户" || fieldName === "account") {
      if (!rawValue) return { error: `“${token}”缺少账户名` };
      return { kind: "field", field: "account", op: "eq", value: rawValue };
    }
    if (fieldName === "金额" || fieldName === "amount") {
      if (!/^\d+(\.\d+)?$/.test(rawValue)) {
        return { error: `金额需要是数字，例如 金额>100` };
      }
      const op = OPERATOR_MAP[operator] ?? "eq";
      return { kind: "field", field: "amount", op, value: rawValue };
    }
    if (fieldName === "日期" || fieldName === "date") {
      const rangeParts = rawValue.split("..");
      if (rangeParts.length === 2) {
        return {
          kind: "field",
          field: "date",
          op: "range",
          value: normalizeDateBound(rangeParts[0].trim(), false),
          value2: normalizeDateBound(rangeParts[1].trim(), true),
        };
      }
      const op = OPERATOR_MAP[operator] ?? "eq";
      return { kind: "field", field: "date", op, value: rawValue };
    }
    if (fieldName === "备注" || fieldName === "note") {
      if (!rawValue) return { error: `“${token}”缺少关键词` };
      return { kind: "field", field: "note", op: "contains", value: rawValue };
    }
  }

  if (categoryNames.includes(token)) {
    return { kind: "field", field: "category", op: "eq", value: token };
  }

  return { error: `无法识别“${token}”（支持类型、分类、账户、金额、日期、备注，或括号/or/not）` };
}

function parseOperationToken(token: string): QueryOperation | null {
  const sortMatch = /^排序:(金额|日期)(?::(升序|降序))?$/.exec(token);
  if (sortMatch) {
    const field = sortMatch[1] === "金额" ? "amount" : "date";
    const explicit = sortMatch[2];
    return {
      kind: "sort",
      field,
      direction: explicit === "升序" ? "asc" : explicit === "降序" ? "desc" : field === "amount" ? "desc" : "asc",
    };
  }
  const extremeMatch = /^(最高|最低)(支出|收入)$/.exec(token);
  if (extremeMatch) {
    return {
      kind: "extreme",
      type: extremeMatch[2] === "支出" ? "expense" : "income",
      mode: extremeMatch[1] === "最高" ? "max" : "min",
    };
  }
  const sumMatch = /^合计(?::(支出|收入))?$/.exec(token);
  if (sumMatch) {
    return { kind: "sum", type: sumMatch[1] === "收入" ? "income" : "expense" };
  }
  const averageMatch = /^平均(?::(支出|收入))?$/.exec(token);
  if (averageMatch) {
    return { kind: "average", type: averageMatch[1] === "收入" ? "income" : "expense" };
  }
  const monthGroupMatch = /^按月(?::(支出|收入))?$/.exec(token);
  if (monthGroupMatch) {
    return {
      kind: "group",
      by: "month",
      type: monthGroupMatch[1] === "收入" ? "income" : monthGroupMatch[1] === "支出" ? "expense" : undefined,
    };
  }
  if (token === "按分类") return { kind: "group", by: "category" };
  if (token === "按账户") return { kind: "group", by: "account" };
  const topMonthMatch = /^最高月份(?::(支出|收入))?$/.exec(token);
  if (topMonthMatch) {
    return { kind: "top-month", type: topMonthMatch[1] === "收入" ? "income" : "expense" };
  }
  return null;
}

export function parseQuery(input: string, categoryNames: string[] = []): QueryResult {
  const tokens = tokenize(input);
  if (tokens.length === 0) {
    return { predicate: () => true, hasDateConstraint: false };
  }

  let operation: QueryOperation | undefined;
  let limit: number | undefined;
  const operationTokenIndexes = new Set<number>();
  for (let index = 0; index < tokens.length; index++) {
    const limitMatch = /^limit:(\d+)$/i.exec(tokens[index]);
    if (limitMatch) {
      if (limit !== undefined) return { error: "limit 只能出现一次" };
      limit = Number(limitMatch[1]);
      operationTokenIndexes.add(index);
      continue;
    }
    const parsedOperation = parseOperationToken(tokens[index]);
    if (parsedOperation) {
      if (operation) {
        return { error: "一次只能使用一个排序/统计操作（如 排序:金额、合计:支出、按月）" };
      }
      operation = parsedOperation;
      operationTokenIndexes.add(index);
    }
  }

  const filterTokens = tokens.filter((_, index) => !operationTokenIndexes.has(index));
  let index = 0;
  const peek = () => filterTokens[index];
  const next = () => filterTokens[index++];

  function parseOr(): Ast | { error: string } {
    let left = parseAnd();
    if ("error" in left) return left;
    while (peek() === "or" || peek() === "或") {
      next();
      const right = parseAnd();
      if ("error" in right) return right;
      left = { kind: "or", left, right };
    }
    return left;
  }

  function parseAnd(): Ast | { error: string } {
    let left = parseUnary();
    if ("error" in left) return left;
    while (peek() !== undefined && peek() !== ")" && peek() !== "or" && peek() !== "或") {
      if (peek() === "and" || peek() === "与") {
        next();
        continue;
      }
      const right = parseUnary();
      if ("error" in right) return right;
      left = { kind: "and", left, right };
    }
    return left;
  }

  function parseUnary(): Ast | { error: string } {
    if (peek() === "not" || peek() === "非") {
      next();
      const child = parseUnary();
      if ("error" in child) return child;
      return { kind: "not", child };
    }
    if (peek() === "(") {
      next();
      const inner = parseOr();
      if ("error" in inner) return inner;
      if (peek() !== ")") return { error: "缺少右括号）" };
      next();
      return inner;
    }
    const token = next();
    if (token === undefined) return { error: "筛选条件不完整" };
    return parseTerm(token, categoryNames);
  }

  let ast: Ast | null = null;
  if (filterTokens.length > 0) {
    const parsed = parseOr();
    if ("error" in parsed) return { error: parsed.error };
    ast = parsed;
    if (index < filterTokens.length) return { error: `无法识别的“${filterTokens[index]}”` };
  }

  function hasDateConstraint(node: Ast | null): boolean {
    if (!node) return false;
    if (node.kind === "field") return node.field === "date";
    if (node.kind === "not") return hasDateConstraint(node.child);
    return hasDateConstraint(node.left) || hasDateConstraint(node.right);
  }

  function matches(node: Ast, transaction: QueryTransaction): boolean {
    if (node.kind === "not") return !matches(node.child, transaction);
    if (node.kind === "and") return matches(node.left, transaction) && matches(node.right, transaction);
    if (node.kind === "or") return matches(node.left, transaction) || matches(node.right, transaction);

    const value = node.value;
    switch (node.field) {
      case "type":
        return transaction.type === value;
      case "category":
        return (transaction.category ?? "") === value;
      case "account":
        return (transaction.account ?? "") === value || (transaction.toAccount ?? "") === value;
      case "amount": {
        const target = Number(value);
        switch (node.op) {
          case "gt":
            return transaction.amount > target;
          case "gte":
            return transaction.amount >= target;
          case "lt":
            return transaction.amount < target;
          case "lte":
            return transaction.amount <= target;
          default:
            return transaction.amount === target;
        }
      }
      case "date": {
        if (node.op === "range") {
          return transaction.date >= node.value && transaction.date <= (node.value2 ?? "");
        }
        switch (node.op) {
          case "gt":
            return transaction.date > value;
          case "gte":
            return transaction.date >= value;
          case "lt":
            return transaction.date < value;
          case "lte":
            return transaction.date <= value;
          default:
            return transaction.date === value || transaction.date.startsWith(value);
        }
      }
      case "note":
        return (transaction.note ?? "").toLowerCase().includes(value.toLowerCase());
    }
  }

  const predicate = (transaction: QueryTransaction) => (ast ? matches(ast, transaction) : true);
  return { predicate, hasDateConstraint: hasDateConstraint(ast), operation, limit };
}

export function executeQuery(
  input: string,
  transactions: QueryTransaction[],
  categoryNames: string[] = []
): { outcome: QueryOutcome } | { error: string } {
  const parsed = parseQuery(input, categoryNames);
  if ("error" in parsed) return { error: parsed.error };
  const filtered = transactions.filter(parsed.predicate);
  const operation = parsed.operation;

  if (!operation || operation.kind === "sort") {
    const items = [...filtered];
    if (operation && operation.kind === "sort") {
      items.sort((a, b) => {
        const av = operation.field === "amount" ? a.amount : a.date;
        const bv = operation.field === "amount" ? b.amount : b.date;
        if (av === bv) return 0;
        return operation.direction === "desc" ? (av < bv ? 1 : -1) : av < bv ? -1 : 1;
      });
    }
    return { outcome: { kind: "list", items: parsed.limit !== undefined ? items.slice(0, parsed.limit) : items } };
  }

  if (operation.kind === "extreme") {
    const typeItems = filtered.filter((item) => item.type === operation.type);
    if (typeItems.length === 0) return { outcome: { kind: "extreme", transaction: undefined } };
    const target = typeItems.reduce((best, item) =>
      operation.mode === "max"
        ? item.amount > best.amount
          ? item
          : best
        : item.amount < best.amount
          ? item
          : best
    );
    return { outcome: { kind: "extreme", transaction: target } };
  }

  if (operation.kind === "sum" || operation.kind === "average") {
    const typeItems = filtered.filter((item) => item.type === operation.type);
    const amount = typeItems.reduce((sum, item) => sum + item.amount, 0);
    return operation.kind === "sum"
      ? { outcome: { kind: "sum", amount, count: typeItems.length } }
      : {
          outcome: {
            kind: "average",
            amount: typeItems.length ? amount / typeItems.length : 0,
            count: typeItems.length,
          },
        };
  }

  if (operation.kind === "group") {
    const scoped = operation.type ? filtered.filter((item) => item.type === operation.type) : filtered;
    const map = new Map<string, { amount: number; count: number }>();
    for (const item of scoped) {
      const key =
        operation.by === "month"
          ? item.date.slice(0, 7)
          : operation.by === "category"
            ? item.category || "未分类"
            : item.account || "未设置";
      const entry = map.get(key) ?? { amount: 0, count: 0 };
      entry.amount += item.amount;
      entry.count += 1;
      map.set(key, entry);
    }
    const groups = [...map.entries()]
      .map(([key, value]) => ({ key, amount: value.amount, count: value.count }))
      .sort((a, b) => b.amount - a.amount);
    return {
      outcome: {
        kind: "group",
        groups: parsed.limit !== undefined ? groups.slice(0, parsed.limit) : groups,
      },
    };
  }

  const scoped = filtered.filter((item) => item.type === operation.type);
  const map = new Map<string, { amount: number; count: number }>();
  for (const item of scoped) {
    const key = item.date.slice(0, 7);
    const entry = map.get(key) ?? { amount: 0, count: 0 };
    entry.amount += item.amount;
    entry.count += 1;
    map.set(key, entry);
  }
  const top = [...map.entries()].sort((a, b) => b[1].amount - a[1].amount)[0];
  return {
    outcome: top
      ? { kind: "top-month", key: top[0], amount: top[1].amount, count: top[1].count }
      : { kind: "top-month", key: "", amount: 0, count: 0 },
  };
}
