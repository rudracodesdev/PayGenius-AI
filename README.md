# PayGenius AI - PayPal AI Hackathon Project[cite: 1, 2]

An autonomous billing and intelligent PayPal sandbox checkout engine designed for the PayPal AI Hackathon[cite: 1].

## Features
- **AI-Driven Invoice Creation**: Ingests natural language briefs into structured billing items.
- **PayPal Sandbox Checkout Integration**: Client-side Smart Buttons backed by FastAPI checkout endpoints[cite: 1, 2].
- **PayGuard AI Risk Scoring**: Automated risk assessment per transaction.

## Quick Start

1. Install dependencies:
```bash
pip install -r requirements.txt```

## Deploying on Netlify

On Netlify, the backend runs as a Node.js Netlify Server (`netlify/server/index.ts`). Data is stored in Netlify Database (Postgres), with its schema in `db/schema.ts` and migrations in `netlify/database/migrations/`. The dashboard is served as a static page from `static/`. Run it locally with `npm install && npm run dev`.

To use real PayPal sandbox checkout, set the `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` environment variables in Netlify. Without them, checkout runs in simulated mode.
