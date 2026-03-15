# CMS Worker

Cloudflare Worker pro vlastní klientský login a správu galerií.

## Co řeší

- login přes vlastní jméno a heslo
- bearer token a fallback cookie pro administraci
- upload fotek do R2
- mazání fotek z R2
- změnu hesla přes administraci
- ukládání metadat do D1
- veřejné čtení galerií pro web

## Bindings

Worker používá:

- `DB` jako Cloudflare D1
- `MEDIA` jako Cloudflare R2 bucket

## Rychlé kroky

```bash
npm install
npx wrangler login
npx wrangler r2 bucket create tesarstvi-hervert-media
npx wrangler d1 create tesarstvi-hervert-cms
```

Pak:

1. doplň `database_id` do `wrangler.toml`
2. spusť `npx wrangler d1 execute tesarstvi-hervert-cms --remote --file=./schema.sql`
3. vygeneruj hash přes `npm run hash-password -- "heslo"`
4. nastav secrets `ADMIN_PASSWORD_HASH` a `SESSION_SECRET`
5. spusť `npx wrangler deploy`

## Veřejná URL

- API a média: `https://tesarstvi-hervert-cms.sjeror11.workers.dev`
- healthcheck: `https://tesarstvi-hervert-cms.sjeror11.workers.dev/health`
