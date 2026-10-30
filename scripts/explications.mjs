// Explications de vote des groupes, tirées des comptes rendus officiels de séance (open data de l'Assemblée).
//
// Pour chaque scrutin retenu dans data/selection/<sujet>.json, on retrouve la séance du vote, le texte discuté,
// puis les interventions des orateurs de groupe dans la « Discussion générale » et les « Explications de vote »
// de cette lecture. Chaque intervention garde un lien vers le passage exact du compte rendu.
//
//   extraire  → data/explications/<sujet>.json (interventions complètes + phrases clés pré-repérées)
//               docs/revue/explications-<sujet>.md (version lisible, pour choisir les citations)
//   verifier  → contrôle que chaque citation de data/selection/<sujet>.json figure mot pour mot dans l'intervention
//
// Le choix des 2-3 phrases citées reste humain : elles sont recopiées dans data/selection/<sujet>.json.
//
// Usage : node scripts/explications.mjs <extraire|verifier|proposer> [sujet…]

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';

// Second mandat présidentiel : XVIe (2022-2024) et XVIIe (depuis 2024) législatures.
const LEGISLATURES = [16, 17];
const SOURCE = (leg) => `https://data.assemblee-nationale.fr/static/openData/repository/${leg}/vp/syceronbrut/syseron.xml.zip`;
const CACHE = '.cache/syceron';
// La législature se lit dans l'identifiant du compte rendu : CRSANR5L17S2026O1N008 → 17.
const legislatureDe = (uid) => uid.match(/L(\d+)S/)[1];
const URL_CR = (uid, ancre) => `https://www.assemblee-nationale.fr/dyn/${legislatureDe(uid)}/comptes-rendus/seance/${uid}${ancre ? `#${ancre}` : ''}`;
// Un scrutin retenu est désigné par son identifiant officiel (id), ou par son seul numéro pour la XVIIe législature.
const idDe = (sel) => sel.id ?? `VTANR5L17V${sel.numero}`;
// Une lecture se discute rarement sur plus de trois semaines : au-delà, c'est une lecture précédente.
const FENETRE_JOURS = 21;

const lire = (chemin) => JSON.parse(readFileSync(chemin, 'utf8'));
const ecrire = (chemin, donnees) => writeFileSync(chemin, JSON.stringify(donnees, null, 2));
const normaliser = (t) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’`]/g, "'")
    .replace(/\(suite\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const espaces = (t) => t.replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();

async function preparerCache(leg) {
  const racine = join(CACHE, String(leg));
  const dossier = join(racine, 'xml/compteRendu');
  if (existsSync(dossier)) return dossier;
  mkdirSync(racine, { recursive: true });
  console.log(`Téléchargement des comptes rendus de la ${leg}e législature (≈60 Mo) : ${SOURCE(leg)}`);
  const res = await fetch(SOURCE(leg));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  writeFileSync(join(racine, 'syceron.zip'), Buffer.from(await res.arrayBuffer()));
  execFileSync('unzip', ['-q', '-o', join(racine, 'syceron.zip'), '-d', racine]);
  return dossier;
}

// Index léger (sans analyse XML complète) : séance, date et textes discutés de chaque compte rendu.
function indexer(dossier) {
  return readdirSync(dossier)
    .filter((f) => f.endsWith('.xml'))
    .map((f) => {
      const brut = readFileSync(join(dossier, f), 'utf8');
      const d = brut.match(/<dateSeance>(\d{4})(\d{2})(\d{2})/);
      const titres = [...brut.matchAll(/code_grammaire="TITRE_TEXTE_DISCUSSION"[^>]*>\s*<orateurs\/>\s*<texte[^>]*>([\s\S]*?)<\/texte>/g)].map((m) =>
        normaliser(m[1].replace(/<[^>]+>/g, '')),
      );
      return {
        fichier: join(dossier, f),
        uid: brut.match(/<uid>([^<]+)/)[1],
        seance: brut.match(/<seanceRef>([^<]+)/)?.[1],
        date: d ? `${d[1]}-${d[2]}-${d[3]}` : null,
        titres,
      };
    });
}

const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '', trimValues: false });

function texteDe(noeuds) {
  return noeuds
    .map((n) => {
      if ('#text' in n) return String(n['#text']);
      const [tag] = Object.keys(n).filter((k) => k !== ':@');
      return tag === 'br' ? '\n' : texteDe(n[tag]);
    })
    .join('');
}

// Aplatit le compte rendu en une suite d'éléments « point » (titres de section) et « paragraphe » (prises de parole).
function elements(fichier) {
  const sortie = [];
  const parcourir = (noeuds) => {
    for (const n of noeuds) {
      const [tag] = Object.keys(n).filter((k) => k !== ':@' && k !== '#text');
      if (!tag) continue;
      if (tag === 'point' || tag === 'paragraphe') {
        const enfants = n[tag];
        const texte = enfants.find((e) => 'texte' in e);
        const orateur = enfants.find((e) => 'orateurs' in e)?.orateurs.find((o) => 'orateur' in o)?.orateur ?? [];
        const qualite = orateur.find((o) => 'qualite' in o);
        const nom = orateur.find((o) => 'nom' in o);
        sortie.push({
          type: tag,
          attrs: n[':@'] ?? {},
          texte: texte ? espaces(texteDe(texte.texte)) : '',
          nom: nom ? espaces(texteDe(nom.nom)) : '',
          qualite: qualite ? espaces(texteDe(qualite.qualite)) : '',
          // Minutage de la prise de parole dans la vidéo de la séance, en secondes.
          temps: texte?.[':@']?.stime ? Math.round(Number(texte[':@'].stime)) : null,
        });
      }
      if (tag !== 'texte') parcourir(n[tag]);
    }
  };
  parcourir(parser.parse(readFileSync(fichier, 'utf8')));
  return sortie;
}

// Le titre du texte au moment du vote : on repère l'annonce du résultat dont le nombre de votants correspond.
// Deux scrutins d'une même séance peuvent avoir le même nombre de votants : pour un vote sur l'ensemble,
// on préfère l'annonce faite dans la section « Vote sur l'ensemble ».
// Si le compte rendu est encore provisoire et s'arrête avant le vote, on prend le texte discuté
// dont l'intitulé ressemble le plus à celui du scrutin.
function titreDuVote(els, scrutin) {
  let titre = null;
  const correspondances = [];
  const titres = new Set();
  for (const e of els) {
    if (e.attrs.code_grammaire === 'TITRE_TEXTE_DISCUSSION') titres.add((titre = normaliser(e.texte)));
    if (/Voici le résultat du scrutin/.test(e.texte) && Number(e.texte.match(/Nombre de votants\s+(\d+)/)?.[1]) === scrutin.decompte.votants) {
      correspondances.push({ titre, ensemble: e.attrs.code_grammaire?.startsWith('VOTE_ENS') });
    }
  }
  if (correspondances.length) {
    return (correspondances.find((c) => c.ensemble === (scrutin.type === 'ensemble')) ?? correspondances[0]).titre;
  }
  const mots = new Set(normaliser(scrutin.titre).split(/\W+/).filter((m) => m.length > 3));
  const score = (t) => t.split(/\W+/).filter((m) => mots.has(m)).length;
  return [...titres].sort((a, b) => score(b) - score(a))[0] ?? null;
}

const SECTIONS = [
  [/^discussion generale/, 'Discussion générale'],
  // Motions de censure : orateurs des groupes dans « Discussion et votes ».
  [/^discussion et votes?/, 'Discussion de la motion'],
  [/^explications? de vote/, 'Explications de vote'],
];

function groupeA(depute, date) {
  return depute?.groupes.find((g) => g.debut <= date && (!g.fin || g.fin >= date))?.sigle ?? null;
}

// L'identifiant de l'orateur est parfois faux dans la source (homonymes : Philippe et Jean-Pierre Vigier).
// Quand le nom affiché ne correspond pas au député identifié, on retrouve le député par son nom.
const nomCle = (n) => normaliser(n).replace(/^(m\.|mme|mmes|mm\.)\s+/, '');
const indexNoms = new WeakMap();
function auteurReel(e, deputes) {
  const id = e.attrs.id_acteur;
  if (!e.nom || !deputes[id] || nomCle(e.nom) === nomCle(deputes[id].nom)) return id;
  if (!indexNoms.has(deputes)) indexNoms.set(deputes, new Map(Object.entries(deputes).map(([i, d]) => [nomCle(d.nom), i])));
  return indexNoms.get(deputes).get(nomCle(e.nom)) ?? id;
}

// Interventions des orateurs de groupe sur un texte donné, dans un compte rendu.
function interventions(cr, titre, deputes) {
  const resultat = [];
  let titreCourant = null;
  let section = null;
  let courante = null;
  for (const e of elements(cr.fichier)) {
    if (e.type === 'point') {
      if (e.attrs.code_grammaire === 'TITRE_TEXTE_DISCUSSION') titreCourant = normaliser(e.texte);
      if (e.texte) section = SECTIONS.find(([re]) => re.test(normaliser(e.texte)))?.[1] ?? null;
      courante = null;
      continue;
    }
    if (titreCourant !== titre || !section) continue;
    const id = auteurReel(e, deputes);
    // On ne garde que les députés qui parlent au nom de leur groupe : ni présidence, ni rapporteurs, ni ministres.
    const preside = e.attrs.roledebat === 'president' || /^(M\. le|Mme la) président/.test(e.nom);
    const orateurDeGroupe = e.attrs.code_grammaire === 'PAROLE_GENERIQUE' && !preside && !e.qualite && deputes[id];
    if (!orateurDeGroupe) continue;
    if (courante?.idActeur === id) {
      courante.texte += ` ${e.texte}`;
      continue;
    }
    courante = resultat.find((r) => r.idActeur === id && r.section === section && r.cr === cr.uid);
    if (courante) {
      courante.texte += ` ${e.texte}`;
      continue;
    }
    courante = {
      groupe: groupeA(deputes[id], cr.date),
      orateur: deputes[id].nom,
      idActeur: id,
      section,
      date: cr.date,
      cr: cr.uid,
      ancre: e.attrs.id_syceron,
      url: URL_CR(cr.uid, e.attrs.id_syceron),
      temps: e.temps,
      texte: e.texte,
    };
    resultat.push(courante);
  }
  return resultat;
}

// Vidéo de chaque intervention. Elle ne figure que dans la page HTML du compte rendu (mise en cache) :
// chaque bloc d'intervention <div id="<id_syceron>"> porte un bouton « Voir la vidéo à partir de cet instant »
// avec le flux HLS de la séance et le minutage de départ. Le flux autorise la lecture depuis un autre site.
async function videosDeSeance(uid) {
  const chemin = join(CACHE, legislatureDe(uid), 'html', `${uid}.html`);
  if (!existsSync(chemin)) {
    mkdirSync(join(CACHE, legislatureDe(uid), 'html'), { recursive: true });
    const res = await fetch(URL_CR(uid), { headers: { 'User-Agent': 'Poliapp (comparateur citoyen, non commercial)' } });
    if (!res.ok) return new Map();
    writeFileSync(chemin, await res.text());
  }
  const html = readFileSync(chemin, 'utf8');
  const blocs = [...html.matchAll(/<div id="(\d+)"/g)].map((m) => ({ ancre: m[1], position: m.index }));
  const boutons = [...html.matchAll(/data-content="(https:\/\/videos-diffusion[^"]+\.m3u8)"\s*data-contentParameters='\{"currentTime":\s*([\d.]+)\}'/g)];
  const videos = new Map();
  for (const b of boutons) {
    const bloc = blocs.filter((x) => x.position < b.index).at(-1);
    if (bloc && !videos.has(bloc.ancre)) videos.set(bloc.ancre, { flux: b[1], debut: Math.round(Number(b[2])) });
  }
  // Compte rendu provisoire : les boutons manquent parfois, mais le flux de la séance est connu.
  videos.fluxSeance = boutons[0]?.[1] ?? html.match(/https:\/\/videos-diffusion[^"]+\.m3u8/)?.[0] ?? null;
  return videos;
}

// Les vidéos anciennes (environ un an) sont retirées du flux direct : on ne garde que celles qui répondent.
const disponibilites = new Map();
function fluxDisponible(url) {
  if (!disponibilites.has(url)) disponibilites.set(url, fetch(url).then((r) => r.ok, () => false));
  return disponibilites.get(url);
}

// Phrases où l'orateur annonce ou justifie le vote de son groupe : point de départ pour choisir la citation.
const MARQUEURS = /\b(vot(e|er|era|erons|eront|ons)|abstien|abstiendr|abstention|soutien|soutiendr|favorable|opposer|opposé|c'est pourquoi|pour toutes ces raisons|nous ne pouvons|approuver)/i;
function phrasesCles(texte) {
  const phrases = texte.split(/(?<=[.!?…])\s+(?=[A-ZÀ-Ý«])/u);
  const retenues = new Set();
  phrases.forEach((p, i) => {
    if (MARQUEURS.test(p)) {
      if (i > 0) retenues.add(i - 1);
      retenues.add(i);
    }
  });
  return [...retenues].sort((a, b) => a - b).slice(-4).map((i) => phrases[i]);
}

async function extraire() {
  const index = [];
  for (const leg of LEGISLATURES) index.push(...indexer(await preparerCache(leg)));
  const { scrutins } = lire('data/an/scrutins.json');
  const { deputes } = lire('data/an/deputes.json');
  const { groupes } = lire('data/an/groupes.json');
  const ordre = groupes.map((g) => g.sigle);
  mkdirSync('data/explications', { recursive: true });
  mkdirSync('docs/revue', { recursive: true });

  // Sujets demandés en argument (par défaut : tous). Un sujet par processus évite d'épuiser la mémoire.
  const demandes = process.argv.slice(3);
  for (const f of readdirSync('data/selection').filter((f) => f.endsWith('.json') && (!demandes.length || demandes.includes(f.slice(0, -5))))) {
    const selection = lire(join('data/selection', f));
    const sortie = { sujet: selection.sujet, genereLe: new Date().toISOString(), scrutins: [] };
    const md = [`# Explications de vote : ${selection.sujet}`, '', 'Interventions des orateurs de groupe, tirées des comptes rendus officiels. Choisir 2-3 phrases par groupe, à recopier mot pour mot dans `data/selection/`.', ''];

    for (const sel of selection.scrutins) {
      const scrutin = scrutins.find((s) => s.id === idDe(sel));
      const crVote = index.find((c) => c.seance === scrutin.seance);
      if (!crVote) {
        console.warn(`${idDe(sel)} : compte rendu de la séance ${scrutin.seance} pas encore publié`);
        continue;
      }
      const titre = titreDuVote(elements(crVote.fichier), scrutin);
      const debut = new Date(new Date(scrutin.date).getTime() - FENETRE_JOURS * 864e5).toISOString().slice(0, 10);
      const crs = index.filter((c) => c.titres.includes(titre) && c.date >= debut && c.date <= scrutin.date).sort((a, b) => a.date.localeCompare(b.date));
      const videos = Object.fromEntries(await Promise.all(crs.map(async (cr) => [cr.uid, await videosDeSeance(cr.uid)])));
      const toutes = crs
        .flatMap((cr) => interventions(cr, titre, deputes))
        .map((i) => {
          const v = videos[i.cr];
          // À défaut de bouton, le minutage du compte rendu (stime) est le même que celui du lecteur officiel.
          const video = v.get(i.ancre) ?? (v.fluxSeance && i.temps != null ? { flux: v.fluxSeance, debut: i.temps } : null);
          return { ...i, video, phrasesCles: phrasesCles(i.texte) };
        });
      for (const i of toutes) if (i.video && !(await fluxDisponible(i.video.flux))) i.video = null;
      const parGroupe = Object.groupBy(toutes, (i) => i.groupe ?? '?');
      const sansIntervention = ordre.filter((g) => scrutin.groupes[g] && !parGroupe[g]);
      sortie.scrutins.push({ id: scrutin.id, numero: scrutin.numero, titreDebat: titre, comptesRendus: crs.map((c) => c.uid), interventions: parGroupe, sansIntervention });
      console.log(`${idDe(sel)} « ${titre} » : ${crs.length} séance(s), ${toutes.length} interventions, groupes sans intervention : ${sansIntervention.join(', ') || 'aucun'}`);

      md.push(`## ${idDe(sel)} — ${sel.resume}`, '');
      for (const g of ordre.filter((g) => parGroupe[g])) {
        md.push(`### ${g} (vote : ${scrutin.groupes[g]?.position ?? '—'})`, '');
        for (const i of parGroupe[g]) {
          md.push(`**${i.orateur}** · ${i.section} · ${i.date} · [compte rendu](${i.url})`, '');
          i.phrasesCles.forEach((p) => md.push(`> ${p}`, '>'));
          md.push('');
        }
      }
      if (sansIntervention.length) md.push(`_Pas d'intervention trouvée pour : ${sansIntervention.join(', ')}_`, '');
    }
    ecrire(`data/explications/${selection.sujet}.json`, sortie);
    writeFileSync(`docs/revue/explications-${selection.sujet}.md`, md.join('\n'));
  }
}

function verifier() {
  let erreurs = 0;
  for (const f of readdirSync('data/selection').filter((f) => f.endsWith('.json'))) {
    const selection = lire(join('data/selection', f));
    const chemin = `data/explications/${selection.sujet}.json`;
    if (!existsSync(chemin)) continue;
    const extraits = lire(chemin);
    for (const sel of selection.scrutins) {
      const sources = extraits.scrutins.find((s) => s.id === idDe(sel))?.interventions ?? {};
      for (const [groupe, e] of Object.entries(sel.explications ?? {})) {
        const intervention = (sources[groupe] ?? []).find((i) => i.ancre === e.ancre);
        for (const citation of e.citations) {
          const ok = intervention && espaces(intervention.texte).includes(espaces(citation));
          if (!ok) erreurs++;
          console.log(`${ok ? '✓' : '✗'} ${idDe(sel)} ${groupe.padEnd(8)} « ${espaces(citation).slice(0, 70)}… »${intervention ? '' : ' (intervention introuvable)'}`);
        }
      }
    }
  }
  console.log(erreurs ? `\n${erreurs} citation(s) à corriger.` : '\nToutes les citations sont conformes.');
  process.exitCode = erreurs ? 1 : 0;
}

// --- proposer ----------------------------------------------------------------------------------
// Pour les sélections automatiques, propose une citation par groupe : la dernière phrase où l'orateur
// annonce le vote de son groupe, précédée de la phrase d'avant si elle est courte. Les didascalies
// (« (Applaudissements…) », toujours entre parenthèses) sont exclues. Chaque citation reste un extrait exact de l'intervention ;
// elle est marquée « auto » pour signaler qu'elle n'a pas été relue.
const ANNONCE = /\b(nous voterons|votera|voteront|voterai|nous la voterons|nous le voterons|nous nous abstiendrons|s'abstiendra|abstiendrons|soutiendra|soutiendrons|apportera son soutien|apporterons notre soutien|ne votera pas|ne voterons pas|votera contre|voterons contre|voterons pour|votera pour|votera en faveur|voterons en faveur|se prononcera)/i;

function phrasesAvecPosition(texte) {
  return [...texte.matchAll(/[^.!?…]+[.!?…]+[»"]?/g)].map((m) => {
    let debut = m.index;
    let contenu = m[0];
    // On saute ce qui reste d'une didascalie fermée dans la phrase : « …bancs du groupe X.) Nous voterons… ».
    const fermante = contenu.indexOf(')');
    const ouvrante = contenu.indexOf('(');
    const finDidascalie = fermante >= 0 && (ouvrante < 0 || ouvrante > fermante) ? fermante + 1 : 0;
    const saut = finDidascalie + (contenu.slice(finDidascalie).match(/^[\s)–-]+/)?.[0].length ?? 0);
    debut += saut;
    contenu = contenu.slice(saut);
    // On coupe à la première parenthèse : dans les comptes rendus, ce sont des didascalies (réactions de la salle).
    const coupe = contenu.indexOf('(');
    if (coupe >= 0) contenu = contenu.slice(0, coupe);
    contenu = contenu.trimEnd();
    return { debut, fin: debut + contenu.length, contenu };
  });
}

export function choisirCitation(texte) {
  const phrases = phrasesAvecPosition(texte).filter((p) => p.contenu.length > 15);
  const i = phrases.findLastIndex((p) => ANNONCE.test(p.contenu));
  if (i < 0) return null;
  const annonce = phrases[i];
  const precedente = phrases[i - 1];
  const avecPrecedente = annonce.contenu.length < 160 && precedente && precedente.fin <= annonce.debut && precedente.contenu.length < 320 && !/[()]/.test(texte.slice(precedente.debut, annonce.debut));
  const citation = texte.slice(avecPrecedente ? precedente.debut : annonce.debut, annonce.fin).trim();
  return citation.length <= 650 ? citation : annonce.contenu.trim();
}

// Garde-fou contre les erreurs d'attribution de la source : une citation qui annonce le vote
// d'un autre groupe (« le groupe Les Démocrates votera… » attribué à un député DR) est écartée.
function parleDUnAutreGroupe(citation, sigle, groupes) {
  const texte = normaliser(citation);
  return groupes.some((g) => g.sigle !== sigle && g.periodes.some((p) => texte.includes(`groupe ${normaliser(p.nom)}`)));
}

function proposer() {
  const { groupes } = lire('data/an/groupes.json');
  let ajoutees = 0;
  let ecartees = 0;
  for (const f of readdirSync('data/selection').filter((f) => f.endsWith('.json'))) {
    const chemin = join('data/selection', f);
    const selection = lire(chemin);
    const extraits = lireSiExiste(`data/explications/${selection.sujet}.json`);
    if (!extraits) continue;
    for (const sel of selection.scrutins) {
      // --refaire : on repart de zéro pour les citations automatiques (jamais pour celles choisies à la main).
      if (process.argv.includes('--refaire') && sel.explications) {
        sel.explications = Object.fromEntries(Object.entries(sel.explications).filter(([, e]) => e.statut !== 'auto'));
      }
      const interventions = extraits.scrutins.find((s) => s.id === idDe(sel))?.interventions ?? {};
      for (const [groupe, liste] of Object.entries(interventions)) {
        if (groupe === 'NI' || groupe === '?' || sel.explications?.[groupe]) continue;
        // Explications de vote d'abord, sinon l'intervention la plus longue de la discussion générale.
        const triees = [...liste].filter((i) => i.texte.length > 300).sort((a, b) => (b.section === 'Explications de vote') - (a.section === 'Explications de vote') || b.texte.length - a.texte.length);
        for (const i of triees) {
          const citation = choisirCitation(i.texte);
          if (!citation) continue;
          if (parleDUnAutreGroupe(citation, groupe, groupes)) {
            ecartees++;
            continue;
          }
          sel.explications = { ...(sel.explications ?? {}), [groupe]: { ancre: i.ancre, citations: [citation], statut: 'auto' } };
          ajoutees++;
          break;
        }
      }
    }
    writeFileSync(chemin, JSON.stringify(selection, null, 2) + '\n');
  }
  console.log(`${ajoutees} citations proposées automatiquement (statut « auto », à relire), ${ecartees} écartées car attribuées au mauvais groupe dans la source.`);
}

const lireSiExiste = (chemin) => (existsSync(chemin) ? lire(chemin) : null);

const commandes = { extraire, verifier, proposer };
const commande = process.argv[2] ?? 'extraire';
if (!commandes[commande]) {
  console.error('Usage : node scripts/explications.mjs <extraire|verifier|proposer>');
  process.exit(1);
}
await commandes[commande]();
