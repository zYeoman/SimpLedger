// AI 查询配置、对话翻译与收藏查询（保存的 DSL）管理。
// 兼容任何 OpenAI 风格（chat/completions）接口。

export type AiConfig = {
  endpoint: string;
  apiKey: string;
  model: string;
};

export type AiQueryResult = {
  answer: string;
  query: string;
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
    "- 日期：日期:2026-08（某月）、日期>2026-01-01、日期:2026-01-01..2026-06-30（范围）",
    "- 备注包含：备注~关键词",
    "- 组合：空格表示并且（and），支持 or、not、括号，例如：支出 and (餐饮 or 交通)",
    "- 统计/排序操作（放在查询最后，只能一个）：",
    "  - 排序:金额 或 排序:金额:升序 / 排序:金额:降序 / 排序:日期",
    "  - 最高支出 / 最低支出 / 最高收入 / 最低收入（单笔极值）",
    "  - 合计:支出 / 合计:收入 / 平均:支出 / 平均:收入",
    "  - 按月 / 按分类 / 按账户（分组统计合计）",
    "  - 最高月份:支出 / 最高月份:收入（金额最高的月份）",
    "- 结果数量限制：limit:N（如 limit:10，与排序配合取前 N 条；分组时取前 N 组）",
    `可用分类：${categoryNames.join("、") || "（无）"}`,
    `可用账户：${accountNames.join("、") || "（无）"}`,
    `今天是 ${today}。用户说“这个月”“本月”请用 日期:${today.slice(0, 7)}；说“上个月”请推算出上个月的 YYYY-MM。`,
    "结合对话历史理解指代（如“刚才”“那个查询”“只保留餐饮”），必要时修正或复用之前的查询。",
    '只输出 JSON，格式：{"answer": "给用户的一句话说明", "query": "翻译后的 DSL"}',
    "如果问题不适合翻译成查询（例如闲聊、问功能），query 返回空字符串，answer 正常回答。",
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

  const isEffectivelyEmpty = (text: string, obj: unknown): boolean => {
    if (!text.trim()) return true;
    if (obj && typeof obj === "object") {
      const record = obj as Record<string, unknown>;
      const answer = typeof record.answer === "string" ? record.answer : "";
      const query = typeof record.query === "string" ? record.query : "";
      return answer.trim() === "" && query.trim() === "";
    }
    return false;
  };

  if (isEffectivelyEmpty(content, parsed) && history.length > 3) {
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
      answer: typeof record.answer === "string" ? record.answer : "",
      query: typeof record.query === "string" ? record.query.trim() : "",
    };
  }
  return { answer: content.trim() || "（AI 没有返回有效内容）", query: "" };
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
