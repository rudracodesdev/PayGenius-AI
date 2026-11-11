CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY,
	"invoice_id" varchar(50) NOT NULL UNIQUE,
	"client_name" varchar(120) NOT NULL,
	"client_email" varchar(120) NOT NULL,
	"amount" double precision NOT NULL,
	"currency" varchar(10) DEFAULT 'USD' NOT NULL,
	"status" varchar(30) DEFAULT 'PENDING' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_logs" (
	"id" serial PRIMARY KEY,
	"paypal_order_id" varchar(100) NOT NULL UNIQUE,
	"invoice_id" varchar(50) NOT NULL,
	"amount" double precision NOT NULL,
	"currency" varchar(10) DEFAULT 'USD' NOT NULL,
	"payer_email" varchar(120),
	"risk_score" double precision DEFAULT 0 NOT NULL,
	"risk_status" varchar(20) DEFAULT 'LOW' NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
