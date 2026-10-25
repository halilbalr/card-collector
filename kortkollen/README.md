# Kortkollen – skanna och värdera Pokémonkort

En mobilapp för Pokémonkort som körs i webbläsaren och installeras direkt på hemskärmen
(en PWA). Ingen App Store, inget konto och ingen server behövs. All data sparas på telefonen.

## Funktioner

**Skanna**
- Live-kamera med kortram, ficklampa och bilduppladdning som reserv.
- Textigenkänning (Tesseract.js) läser namn, kortnummer (t.ex. `199/165`) och setkod
  (t.ex. `MEW`). Appen slår sedan upp kortet och jämför bilden med kandidaterna.
- **Snabbläge**: säkra träffar läggs till i samlingen direkt, så du kan skanna en hel hög
  i rad.
- Mäter kortets **centrering** redan vid skanningen och visar det högsta PSA-betyg den
  räcker till.

**Värde i alla graderingar**
- Marknadsvärde för ograderat kort (Cardmarket trend eller TCGplayer market), med
  1/7/30-dagarssnitt och trend.
- Uppskattat värde för **PSA, BGS, CGC och SGC**, för varje betyg från 1 till 10,
  inklusive Black Label och Pristine.
- Varje betyg visas som en **slab med kortet i**. Illustrationen visar typiskt slitage för
  betyget: vita hörn, kantslitage, repor och veck.
- Tryck på en slab för att se vad betyget kräver (hörn, kanter, yta och centrering).

**Graderingskoll** (”vilket betyg får mitt kort?”)
1. **Centrering**: auto-mätning på ett foto. Linjerna kan dras på plats för hand, med
   lupp och finjustering. Det går också att använda reglage i stället.
2. **Skick**: hörn, kanter, yta och skador (veck, bucklor, fläckar).
3. **Resultat**:
   - troligt betyg och sannolikhet per betyg för varje graderingsföretag
   - BGS-subgrades
   - **lönar det sig att gradera?** Förväntat värde jämförs med ograderat värde minus
     graderingskostnaden. Appen visar också vilket betyg som krävs för att gå jämnt ut.

**Samling**
- Lägg till och ta bort kort, med variant (holo, reverse, 1st Edition …), skick eller
  graderat betyg, antal, inköpspris, anteckningar och egna **pärmar**.
- Totalvärde, utveckling över tid, vinst mot inköp, mest värdefulla kort och
  prisrörelser i samlingen.
- **Set-framsteg**: se vad du har och vad som saknas i ett set, och vad det kostar att
  komplettera.
- **Önskelista med målpris**: kortet markeras när priset går under målpriset.
- Rutnät eller lista, filter, sortering och massmarkering (ta bort eller flytta till
  pärm) med ångra.
- Säkerhetskopia (JSON), återställning och export till Excel (CSV).

**Övrigt**
- Fungerar offline efter första besöket (service worker).
- Mörkt och ljust tema, svenska kronor som standard (EUR, USD, NOK, DKK och GBP finns
  också).
- Holografisk 3D-effekt på kortet som följer fingret eller telefonens lutning.

## Kom igång på telefonen

Appen måste ligga på en **https**-adress, annars får sidan inte använda kameran.

### Publicera med GitHub Pages (gratis)

1. Slå på Actions för repot. Forkar har det avstängt: fliken **Actions** →
   *”I understand my workflows, go ahead and enable them”*.
2. **Settings → Pages → Source: GitHub Actions**.
3. Merga till `main`. Arbetsflödet `.github/workflows/kortkollen.yml` kör testerna och
   publicerar appen.
4. Öppna `https://<ditt-användarnamn>.github.io/card-collector/` på telefonen.

Andra gratisalternativ är att dra mappen `kortkollen/` till
[Netlify Drop](https://app.netlify.com/drop) eller att använda Cloudflare Pages.

### Lägg den på hemskärmen

- **iPhone (Safari):** Dela-knappen → *Lägg till på hemskärmen*.
- **Android (Chrome):** menyn ⋮ → *Installera app*.

## Bra att veta

- **Priser.** Kortdata och råpriser kommer från [Pokémon TCG API](https://pokemontcg.io)
  (Cardmarket och TCGplayer), med [TCGdex](https://tcgdex.dev) som automatisk reserv.
  Båda är gratis och anropas direkt från telefonen. Valutakurserna kommer från ECB via
  Frankfurter.
- **Graderade priser är uppskattningar.** Det finns inget gratis API med slutpriser för
  graderade kort som går att anropa från en webbläsare. Appen räknar därför fram
  graderade priser från marknadsvärdet, med typiska premier per era (vintage, klassisk,
  modern) och golvpriser för billiga kort. Varje kortsida har direktlänkar till sålda
  exemplar på eBay och PriceCharting. I samlingen kan du ange ett känt värde för en slab,
  som då ersätter uppskattningen.
- **Gratisgräns.** Utan API-nyckel tillåter pokemontcg.io ungefär 1 000 anrop per dag.
  En gratis nyckel från [dev.pokemontcg.io](https://dev.pokemontcg.io) kan läggas in
  under *Mer → Kortdatabas*.
- **Skanning.** Fungerar bäst med kortet på en mörk, matt yta, i jämnt ljus och utan
  reflexer. Textigenkänningen (~4 MB) laddas ner första gången du öppnar skannern.

## Utveckling

Ren JavaScript (ES-moduler) utan byggsteg och utan beroenden.

```bash
cd kortkollen
npm start   # http://localhost:8080 (localhost räknas som säker, så kameran fungerar)
npm test    # enhetstester med node:test
```

| Fil | Innehåll |
|---|---|
| `js/grading.js` | Graderingsskalor, centreringskrav, betygsuppskattning, förväntat värde |
| `js/prices.js` | Råpris, valuta, modell för graderade priser, samlingsvärde |
| `js/vision.js` | Kanthittning, centreringsmätning, bildförbehandling för OCR, bildjämförelse |
| `js/ocr-parse.js` | Tolkning av OCR-text (nummer, setkod, namn) och rankning av kandidater |
| `js/api.js` | Pokémon TCG API och TCGdex, normalisering och cache |
| `js/store.js` | Samling, önskelista, pärmar och historik (localStorage) |
| `js/views/*` | Skärmar: hem, sök, skanna, kort, graderingskoll, samling, set och mer |
| `sw.js` | Offline-stöd. Höj `VERSION` vid större ändringar. |

Kortkollen är inte associerad med Nintendo, The Pokémon Company, PSA, Beckett, CGC eller SGC.
