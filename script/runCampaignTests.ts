import "dotenv/config";

type Json = Record<string, any>;

const baseUrl = (process.env.TEST_BASE_URL ?? "http://localhost:5000").replace(/\/+$/, "");
const phone = process.argv[2];
const sender = process.argv[3];
const messageArg = process.argv.slice(4).join(" ").trim();

const defaultMessage =
  "ULTIMO AVISO DE COBRANZA: Tiene un saldo vencido. Regularice hoy para evitar gestion de cobranza externa. Evite mora. Responda hoy mismo. Contacto: 22 234 5678.";

const message = messageArg || defaultMessage;

if (!phone || !sender) {
  console.error(
    "Usage: node --import tsx script/runCampaignTests.ts <phone> <sender> [message]"
  );
  process.exit(1);
}

const adminUser = process.env.ADMIN_USERNAME || "admin";
const adminPass = process.env.ADMIN_PASSWORD || "admin123";

const fetchJson = async (url: string, options: RequestInit, label: string) => {
  const res = await fetch(url, options);
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    throw new Error(`${label} failed (${res.status}): ${text}`);
  }

  return { res, data };
};

const login = async () => {
  const { res } = await fetchJson(
    `${baseUrl}/api/auth/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: adminUser, password: adminPass }),
    },
    "login"
  );

  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("No session cookie returned by login");
  }

  return setCookie.split(";")[0];
};

const run = async () => {
  const cookie = await login();
  const authHeaders = { "Content-Type": "application/json", Cookie: cookie };

  const [poolsRes, gsmPoolsRes, gsmLinesRes] = await Promise.all([
    fetchJson(`${baseUrl}/api/pools`, { method: "GET", headers: authHeaders }, "get pools"),
    fetchJson(`${baseUrl}/api/gsm-pools`, { method: "GET", headers: authHeaders }, "get gsm pools"),
    fetchJson(`${baseUrl}/api/gsm-lines`, { method: "GET", headers: authHeaders }, "get gsm lines"),
  ]);

  const waPoolName = process.env.TEST_WA_POOL_NAME ?? "Pool !";
  const smsPoolName = process.env.TEST_SMS_POOL_NAME ?? "imfpip";
  const smsLineName = process.env.TEST_SMS_LINE_NAME ?? "Infobip";

  const pools = poolsRes.data as Json[];
  const gsmPools = gsmPoolsRes.data as Json[];
  const gsmLines = gsmLinesRes.data as Json[];

  const waPool = pools.find((p) => p.name === waPoolName);
  if (!waPool) {
    throw new Error(`WhatsApp pool not found: ${waPoolName}`);
  }

  const smsPool = gsmPools.find((p) => p.name === smsPoolName);
  if (!smsPool) {
    throw new Error(`SMS pool not found: ${smsPoolName}`);
  }

  const smsLine = gsmLines.find((l) => l.name === smsLineName);
  if (!smsLine) {
    throw new Error(`SMS line not found: ${smsLineName}`);
  }

  const urlTemplate = String(smsLine.urlTemplate ?? "");
  if (urlTemplate.toLowerCase().startsWith("infobip")) {
    try {
      const parsed = new URL(urlTemplate);
      const currentFrom = parsed.searchParams.get("from") ?? "";
      if (currentFrom !== sender) {
        parsed.searchParams.set("from", sender);
        await fetchJson(
          `${baseUrl}/api/gsm-lines/${smsLine.id}`,
          {
            method: "PATCH",
            headers: authHeaders,
            body: JSON.stringify({ urlTemplate: parsed.toString() }),
          },
          "update infobip sender"
        );
      }
    } catch {
      // ignore if URL parsing fails
    }
  }

  const suffix = new Date().toISOString().replace(/[:.]/g, "-");

  const tempPoolRes = await fetchJson(
    `${baseUrl}/api/pools`,
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: `TEMP-FALLBACK-${suffix}`,
        strategy: "competitive",
        delayBase: 1000,
        delayVariation: 0,
        sessionIds: ["__fallback__"],
        active: true,
      }),
    },
    "create temp pool"
  );

  const tempPool = tempPoolRes.data as Json;

  const campaignPayloads = [
    {
      name: `TEST WA ${suffix}`,
      message,
      channel: "whatsapp",
      poolId: waPool.id,
    },
    {
      name: `TEST SMS ${suffix}`,
      message,
      channel: "sms",
      smsPoolId: smsPool.id,
    },
    {
      name: `TEST WA->SMS ${suffix}`,
      message,
      channel: "whatsapp_fallback_sms",
      poolId: tempPool.id,
      smsPoolId: smsPool.id,
    },
  ];

  const campaigns = [];
  for (const payload of campaignPayloads) {
    const { data } = await fetchJson(
      `${baseUrl}/api/campaigns`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(payload),
      },
      "create campaign"
    );
    campaigns.push(data);
  }

  await fetchJson(
    `${baseUrl}/api/debtors/bulk`,
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(
        campaigns.map((campaign) => ({
          name: campaign.name,
          phone,
          debt: 1,
          status: "disponible",
          campaignId: campaign.id,
        }))
      ),
    },
    "create debtors"
  );

  for (const campaign of campaigns) {
    await fetchJson(
      `${baseUrl}/api/campaigns/${campaign.id}/start`,
      { method: "POST", headers: authHeaders },
      "start campaign"
    );
  }

  console.log("TEST_CAMPAIGNS_STARTED", campaigns.map((c) => ({ id: c.id, name: c.name })));
  console.log("NOTE", "Temp pool created for fallback:", tempPool.id);
};

run().catch((error) => {
  console.error("TEST_ERROR", error?.message ?? error);
  process.exit(1);
});
