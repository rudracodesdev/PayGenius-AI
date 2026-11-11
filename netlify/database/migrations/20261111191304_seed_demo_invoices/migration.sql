INSERT INTO "invoices" ("invoice_id", "client_name", "client_email", "amount", "currency", "description", "status") VALUES
  ('INV-00101', 'Acme Corp', 'billing@acme.org', 450.00, 'USD', 'AI Model Inference Retainer', 'PAID'),
  ('INV-00102', 'Globex Tech', 'accounts@globex.io', 1200.00, 'USD', 'Enterprise Webhook Infrastructure Setup', 'PENDING'),
  ('INV-00103', 'Soylent Media', 'contact@soylent.co', 89.50, 'USD', 'Automated Asset Ingestion', 'PENDING')
ON CONFLICT ("invoice_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "transaction_logs" ("paypal_order_id", "invoice_id", "amount", "currency", "payer_email", "risk_score", "risk_status", "timestamp") VALUES
  ('SANDBOX-ORDER-99120', 'INV-00101', 450.00, 'USD', 'billing@acme.org', 15.0, 'LOW', NOW() - INTERVAL '1 day')
ON CONFLICT ("paypal_order_id") DO NOTHING;
