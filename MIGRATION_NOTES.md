# Migration Notes

## 52-Week High/Low Feature

After deploying this commit, run the following SQL migration on Railway:

```sql
ALTER TABLE fundamentals 
ADD COLUMN IF NOT EXISTS week_52_high DECIMAL(12, 4),
ADD COLUMN IF NOT EXISTS week_52_low DECIMAL(12, 4);
```

Then regenerate Prisma client:
```bash
npx prisma generate
```

This will add the new fields to the database and update the Prisma client types.

