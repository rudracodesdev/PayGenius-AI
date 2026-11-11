from database import SessionLocal, Invoice, TransactionLog, init_db
import datetime

def seed():
    init_db()
    db = SessionLocal()

    if db.query(Invoice).count() == 0:
        demo_invoices = [
            Invoice(invoice_id="INV-00101", client_name="Acme Corp", client_email="billing@acme.org", amount=450.00, currency="USD", description="AI Model Inference Retainer", status="PAID"),
            Invoice(invoice_id="INV-00102", client_name="Globex Tech", client_email="accounts@globex.io", amount=1200.00, currency="USD", description="Enterprise Webhook Infrastructure Setup", status="PENDING"),
            Invoice(invoice_id="INV-00103", client_name="Soylent Media", client_email="contact@soylent.co", amount=89.50, currency="USD", description="Automated Asset Ingestion", status="PENDING")
        ]
        db.add_all(demo_invoices)
        db.commit()

        demo_tx = TransactionLog(
            paypal_order_id="SANDBOX-ORDER-99120",
            invoice_id="INV-00101",
            amount=450.00,
            currency="USD",
            payer_email="billing@acme.org",
            risk_score=15.0,
            risk_status="LOW",
            timestamp=datetime.datetime.utcnow() - datetime.timedelta(days=1)
        )
        db.add(demo_tx)
        db.commit()
        print("Database seeded with demo records successfully.")
    else:
        print("Database already contains data.")
    db.close()

if __name__ == "__main__":
    seed()