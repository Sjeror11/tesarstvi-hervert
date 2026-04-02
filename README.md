# Tesařství Hervert

Statický prezentační web s vlastním klientským adminem pro správu fotek v jednotlivých sekcích.

## Jak to funguje

Veřejná část webu zůstává statická:

- homepage běží dál z `index.html`
- texty a základní struktura sekcí jsou v `data/site-content.json`

Správa fotek je oddělená:

- klient se přihlašuje na `https://tesarstvihervert.cz/admin/`
- přihlášení používá vlastní jméno a heslo
- po přihlášení může vybírat sekce webu a přidávat nebo mazat fotky
- v administraci lze i změnit heslo
- fotky se ukládají do Cloudflare R2
- metadata o fotkách jsou v Cloudflare D1
- veřejný web si galerie načítá z backendu automaticky

## Produkční přístup

- admin URL: `https://tesarstvihervert.cz/admin/`
- přihlašovací údaje: uložené mimo repozitář

Produkční heslo nepatří do veřejného repozitáře.
Pokud bylo někdy veřejné, změň ho přímo v administraci přes sekci `Změna hesla`.

## Důležitá technická poznámka

Tohle už není čisté GitHub Pages řešení.
Bez backendu nejde bezpečně udělat:

- vlastní login jméno/heslo
- upload obrázků
- mazání obrázků
- řízení přístupu klienta

Proto je součástí projektu `cms-worker/`, který běží na Cloudflare Workers.

## Struktura projektu

```text
├── admin/
│   ├── app.js
│   └── index.html
├── cms-worker/
│   ├── scripts/import-existing-galleries.mjs
│   ├── scripts/hash-password.mjs
│   ├── src/index.js
│   ├── package.json
│   ├── schema.sql
│   └── wrangler.toml
├── css/
├── data/
│   └── site-content.json
├── images/
├── js/
│   ├── jquery.colorbox-min.js
│   ├── jquery.nivo.slider.js
│   └── main.js
└── index.html
```

## Lokální spuštění webu

```bash
python3 -m http.server 8000
```

Pak otevři:

- `http://localhost:8000/`
- `http://localhost:8000/admin/`

Pozor:

- bez běžícího `cms-worker` backendu nebude lokální přihlášení fungovat
- veřejný web ale poběží i bez backendu, jen použije lokální galerie z `data/site-content.json`

## Produkční architektura

- veřejný web: `https://tesarstvihervert.cz`
- admin stránka: `https://tesarstvihervert.cz/admin/`
- backend API + obrázky: `https://tesarstvi-hervert-cms.sjeror11.workers.dev`

Backend zajišťuje:

- `POST /api/login`
- `POST /api/logout`
- `GET /api/me`
- `GET /api/public/galleries`
- `GET /api/admin/photos`
- `POST /api/admin/photos/upload`
- `POST /api/admin/change-password`
- `DELETE /api/admin/photos/:id`
- `GET /media/...`

## Stav nasazení

Aktuálně je nasazeno:

- veřejný web na `https://tesarstvihervert.cz`
- administrace na `https://tesarstvihervert.cz/admin/`
- backend na `https://tesarstvi-hervert-cms.sjeror11.workers.dev`
- import původních galerií do R2 a D1 je hotový

Jednorázový import starých galerií je ve skriptu:

- `cms-worker/scripts/import-existing-galleries.mjs`

## Co je potřeba nasadit v Cloudflare

### 1. Přihlášení do Cloudflare

```bash
cd cms-worker
npm install
npx wrangler login
```

### 2. Vytvořit R2 bucket

```bash
npx wrangler r2 bucket create tesarstvi-hervert-media
```

### 3. Vytvořit D1 databázi

```bash
npx wrangler d1 create tesarstvi-hervert-cms
```

Po vytvoření databáze Cloudflare vypíše `database_id`.
To vlož do [cms-worker/wrangler.toml](/home/laky/tesarstvi-hervert/cms-worker/wrangler.toml) místo `REPLACE_WITH_D1_DATABASE_ID`.

### 4. Inicializovat databázi

Lokálně:

```bash
npx wrangler d1 execute tesarstvi-hervert-cms --local --file=./schema.sql
```

Produkčně:

```bash
npx wrangler d1 execute tesarstvi-hervert-cms --remote --file=./schema.sql
```

### 5. Vygenerovat hash hesla

```bash
npm run hash-password -- "sem-das-skutecne-heslo"
```

Výstup bude ve formátu `pbkdf2_sha256$...`.

### 6. Nastavit secrets

```bash
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put SESSION_SECRET
```

Do `SESSION_SECRET` dej dlouhý náhodný tajný řetězec.

### 7. Upravit username

V [cms-worker/wrangler.toml](/home/laky/tesarstvi-hervert/cms-worker/wrangler.toml) nastav:

- `ADMIN_USERNAME`
- případně `MAX_UPLOAD_SIZE_BYTES`
- případně `SESSION_TTL_SECONDS`

### 8. Deploy workeru

```bash
npx wrangler deploy
```

Aktuální nasazení je přes `workers.dev`, ne přes vlastní subdoménu.

### 9. Kontrola

Po nasazení ověř:

- `https://tesarstvi-hervert-cms.sjeror11.workers.dev/health`
- `https://tesarstvihervert.cz/admin/`

## Co klient umí

Po přihlášení klient:

- vybere sekci jako `Střechy`, `Pergoly`, `Dřevníky`
- nahraje novou fotku
- smaže existující fotku
- změní heslo do administrace
- změny se projeví na webu bez úpravy HTML

Pro nejrychlejší nasazení použij i [DEPLOY-CHECKLIST.md](/home/laky/tesarstvi-hervert/DEPLOY-CHECKLIST.md).

## Co systém zatím neumí

Aktuální verze zatím neřeší:

- více uživatelů
- reset hesla e-mailem
- změnu pořadí fotek drag and drop
- úpravu textů přes admin
- hromadný upload více fotek najednou

To jde doplnit později, ale pro požadavek klienta na přihlášení a správu fotek po sekcích už je připravený správný základ.
