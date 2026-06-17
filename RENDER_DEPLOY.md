# Render.com deployment — Compliance Agent

## 1. Connect repository

1. Go to [https://dashboard.render.com](https://dashboard.render.com) → **New** → **Web Service**
2. Connect GitHub repo `compliance_agent_v2` (or use **Blueprint** with `render.yaml` in repo root)
3. Settings (if not using blueprint):
   - **Runtime:** Node
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm start`
   - **Node version:** 22 (or set env `NODE_VERSION=22`)

## 2. Environment variables (Render dashboard)

Copy from your local `.env` — **never commit `.env`**.

| Variable | Example / notes |
|----------|-----------------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `AUTH_AZURE_AD_CLIENT_ID` | Compliance Agent app client ID |
| `AUTH_AZURE_AD_TENANT_ID` | Relanto tenant ID |
| `AUTH_AZURE_AD_CLIENT_SECRET` | Secret **Value** (not Secret ID) |
| `AUTH_SECRET` | Same as local (`openssl rand -base64 32`) |
| `AUTH_URL` | `https://YOUR-SERVICE.onrender.com` |
| `NEXTAUTH_URL` | Same as `AUTH_URL` |
| `MAIL_FROM_ADDRESS` | e.g. `training@relanto.ai` |
| `NVIDIA_API_KEY` | For MCQ generation |
| `NVIDIA_MODEL` | `meta/llama-3.3-70b-instruct` |

After first deploy, set `AUTH_URL` and `NEXTAUTH_URL` to your **exact** Render URL (no trailing slash).

## 3. Azure redirect URI (required for login)

In **Microsoft Entra ID** → **Compliance Agent** → **Authentication** → **Web** redirect URIs, add:

```text
https://YOUR-SERVICE.onrender.com/api/auth/callback/microsoft-entra-id
```

Keep localhost URI for local dev.

## 4. Email links

Invitation emails use `AUTH_URL` for the **Start training** button:

```text
https://YOUR-SERVICE.onrender.com/login?callbackUrl=/training/{moduleId}
```

Learners sign in → proctor rules → assessment. After submit, the tab closes (or shows `/submitted`).

## 5. Database migrations

Run once from your machine (with production `DATABASE_URL`) or Render shell:

```bash
npm run db:migrate
npm run db:migrate:alter
npm run db:seed:relanto   # optional: seed users/batches
```

## 6. PDF uploads on Render (important)

Uploaded PDFs are stored under `public/uploads/` on the server disk. **Render’s disk is ephemeral** — files can disappear on redeploy.

For production pilots:
- Re-upload after each deploy, **or**
- Plan migration to Azure Blob / S3 for PDF storage.

## 7. Health check

Use `/login` or `/api/auth/status` as Render health check path.

## 8. Deploy checklist

- [ ] All env vars set on Render
- [ ] Azure Web redirect URI for production host
- [ ] Application **Mail.Send** granted + `MAIL_FROM_ADDRESS` valid
- [ ] DB migrations applied
- [ ] Test login → training → completion flow on production URL
