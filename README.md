# Norton Revamp Ad Builder

Collaborative ad mockup editor backed by Neon Postgres, deployed on Vercel.

## Setup

1. Create a Neon project at [console.neon.tech](https://console.neon.tech)
2. Copy the connection string
3. Create `.env.local`:
   ```
   DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require
   ```
4. Run the DB migration:
   ```
   npm run db:setup
   ```
5. Start dev server:
   ```
   npm run dev
   ```

## Deploy to Vercel

1. Push to GitHub
2. Import in [vercel.com](https://vercel.com)
3. Add `DATABASE_URL` as an environment variable (or use the Neon integration)
4. Deploy

Edits made by any team member are saved to the shared database and visible to everyone.
