// AI 查询配置、对话翻译与收藏查询（保存的 DSL）管理。
// 兼容任何 OpenAI 风格（chat/completions）接口。

export type AiConfig = {
  endpoint: string;
  apiKey: string;
  model: string;
};

export type AiQueryResult = {
  query: string;
  empty: boolean;
};

export type AiChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type SavedQuery = {
  id: string;
  name: string;
  query: string;
  createdAt: string;
};

const aiConfigStorageKey = "localMoneyAiConfig";
const savedQueriesStorageKey = "localMoneySavedQueries";

export function loadAiConfig(): AiConfig {
  if (typeof window === "undefined") return { endpoint: "", apiKey: "", model: "" };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(aiConfigStorageKey) || "{}") as Record<string, unknown>;
    return {
      endpoint: typeof parsed.endpoint === "string" ? parsed.endpoint : "",
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      model: typeof parsed.model === "string" ? parsed.model : "",
    };
  } catch {
    return { endpoint: "", apiKey: "", model: "" };
  }
}

export function saveAiConfig(config: AiConfig) {
  window.localStorage.setItem(aiConfigStorageKey, JSON.stringify(config));
}

export function isAiConfigured(config: AiConfig) {
  return Boolean(config.endpoint.trim() && config.apiKey.trim() && config.model.trim());
}

function chatCompletionsUrl(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

function extractJsonObject(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    // 继续尝试提取
  }
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(content.slice(start, end + 1));
    } catch {
      // 忽略
    }
  }
  return null;
}

export async function translateToQuery(
  config: AiConfig,
  question: string,
  categoryNames: string[],
  accountNames: string[],
  history: AiChatTurn[] = []
): Promise<AiQueryResult> {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const systemPrompt = [
    "你是本地记账应用「本地账本」的查询助手。用户用自然语言提问，你把它翻译成下面的查询语言（DSL），只输出 JSON。",
    "DSL 语法：",
    "- 类型：支出 / 收入 / 转账",
    "- 分类：分类:名称，或直接写分类名",
    "- 账户：账户:名称",
    "- 金额：金额>100、金额>=50、金额<30、金额<=200、金额=88",
    "- 日期：日期:2026-08（某月）、日期>2026-01-01、日期:2026-01-01..2026-06-30（范围）。日期一律用 YYYY-MM-DD（横线），禁止用点号",
    "- 备注包含：备注~关键词",
    "- 组合：空格表示并且（and），支持 or、not、括号，例如：支出 and (餐饮 or 交通)",
    "- 统计/排序操作（放在查询最后，只能一个）：",
    "  - 排序:金额 或 排序:金额:升序 / 排序:金额:降序 / 排序:日期",
    "  - 最高支出 / 最低支出 / 最高收入 / 最低收入（单笔极值）",
    "  - 合计:支出 / 合计:收入 / 平均:支出 / 平均:收入",
    "  - count / count:支出 / count:收入（统计笔数）",
    "  - 按月 / 按分类 / 按账户（分组统计合计）",
    "  - 最高月份:支出 / 最高月份:收入（金额最高的月份）",
    "- 结果数量限制：limit:N（如 limit:10，与排序配合取前 N 条；分组时取前 N 组）",
    "- 分组后过滤：having:>=1000 / having:>1000 / having:<500（配合按月/按分类等）",
    "- 分类/账户支持多选（逗号分隔）：分类:餐饮,交通",
    "- 时间别名：今天、昨天、本周、上周、本月、上月、今年、去年、最近一周/一月/三月/半年/一年。别名可以裸写，也可以写成 日期:最近一年、日期:本月。用户说相对时间（如“最近一年”“上个月”）时，必须直接用别名，不要自己换算成具体日期",
    "- “最近N天/周/月/年”中 N 大于十时，必须用阿拉伯数字（如 最近23天、最近15周），禁止写中文数字（如 最近二十三天）",
    "- 相对日期表达式（日期值可用）：-365..0（往前 365 天到今天）、0/0/0..0（本月：月初到今天）、0/-1/0..0/0/0（上月：上月初到本月初，不含本月初）、0/0/-1（本月最后一天）。Y/M/D 中 0 表示当前、负数表示往前；日位 0=月初、负数=月末倒数。可写在 日期: 后面或裸写",
    "- 结果四则运算：单值结果（合计/平均/计数/最高/最低/最高月份）后可直接接 + - * / 数字，如 最近一年 水电 合计:支出 / 12（月均：最近一年=12 个月、最近半年=6、最近一月=1、最近三月=3；用户问“平均每月”“月均”时用 合计:支出 / 月数）",
    `可用分类：${categoryNames.join("、") || "（无）"}`,
    `可用账户：${accountNames.join("、") || "（无）"}`,
    `今天是 ${today}。用户说“这个月”“本月”请用 日期:${today.slice(0, 7)}；说“上个月”请推算出上个月的 YYYY-MM。`,
    "结合对话历史理解指代（如“刚才”“那个查询”“只保留餐饮”），必要时修正或复用之前的查询。",
    '只输出 JSON，格式：{"query": "翻译后的 DSL"}',
    "不要输出任何说明文字；如果问题不适合翻译成查询（例如闲聊、问功能），query 返回空字符串。",
  ].join("\n");

  const body: Record<string, unknown> = {
    model: config.model,
    messages: [
      { role: "system", content: systemPrompt },
      ...history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: "user", content: question },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
    // DeepSeek 等推理模型：显式关闭思考，保证查询翻译快速返回
    thinking: { type: "disabled" },
  };

  const response = await postChat(config, body);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`AI 请求失败（${response.status}）${text ? `：${text.slice(0, 160)}` : ""}`);
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  let content = data.choices?.[0]?.message?.content ?? "";
  let parsed = extractJsonObject(content);

  if (!content.trim() && history.length > 3) {
    // 返回为空时不开启思考，而是把上下文删减到最近 3 条后重试一次
    const retryBody = {
      ...body,
      messages: [
        { role: "system", content: systemPrompt },
        ...history.slice(-3).map((turn) => ({ role: turn.role, content: turn.content })),
        { role: "user", content: question },
      ],
    };
    const retryResponse = await postChat(config, retryBody);
    if (retryResponse.ok) {
      const retryData = (await retryResponse.json()) as { choices?: { message?: { content?: string } }[] };
      content = retryData.choices?.[0]?.message?.content ?? "";
      parsed = extractJsonObject(content);
    }
  }
  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    return {
      query: typeof record.query === "string" ? record.query.trim() : "",
      empty: false,
    };
  }
  return { query: "", empty: true };
}

async function postChat(config: AiConfig, body: Record<string, unknown>): Promise<Response> {
  const url = chatCompletionsUrl(config.endpoint);
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  };
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (response.status === 400) {
    // 部分兼容端点不支持 response_format / thinking，去掉后重试一次
    const retryBody = { ...body };
    delete retryBody.response_format;
    delete retryBody.thinking;
    return fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(retryBody),
    });
  }
  return response;
}

export function loadSavedQueries(): SavedQuery[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(savedQueriesStorageKey) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedQuery =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as SavedQuery).id === "string" &&
        typeof (item as SavedQuery).name === "string" &&
        typeof (item as SavedQuery).query === "string"
    );
  } catch {
    return [];
  }
}

export function persistSavedQueries(queries: SavedQuery[]) {
  window.localStorage.setItem(savedQueriesStorageKey, JSON.stringify(queries));
}

export function addSavedQuery(queries: SavedQuery[], name: string, query: string): SavedQuery[] {
  const item: SavedQuery = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || query,
    query,
    createdAt: new Date().toISOString(),
  };
  return [item, ...queries].slice(0, 50);
}
