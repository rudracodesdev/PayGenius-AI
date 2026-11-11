import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { invoices, transactionLogs } from "../../db/schema.ts";

const PAYPAL_API_BASE = "https://api-m.sandbox.paypal.com";

const app = new Hono();

function paypalCredentials() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

async function getPaypalToken(): Promise<string | null> {
  const creds = paypalCredentials();
  if (!creds) return null;
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

// PayGuard Risk Evaluator: deterministic heuristics on amount and email domain anomalies.
function analyzeRisk(amount: number, clientEmail: string) {
  let score = 15;
  if (amount > 1000) score += 40;
  if (/temp|test/i.test(clientEmail)) score += 30;
  const status = score > 60 ? "HIGH" : score > 30 ? "MEDIUM" : "LOW";
  return { score, status };
}

// Invoice Ingestion Agent: extracts amount and customer entity from a natural language brief.
function parseInvoicePrompt(prompt: string, clientEmail: string) {
  const amountMatch = prompt.match(/\$\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/);
  const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, "")) : 150;

  const entityMatch =
    prompt.match(/\bfor\s+([A-Z][\w&.-]*(?:\s+[A-Z][\w&.-]*)*)\s*:/) ||
    prompt.match(/\b(?:invoice|bill)\s+([A-Z][\w&.-]*(?:\s+[A-Z][\w&.-]*)*)/i);
  const local = clientEmail.split("@")[0];
  const clientName = entityMatch?.[1]?.trim() || local.charAt(0).toUpperCase() + local.slice(1);

  return { amount, clientName: clientName.slice(0, 120) };
}

app.get("/api/config", (c) => {
  const creds = paypalCredentials();
  return c.json({
    paypalClientId: creds?.clientId ?? null,
    paypalMode: creds ? "sandbox" : "simulated",
  });
});

app.get("/api/dashboard", async (c) => {
  const [allInvoices, allTransactions] = await Promise.all([
    db.select().from(invoices).orderBy(desc(invoices.createdAt)),
    db.select().from(transactionLogs).orderBy(desc(transactionLogs.timestamp)),
  ]);
  return c.json({ invoices: allInvoices, transactions: allTransactions });
});

app.post("/api/ai/generate-invoice", async (c) => {
  const body = await c.req.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const clientEmail = typeof body?.client_email === "string" ? body.client_email.trim() : "";

  if (!prompt || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail) || clientEmail.length > 120) {
    return c.json({ detail: "A prompt and a valid client email are required." }, 400);
  }

  const { amount, clientName } = parseInvoicePrompt(prompt, clientEmail);
  if (!Number.isFinite(amount) || amount <= 0) {
    return c.json({ detail: "Could not determine a valid invoice amount." }, 400);
  }

  const [invoice] = await db
    .insert(invoices)
    .values({
      invoiceId: `INV-${crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      clientName,
      clientEmail,
      amount,
      currency: "USD",
      description: `Auto-generated via AI: ${prompt}`,
      status: "PENDING",
    })
    .returning();

  return c.json({ status: "success", invoice });
});

app.post("/api/paypal/create-order/:invoiceId", async (c) => {
  const [inv] = await db.select().from(invoices).where(eq(invoices.invoiceId, c.req.param("invoiceId")));
  if (!inv) return c.json({ detail: "Invoice not found" }, 404);
  if (inv.status === "PAID") return c.json({ detail: "Invoice already paid" }, 409);

  const token = await getPaypalToken();
  if (!token) {
    // Simulated fallback when PayPal sandbox credentials aren't configured
    return c.json({ id: `MOCK-ORDER-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, status: "CREATED" });
  }

  const res = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: inv.invoiceId,
          amount: { currency_code: inv.currency, value: inv.amount.toFixed(2) },
          description: inv.description.slice(0, 127),
        },
      ],
    }),
  });
  return c.json(await res.json(), res.ok ? 200 : 502);
});

app.post("/api/paypal/capture-order", async (c) => {
  const body = await c.req.json().catch(() => null);
  const orderId = typeof body?.order_id === "string" ? body.order_id : "";
  const invoiceId = typeof body?.invoice_id === "string" ? body.invoice_id : "";
  if (!orderId || !invoiceId) return c.json({ detail: "order_id and invoice_id are required" }, 400);

  const [inv] = await db.select().from(invoices).where(eq(invoices.invoiceId, invoiceId));
  if (!inv) return c.json({ detail: "Invoice not found" }, 404);
  if (inv.status === "PAID") return c.json({ detail: "Invoice already paid" }, 409);

  const token = await getPaypalToken();
  if (token) {
    const res = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    if (!res.ok) return c.json({ detail: "PayPal capture failed" }, 502);
  } else if (!orderId.startsWith("MOCK-ORDER-")) {
    return c.json({ detail: "PayPal is not configured" }, 400);
  }

  const risk = analyzeRisk(inv.amount, inv.clientEmail);

  await db.update(invoices).set({ status: "PAID" }).where(eq(invoices.id, inv.id));
  await db.insert(transactionLogs).values({
    paypalOrderId: orderId,
    invoiceId: inv.invoiceId,
    amount: inv.amount,
    currency: inv.currency,
    payerEmail: inv.clientEmail,
    riskScore: risk.score,
    riskStatus: risk.status,
  });

  return c.json({ status: "COMPLETED", risk_evaluation: risk });
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ detail: "Internal server error" }, 500);
});

export const config = { path: "/api/*" };

export default app;
