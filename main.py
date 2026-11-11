import os
import uuid
import requests
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from pydantic import BaseModel
from dotenv import load_dotenv

from database import init_db, get_db, Invoice, TransactionLog

load_dotenv()

init_db()

app = FastAPI(title="PayGenius AI - Intelligent Commerce Engine")

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

PAYPAL_CLIENT_ID = os.getenv("PAYPAL_CLIENT_ID", "sb")
PAYPAL_CLIENT_SECRET = os.getenv("PAYPAL_CLIENT_SECRET", "sandbox_secret")
PAYPAL_API_BASE = "https://api-m.sandbox.paypal.com"

# Request Schemas
class AIInvoiceRequest(BaseModel):
    prompt: str
    client_email: str

class CaptureOrderRequest(BaseModel):
    order_id: str
    invoice_id: str

def get_paypal_token():
    auth = (PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET)
    data = {"grant_type": "client_credentials"}
    res = requests.post(f"{PAYPAL_API_BASE}/v1/oauth2/token", auth=auth, data=data)
    if res.status_code == 200:
        return res.json().get("access_token")
    return None

def analyze_risk(amount: float, client_email: str) -> dict:
    score = 15.0
    status = "LOW"
    
    if amount > 1000:
        score += 40.0
    if "temp" in client_email or "test" in client_email:
        score += 30.0

    if score > 60:
        status = "HIGH"
    elif score > 30:
        status = "MEDIUM"

    return {"score": score, "status": status}

@app.get("/", response_class=HTMLResponse)
def home(request: Request, db: Session = Depends(get_db)):
    invoices = db.query(Invoice).order_by(Invoice.created_at.desc()).all()
    transactions = db.query(TransactionLog).order_by(TransactionLog.timestamp.desc()).all()
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={"invoices": invoices, "transactions": transactions, "paypal_client_id": PAYPAL_CLIENT_ID}
    )

@app.post("/api/ai/generate-invoice")
def generate_ai_invoice(payload: AIInvoiceRequest, db: Session = Depends(get_db)):
    import re
    amounts = re.findall(r"\$([0-9]+(?:\.[0-9]{2})?)", payload.prompt)
    amount = float(amounts[0]) if amounts else 150.00
    
    invoice_num = f"INV-{uuid.uuid4().hex[:6].upper()}"
    new_inv = Invoice(
        invoice_id=invoice_num,
        client_name=payload.client_email.split("@")[0].capitalize(),
        client_email=payload.client_email,
        amount=amount,
        currency="USD",
        description=f"Auto-generated via AI: {payload.prompt}",
        status="PENDING"
    )
    db.add(new_inv)
    db.commit()
    db.refresh(new_inv)
    return {"status": "success", "invoice": new_inv}

@app.post("/api/paypal/create-order/{invoice_id}")
def create_paypal_order(invoice_id: str, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.invoice_id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    token = get_paypal_token()
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"} if token else {}
    
    order_payload = {
        "intent": "CAPTURE",
        "purchase_units": [{
            "reference_id": inv.invoice_id,
            "amount": {
                "currency_code": inv.currency,
                "value": f"{inv.amount:.2f}"
            },
            "description": inv.description
        }]
    }

    if token:
        res = requests.post(f"{PAYPAL_API_BASE}/v2/checkout/orders", headers=headers, json=order_payload)
        return res.json()
    
    # Mock fallback for sandbox demonstration
    return {"id": f"MOCK-ORDER-{uuid.uuid4().hex[:8].upper()}", "status": "CREATED"}

@app.post("/api/paypal/capture-order")
def capture_paypal_order(payload: CaptureOrderRequest, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.invoice_id == payload.invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    risk = analyze_risk(inv.amount, inv.client_email)
    
    inv.status = "PAID"
    tx = TransactionLog(
        paypal_order_id=payload.order_id,
        invoice_id=inv.invoice_id,
        amount=inv.amount,
        currency=inv.currency,
        payer_email=inv.client_email,
        risk_score=risk["score"],
        risk_status=risk["status"]
    )
    db.add(tx)
    db.commit()

    return {"status": "COMPLETED", "risk_evaluation": risk}