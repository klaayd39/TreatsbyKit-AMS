# Backups

Backups depend on the Supabase project plan. Check the plan on your project before you rely on automatic backups. A free project does not have the same point-in-time recovery as a paid plan.

## Manual database dump

From `treats-by-kit-accounting`, with the CLI linked to the project:

```bash
supabase db dump --linked -f backup.sql
```

Store `backup.sql` somewhere that is not the Supabase project. A laptop disk alone is not a backup.

## Regular export

An owner can use Business Settings, then Export all data. That downloads each table as CSV inside one ZIP, plus the trial balance. Do this on a schedule and keep the ZIP separate from Supabase and from Vercel.

The export is a readable copy. The CLI dump is the copy you would use to restore the database.
