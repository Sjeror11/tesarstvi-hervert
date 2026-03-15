# Deploy Checklist

## 1. Připrav Cloudflare

Přejdi do složky:

```bash
cd /home/laky/tesarstvi-hervert/cms-worker
```

Nainstaluj závislosti a přihlas se:

```bash
npm install
npx wrangler login
```

## 2. Vytvoř úložiště pro fotky

```bash
npx wrangler r2 bucket create tesarstvi-hervert-media
```

## 3. Vytvoř databázi pro evidenci fotek

```bash
npx wrangler d1 create tesarstvi-hervert-cms
```

Cloudflare vypíše `database_id`.
Ten vlož do [cms-worker/wrangler.toml](/home/laky/tesarstvi-hervert/cms-worker/wrangler.toml#L17) místo `REPLACE_WITH_D1_DATABASE_ID`.

## 4. Nahraj schéma databáze

```bash
npx wrangler d1 execute tesarstvi-hervert-cms --remote --file=./schema.sql
```

## 5. Vytvoř heslo pro klienta

Vygeneruj hash:

```bash
npm run hash-password -- "sem-zadej-skutecne-heslo"
```

Zkopíruj výstup.

## 6. Nastav tajné údaje

```bash
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put SESSION_SECRET
```

Do `ADMIN_PASSWORD_HASH` vlož hash z předchozího kroku.

Do `SESSION_SECRET` vlož dlouhý náhodný řetězec, například 32+ znaků.

## 7. Nasazení backendu

```bash
npx wrangler deploy
```

Aktuální nasazení používá `workers.dev` URL:

- `https://tesarstvi-hervert-cms.sjeror11.workers.dev`

## 8. Ověření backendu

Musí fungovat:

- `https://tesarstvi-hervert-cms.sjeror11.workers.dev/health`

## 9. Ověření adminu

Otevři:

- `https://tesarstvihervert.cz/admin/`

Přihlaš se jménem z [cms-worker/wrangler.toml](/home/laky/tesarstvi-hervert/cms-worker/wrangler.toml#L6) v `ADMIN_USERNAME` a heslem, které jsi hashoval.

## 10. Ověření na webu

Po přihlášení:

1. Vyber sekci.
2. Nahraj testovací fotku.
3. Ověř, že se ukáže v adminu.
4. Ověř, že se ukáže i na veřejném webu v příslušné galerii.
5. Zkus fotku smazat.

## Když něco nefunguje

Zkontroluj:

- `database_id` v [cms-worker/wrangler.toml](/home/laky/tesarstvi-hervert/cms-worker/wrangler.toml#L20)
- že secrets `ADMIN_PASSWORD_HASH` a `SESSION_SECRET` jsou opravdu nastavené
- že `https://tesarstvi-hervert-cms.sjeror11.workers.dev/health` vrací odpověď
