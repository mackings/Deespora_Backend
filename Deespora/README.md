# Firebase Phone Auth Express Template

A production-ready **Node.js + Express + Mongoose** starter with:
- Email/password **register & login** (JWT auth)
- **Password reset** via email (token + expiry)
- **Firebase Phone Auth** via **Identity Toolkit REST API** (server-driven)
- Clean **router.get / router.post** routes

## Quick Start
1. Copy `.env.example` to `.env` and fill in values.
2. Put your Firebase Admin SDK file at `serviceAccountKey.json` (path set in `.env`).
3. Install deps and run:
   ```bash
   npm install
   npm run dev
   ```
4. Connect to MongoDB (e.g., local Mongo or Atlas). Update `MONGO_URI` in `.env`.

## API Overview
- **Auth**
  - `POST /auth/register` – `{ email, password, phoneNumber }`
  - `POST /auth/login` – `{ email, password }`
  - `GET /auth/me` – Bearer token
  - `POST /auth/request-password-reset` – `{ email }`
  - `POST /auth/reset-password` – `{ token, password }`
- **Phone (Firebase)**
  - `POST /auth/send-otp` – `{ phoneNumber, recaptchaToken }` → returns `{ sessionInfo }`
  - `POST /auth/verify-otp` – `{ sessionInfo, code, userId }` → verifies, marks user.phoneVerified = true

### Notes
- For OTP, we use Firebase **Identity Toolkit** REST for server-side OTP send/verify, and **firebase-admin** to validate tokens or perform privileged ops if needed.
- For email, we use **nodemailer** (works with Ethereal for testing).
- Passwords are hashed with **bcrypt**.
- JWTs are issued with **jsonwebtoken**.

## Security
- Keep `serviceAccountKey.json` private and **never** commit it.
- Use HTTPS in production.
- Rate-limit sensitive routes (not included here).
- Validate inputs! (basic checks included; consider a schema validator in prod).
