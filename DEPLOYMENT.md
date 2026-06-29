# Deploy Kitaku Time Office

## 1. Push to GitHub

```bash
git init
git add .
git commit -m "Build Supabase-backed PWA prototype"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/kitaku-time-office.git
git push -u origin main
```

## 2. Deploy with Vercel

1. Open Vercel.
2. Import the GitHub repository.
3. Framework preset: **Other**.
4. Build command: `npm run build`.
5. Output directory: `.`.
6. Add environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
7. Click **Deploy**.

## 3. Prepare Supabase

1. Open Supabase SQL Editor.
2. Run `supabase/schema.sql`.
3. Run `supabase/schema_real.sql`.
4. Open Authentication and enable Email login.
5. Register your operator account in the app.
6. Promote it in SQL Editor:

```sql
update public.profiles
set role = 'operator'
where email = 'your-operator-email@example.com';
```

## 4. Use on phone like an app

After Vercel gives you an HTTPS URL:

- iPhone Safari: open the URL -> Share -> Add to Home Screen.
- Android Chrome: open the URL -> menu -> Add to Home screen.

The app includes `manifest.webmanifest` and `sw.js`, so it opens in standalone PWA style after installation.
