import { pgTable, serial, varchar, text, doublePrecision, timestamp } from "drizzle-orm/pg-core";

export const invoices = pgTable("invoices", {
  id: serial().primaryKey(),
  invoiceId: varchar("invoice_id", { length: 50 }).notNull().unique(),
  clientName: varchar("client_name", { length: 120 }).notNull(),
  clientEmail: varchar("client_email", { length: 120 }).notNull(),
  amount: doublePrecision().notNull(),
  currency: varchar({ length: 10 }).notNull().default("USD"),
  status: varchar({ length: 30 }).notNull().default("PENDING"), // PENDING, PAID, FLAGGED
  description: text().notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const transactionLogs = pgTable("transaction_logs", {
  id: serial().primaryKey(),
  paypalOrderId: varchar("paypal_order_id", { length: 100 }).notNull().unique(),
  invoiceId: varchar("invoice_id", { length: 50 }).notNull(),
  amount: doublePrecision().notNull(),
  currency: varchar({ length: 10 }).notNull().default("USD"),
  payerEmail: varchar("payer_email", { length: 120 }),
  riskScore: doublePrecision("risk_score").notNull().default(0),
  riskStatus: varchar("risk_status", { length: 20 }).notNull().default("LOW"),
  timestamp: timestamp().notNull().defaultNow(),
});
