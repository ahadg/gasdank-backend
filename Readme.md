📋 Overview

The Wholesale Inventory Management System is a comprehensive backend platform designed for wholesale distributors who need accurate inventory control, client balance tracking, and automated business insights.

Built with Node.js, TypeScript, and AI technologies, the system supports multi-company operations, secure role-based access, integrated payments, and intelligent automation through an AI command interface.

🎯 Key Features
🏗️ Core System

Multi-Company & Multi-User architecture (multi-tenant)

Role-Based Access Control (Admin, Manager, Employee, Viewer)

Subscription management with Stripe

Real-time inventory tracking with analytics

Client balance and ledger management

AI-powered chat assistant for operations

🔄 Business Operations

Inventory Management: Add, edit, merge, and track products

Client Transactions: Purchases, sales, returns, and payments

Expense Tracking: Categorized expenses with audit logs

Payment Processing: Crypto, EMT, and traditional payments

Sample Management: Accept/reject workflows with notifications

🤖 AI Capabilities

Natural-language command execution

“Jack bought 1 Pound Kush @ $1300”

AI-driven business insights and analytics

Secure, data-restricted AI access

Marketing automation with credit-based messaging

📊 Reporting & Analytics

Profit & Loss reports by:

Product

Client

Time period

Advanced analytics dashboards

Client performance and sales trend analysis

Full activity and audit logging

🛠️ Technology Stack
Backend

Node.js + TypeScript – Type-safe backend

Express.js – API framework

MongoDB + Mongoose – Data persistence

Redis – Caching & session management

LangChain + OpenAI – AI features

Integrations

Stripe – Subscriptions & billing

Twilio – SMS / WhatsApp communication

Mailgun – Email delivery

Multiple Payments – Crypto, EMT, traditional

Security & Performance

JWT authentication with bcrypt hashing

Helmet & HPP protection

Joi schema validation

API compression & caching

Activity auditing & role-based data visibility

🚀 Getting Started
Prerequisites
Node.js 18+
MongoDB 4.4+
Redis 6+
Stripe Account
Twilio Account

Installation
# Clone repository
git clone <repository-url>
cd wholesale-inventory-system

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env

Build & Run
# Production
npm run build
npm start

# Development
npm run dev

⚙️ Environment Configuration
# Database
MONGODB_URI=mongodb://localhost:27017/wholesale_inventory
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your_jwt_secret
BCRYPT_SALT_ROUNDS=12

# Payments
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Communications
TWILIO_ACCOUNT_SID=xxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+1234567890

# AI
OPENAI_API_KEY=sk-xxx

# Email
MAILGUN_API_KEY=xxx
MAILGUN_DOMAIN=xxx