const latestKey = "local-money-latest.json";

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Authorization,Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (!env.BACKUP_BUCKET) {
      return json({ error: "R2 binding BACKUP_BUCKET is missing" }, 500, corsHeaders);
    }

    if (!isAuthorized(request, env.BACKUP_TOKEN)) {
      return json({ error: "Unauthorized" }, 401, corsHeaders);
    }

    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/backup") {
      const payload = await request.json();
      if (payload?.app !== "local-money" || payload?.version !== 1) {
        return json({ error: "Invalid backup payload" }, 400, corsHeaders);
      }

      const body = JSON.stringify(payload, null, 2);
      const stampedKey = `history/local-money-${fileSafeStamp(new Date())}.json`;
      const options = {
        httpMetadata: {
          contentType: "application/json; charset=utf-8",
        },
      };

      await env.BACKUP_BUCKET.put(stampedKey, body, options);
      await env.BACKUP_BUCKET.put(latestKey, body, options);
      return json({ ok: true, latestKey, historyKey: stampedKey }, 200, corsHeaders);
    }

    if (request.method === "GET" && url.pathname === "/backup/latest") {
      const object = await env.BACKUP_BUCKET.get(latestKey);
      if (!object) {
        return json({ error: "Backup not found" }, 404, corsHeaders);
      }
      return new Response(object.body, {
        headers: {
          ...corsHeaders,
          "Content-Type": object.httpMetadata?.contentType || "application/json; charset=utf-8",
        },
      });
    }

    return json({ error: "Not found" }, 404, corsHeaders);
  },
};

function isAuthorized(request, token) {
  if (!token) return false;
  const authorization = request.headers.get("Authorization") || "";
  return authorization === `Bearer ${token}`;
}

function json(value, status, headers) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function fileSafeStamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join("");
}
