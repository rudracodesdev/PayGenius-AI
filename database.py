import os
import datetime
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv

load_dotenv()

# Supabase provides PostgreSQL URLs formatted as:
# postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
# Or Transaction Pooler (port 6543)
DATABASE_URL = os.getenv("SUPABASE_DATABASE_URL")

if not DATABASE_URL:
    # Local SQLite fallback if env var is missing
    DATABASE_URL = "sqlite:///./paypal_ai.db"
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    # Ensure URI scheme compatibility for modern SQLAlchemy
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,      # Tests connection before query to avoid stale socket errors
        pool_size=5,             # Safe for Supabase free-tier limits
        max_overflow=10
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(String(50), unique=True, index=True)
    client_name = Column(String(120), nullable=False)
    client_email = Column(String(120), nullable=False)
    amount = Column(Float, nullable=False)
    currency = Column(String(10), default="USD")
    status = Column(String(30), default="PENDING")  # PENDING, PAID, FLAGGED
    description = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class TransactionLog(Base):
    __tablename__ = "transaction_logs"

    id = Column(Integer, primary_key=True, index=True)
    paypal_order_id = Column(String(100), unique=True, index=True)
    invoice_id = Column(String(50))
    amount = Column(Float, nullable=False)
    currency = Column(String(10), default="USD")
    payer_email = Column(String(120))
    risk_score = Column(Float, default=0.0)
    risk_status = Column(String(20), default="LOW")
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()