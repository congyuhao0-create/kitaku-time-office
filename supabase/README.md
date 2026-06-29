# Supabase Setup

## 1. Create tables

Run these files in Supabase SQL Editor, in this order:

1. `schema.sql`
2. `schema_real.sql`

`schema.sql` keeps the older JSON snapshot sync working. `schema_real.sql` adds the real tables:

- `profiles`
- `bookings`
- `service_requests`
- `time_ledger`
- `safety_records`
- `operator_actions`

## 2. Enable Auth

In Supabase Dashboard:

1. Open **Authentication -> Providers**.
2. Enable **Email**.
3. For testing, you can disable email confirmation. For real users, keep confirmation enabled.

## 3. Create the first operator

Public registration only creates `parent` or `collaborator` profiles. This prevents normal users from making themselves operators.

Register one account in the app, then run this in SQL Editor:

```sql
update public.profiles
set role = 'operator'
where email = 'your-operator-email@example.com';
```

## 4. Realtime tables

`schema_real.sql` adds Realtime publication for:

- `bookings`
- `service_requests`
- `time_ledger`
- `safety_records`

The app listens to those tables after Supabase login.

## 5. Vercel environment variables

Set these in Vercel project settings:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

The build script writes them into the browser config during deployment.
