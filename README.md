# Super Elf Dashboard — seizoen 2026-2027

Broncode voor de Super Elf-poule, seizoen 26-27. Bevat de nieuwe spelerslijst
(18 clubs) en spelregels; teams, wedstrijden en uitslagen zijn nog leeg —
die vul je zelf in via de site zelf.

## Structuur

- `src/` — de losse HTML/JS/CSS-onderdelen van het dashboard (worden bij het
  bouwen samengevoegd tot één pagina).
- `data/` — seizoensdata als JSON: `spelregels.json`, `players.json`
  (clubs + spelerslijst), `teams.json`, `allweeks.json`, `tussenstand.json`.
- `build.py` — voegt `src/` en `data/` samen tot `dist/index.html`.
- `validate_2627.js` — controleert na het bouwen of de site correct laadt
  (spelregels, wisselregel, login, teams aanmaken).
- `.github/workflows/deploy.yml` — bouwt en publiceert de site automatisch
  naar GitHub Pages bij elke push naar `main`.

## Zelf een kleine aanpassing doen

Wil je bijvoorbeeld een tekst of regel aanpassen? Bewerk het juiste bestand
in `src/` of `data/` direct op GitHub (potloodje bij het bestand → wijziging
opslaan als nieuwe commit op `main`). De site wordt daarna automatisch
opnieuw gebouwd en gepubliceerd; dat duurt ongeveer een halve minuut
(te volgen via het tabblad "Actions" van deze repository).

## Lokaal bouwen en testen

```
python build.py
node validate_2627.js
```

`dist/index.html` is daarna de volledige, werkende site.

## Wisselregel 26-27

Elk team krijgt 5 reguliere wissels bij de start van het seizoen, en na
speelronde 17 een extra (6e) wissel. Dit staat in `data/spelregels.json`
als `max_wissels` (5) en `extra_wissel_na_ronde` (17), en wordt automatisch
verwerkt in de teampagina.

## Gedeelde opslag & login

Dezelfde Firebase-accounts als de 25-26 site (`koen` / `Frank`) werken hier
ook — dit is dezelfde Firebase-project, maar de 26-27 data staat op een eigen
plek in de database (`superElfState2627`), dus de twee seizoenen komen niet
met elkaar in de war.
