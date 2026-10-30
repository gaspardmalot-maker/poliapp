# Poliapp

Comparer, sujet par sujet, **ce que les groupes ont voté** à l'Assemblée nationale depuis 2022 (XVIe et XVIIe législatures) et **ce que les partis proposent**. Tout est sourcé, rien n'est classé ni noté. Les règles sont dans [docs/charte.md](docs/charte.md).

Site : https://gaspardmalot-maker.github.io/poliapp/ (version de test, republiée automatiquement à chaque mise à jour de `main`).

**Licences** : code sous licence MIT ([LICENSE](LICENSE)) ; sélections, résumés et données produites par le projet sous CC BY 4.0 ; données de l'Assemblée nationale sous Licence Ouverte 2.0. Les programmes des partis ne sont pas republiés : seules de courtes citations sourcées le sont.

## Organisation

```
data/
  sujets.json                 Les sujets et leurs mots-clés (édité à la main)
  an/                         Votes de l'Assemblée, générés par scripts/fetch-an.mjs
  candidats/<sujet>.json      Scrutins pré-triés par mots-clés (généré)
  selection/<sujet>.json      Scrutins retenus + explications (pré-sélection automatique, puis relue à la main)
  curation.json               Ajouts et exclusions manuels pour la pré-sélection automatique
  explications/<sujet>.json   Interventions des groupes dans les débats, avec vidéo (généré)
  programmes/
    sources.json              Programmes et déclarations publiques à suivre (édité à la main)
    textes/                   Texte extrait page par page (généré)
    candidats/<sujet>.json    Passages pré-triés par mots-clés (généré)
    extraits/<sujet>.json     Citations retenues (édité à la main)
docs/
  charte.md                   Règles éditoriales → future page « Méthodologie »
  revue/<sujet>.md            Liste lisible des scrutins candidats, pour la relecture
maquette/                     Maquette du site (accueil + une page par sujet), générée à partir des vraies données
```

Règle d'or : **les scripts proposent, un humain décide**. Les fichiers générés sont refaits à chaque lancement ; les fichiers édités à la main ne sont jamais modifiés par un script.

## Votes à l'Assemblée

Chaîne complète, dans l'ordre :

```bash
npm run votes                              # télécharge les scrutins 2022→aujourd'hui + pré-tri par sujet
node scripts/brouillon.mjs                 # pré-sélection automatique des votes de chaque sujet
node scripts/explications.mjs extraire     # interventions des groupes dans les débats (+ vidéos)
node scripts/explications.mjs proposer     # une citation proposée par groupe (statut « auto »)
node scripts/explications.mjs verifier     # chaque citation existe mot pour mot
npm run maquette                           # génère le site
```

Un scrutin est désigné par son identifiant officiel (`"id": "VTANR5L16V1240"`), ou par son seul numéro pour la XVIIe législature (`"numero": 3061`). Les numéros repartent de 1 à chaque législature, et le Congrès a sa propre numérotation (`VTCG…`).

**Statuts** : `auto` (proposé par un script, signalé sur le site), `brouillon` (choisi à la main, à relire), `valide` (relu). Une entrée qui n'est plus `auto` n'est jamais modifiée par les scripts. La pré-sélection garde en priorité les votes finaux les plus suivis ; `data/curation.json` permet d'ajouter un vote que les mots-clés ne trouvent pas (motions de censure…) ou d'écarter un faux ami (« sécurité sociale » dans Sécurité…).

Pour voir le résultat :

```bash
npm run maquette                           # → maquette/index.html + une page par sujet sélectionné
```

### Explications de vote

`extraire` produit `docs/revue/explications-<sujet>.md` (phrases clés pré-repérées, à relire). Les citations retenues vont dans `data/selection/<sujet>.json`, sous chaque scrutin :

```json
"explications": { "RN": { "ancre": "3854085", "citations": ["Phrase exacte.", "Autre phrase exacte."], "statut": "brouillon" } }
```

`ancre` identifie l'intervention dans le compte rendu (elle figure dans le fichier de revue). `extraire` récupère aussi la vidéo de chaque intervention (flux officiel et minutage) ; les vidéos de plus d'un an environ ne sont plus en ligne et sont ignorées. Les comptes rendus des séances très récentes sont provisoires et parfois incomplets : relancer `extraire` quelques jours plus tard.

Points d'attention sur les données :

- La « position majoritaire » publiée par l'Assemblée contredit le décompte des voix dans environ 3 % des cas. La position est donc recalculée à partir du décompte, et l'écart est signalé (`positionSource`).
- Les groupes sont identifiés par leur sigle, car un même groupe peut changer d'identifiant (UDR en septembre 2025).
- Le pré-tri ne lit que l'intitulé des scrutins. Les amendements des lois budgétaires (PLF, PLFSS), qui portent beaucoup de votes sur les retraites et le pouvoir d'achat, n'y apparaissent pas encore.

## Programmes

1. Ajouter le document dans `data/programmes/sources.json` :
   ```json
   { "id": "parti-x-2027", "parti": "Parti X", "candidat": "…", "titre": "…", "type": "programme",
     "url": "https://…/programme.pdf", "publieLe": "2027-01-15", "archive": "https://web.archive.org/…" }
   ```
2. `npm run programmes:extraire` : télécharge, garde une copie locale et son empreinte SHA-256, extrait le texte page par page.
3. `npm run programmes:pretri` : liste, pour chaque sujet, les passages contenant ses mots-clés (`data/programmes/candidats/`).
4. Recopier les citations retenues dans `data/programmes/extraits/<sujet>.json` :
   ```json
   { "sujet": "logement", "extraits": [ { "source": "parti-x-2027", "page": 12, "citation": "Texte exact.", "statut": "brouillon" } ] }
   ```
5. `npm run programmes:verifier` : vérifie que chaque citation existe mot pour mot, à la bonne page. À lancer avant chaque publication.

**Déclarations publiques** (entretien, communiqué, article) : même chaîne, avec une source de type `declaration` :

```json
{ "id": "rn-entretien-2026-10-14", "type": "declaration", "parti": "Rassemblement national", "groupe": "RN", "orateur": "Prénom Nom", "media": "France Inter", "publieLe": "2026-10-14", "url": "https://…" }
```

La page est archivée à l'extraction et chaque citation est vérifiée mot pour mot dans le texte de la page. Préférer les sources primaires (communiqué du parti, verbatim publié par le média) aux reprises.

Les PDF scannés (images sans texte) sont signalés à l'extraction : il faudra les passer en reconnaissance de caractères.

## Sources

- Assemblée nationale, open data : https://data.assemblee-nationale.fr (Licence Ouverte / Etalab 2.0)
