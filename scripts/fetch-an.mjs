// Télécharge les scrutins publics et les groupes de l'Assemblée nationale (open data officiel,
// licence ouverte Etalab) et les convertit dans un format simple :
//   data/an/groupes.json   — les groupes parlementaires
//   data/an/scrutins.json  — un enregistrement par scrutin, avec la position de chaque groupe
//   data/an/deputes.json   — les députés et leurs périodes d'appartenance à un groupe
//
// Couvre le second mandat présidentiel : XVIe législature (2022-2024) et XVIIe (depuis 2024).
// Les numéros de scrutin repartent de 1 à chaque législature : un scrutin s'identifie par (législature, numéro).
//
// Usage : node scripts/fetch-an.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const LEGISLATURES = [16, 17];
const sources = (leg) => {
  const base = `https://data.assemblee-nationale.fr/static/openData/repository/${leg}`;
  return {
    scrutins: `${base}/loi/scrutins/Scrutins.json.zip`,
    // Référentiel historique : contient aussi les groupes dissous ou renumérotés.
    organes: `${base}/amo/tous_acteurs_mandats_organes_xi_legislature/AMO30_tous_acteurs_tous_mandats_tous_organes_historique.json.zip`,
  };
};

// Ordre des groupes dans l'hémicycle, de gauche à droite vu du perchoir.
// C'est l'ordre d'affichage sur le site. À vérifier sur le plan officiel de l'hémicycle.
// Les groupes de la XVIe législature (2022-2024) sont placés à côté de leurs successeurs.
const ORDRE_HEMICYCLE = ['LFI-NFP', 'LFI-NUPES', 'GDR', 'GDR-NUPES', 'EcoS', 'Ecolo-NUPES', 'SOC', 'LIOT', 'Dem', 'EPR', 'RE', 'HOR', 'DR', 'LR', 'UDR', 'AD', 'RN', 'NI'];

const OUT_DIR = 'data/an';
const work = join(tmpdir(), `poliapp-an-${Date.now()}`);

async function download(url, dest, essais = 3) {
  console.log(`Téléchargement ${url}`);
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
      writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      return;
    } catch (e) {
      // Le serveur coupe parfois les gros transferts : on réessaie.
      if (i >= essais) throw e;
      console.warn(`  échec (${e.message}), nouvel essai…`);
    }
  }
}

function unzip(zip, dir) {
  mkdirSync(dir, { recursive: true });
  execFileSync('unzip', ['-q', '-o', zip, '-d', dir]);
}

function readJsonDir(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
}

const asArray = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const int = (x) => Number.parseInt(x ?? '0', 10) || 0;

function typeDeVote(titre) {
  const t = titre.toLowerCase().replace(/’/g, "'");
  if (t.startsWith("l'ensemble")) return 'ensemble';
  // Les votes solennels sont intitulés directement « la proposition de loi … » ou « le projet de loi … ».
  if (/^(la|le) (proposition|projet) de (loi|résolution)/.test(t)) return 'ensemble';
  if (/^la (première|deuxième|troisième) partie/.test(t)) return 'partie';
  if (t.startsWith('la motion')) return 'motion';
  if (t.includes('sous-amendement')) return 'sous-amendement';
  if (t.includes('amendement')) return 'amendement';
  if (t.startsWith("l'article")) return 'article';
  if (t.includes('déclaration du gouvernement') || t.includes('declaration du gouvernement')) return 'declaration';
  return 'autre';
}

// "… à l'article 6 du projet de loi de finances pour 2025 (n°324)." → "projet de loi de finances pour 2025"
function texteConcerne(titre) {
  const m = titre.match(/(projet|proposition) de (loi|résolution)[^(]*/i);
  return m ? m[0].trim().replace(/[.,;]+$/, '') : null;
}

// Un même groupe peut avoir plusieurs identifiants au fil de la législature (ex. UDR, renuméroté
// en septembre 2025). On regroupe donc par sigle : c'est le sigle qui sert de clé sur le site.
function convertirGroupes(organes) {
  const parSigle = new Map();
  for (const { organe: o } of organes) {
    if (o.codeType !== 'GP' || !LEGISLATURES.includes(Number(o.legislature))) continue;
    // « LFI - NUPES » → « LFI-NUPES » : un sigle sert d'identifiant et de nom de fichier (logos).
    const sigle = o.libelleAbrege.replace(/\s*-\s*/g, '-');
    if (parSigle.get(sigle)?.periodes.some((p) => p.id === o.uid)) continue;
    const periode = { id: o.uid, legislature: Number(o.legislature), nom: o.libelle, dateDebut: o.viMoDe?.dateDebut ?? null, dateFin: o.viMoDe?.dateFin ?? null };
    const g = parSigle.get(sigle) ?? { sigle, nom: o.libelle, actif: false, periodes: [] };
    g.periodes.push(periode);
    if (!periode.dateFin) Object.assign(g, { nom: o.libelle, actif: true });
    parSigle.set(sigle, g);
  }
  const rang = (g) => {
    const i = ORDRE_HEMICYCLE.indexOf(g.sigle);
    return i === -1 ? ORDRE_HEMICYCLE.length : i;
  };
  return [...parSigle.values()].sort((a, b) => rang(a) - rang(b));
}

// Pour chaque député de la législature : son nom et ses périodes d'appartenance à un groupe
// (sert à savoir au nom de quel groupe un orateur s'exprime en séance).
function convertirDeputes(acteurs, sigleDe, deputes = {}) {
  for (const { acteur: a } of acteurs) {
    const periodes = asArray(a.mandats?.mandat)
      .filter((m) => m.typeOrgane === 'GP' && sigleDe.has(m.organes?.organeRef))
      .map((m) => ({ sigle: sigleDe.get(m.organes.organeRef), debut: m.dateDebut, fin: m.dateFin ?? null }))
      .sort((x, y) => x.debut.localeCompare(y.debut));
    if (!periodes.length) continue;
    const { civ, prenom, nom } = a.etatCivil.ident;
    const id = a.uid['#text'] ?? a.uid;
    // Un député présent dans les deux référentiels : on fusionne ses périodes.
    const connues = deputes[id]?.groupes ?? [];
    const toutes = [...connues, ...periodes.filter((p) => !connues.some((c) => c.sigle === p.sigle && c.debut === p.debut))];
    deputes[id] = { nom: `${civ} ${prenom} ${nom}`, groupes: toutes.sort((x, y) => x.debut.localeCompare(y.debut)) };
  }
  return deputes;
}

// La « positionMajoritaire » publiée contredit le décompte des voix dans environ 3 % des cas.
// On recalcule donc la position à partir du décompte : null si personne n'a voté, « partage » en cas d'égalité.
function positionDuGroupe(vote) {
  const max = Math.max(vote.pour, vote.contre, vote.abstention);
  if (max === 0) return null;
  const enTete = Object.keys(vote).filter((k) => vote[k] === max);
  return enTete.length === 1 ? enTete[0] : 'partage';
}

function convertirScrutin({ scrutin: s }, sigleDe, inconnus) {
  const groupes = {};
  for (const g of asArray(s.ventilationVotes?.organe?.groupes?.groupe)) {
    const sigle = sigleDe.get(g.organeRef);
    if (!sigle) {
      inconnus.add(g.organeRef);
      continue;
    }
    const d = g.vote?.decompteVoix ?? {};
    const vote = { pour: int(d.pour), contre: int(d.contre), abstention: int(d.abstentions) };
    const position = positionDuGroupe(vote);
    const positionSource = g.vote?.positionMajoritaire ?? null;
    groupes[sigle] = {
      position,
      // Conservée seulement quand elle contredit le décompte, pour pouvoir le signaler.
      ...(position && positionSource !== position ? { positionSource } : {}),
      membres: int(g.nombreMembresGroupe),
      ...vote,
      // « nonVotantsVolontaires » recoupe les abstentions dans la source : on ne l'additionne pas.
      nonVotants: int(d.nonVotants),
    };
  }
  const synthese = s.syntheseVote ?? {};
  return {
    id: s.uid,
    legislature: int(s.legislature),
    numero: int(s.numero),
    date: s.dateScrutin,
    titre: s.titre,
    type: typeDeVote(s.titre),
    texte: texteConcerne(s.titre),
    resultat: s.sort?.code ?? null,
    demandeur: s.demandeur?.texte ?? null,
    seance: s.seanceRef ?? null,
    decompte: {
      votants: int(synthese.nombreVotants),
      pour: int(synthese.decompte?.pour),
      contre: int(synthese.decompte?.contre),
      abstention: int(synthese.decompte?.abstentions),
    },
    groupes,
    url: `https://www.assemblee-nationale.fr/dyn/${int(s.legislature)}/scrutins/${int(s.numero)}`,
  };
}

async function main() {
  mkdirSync(work, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    for (const leg of LEGISLATURES) {
      await download(sources(leg).scrutins, join(work, `scrutins-${leg}.zip`));
      await download(sources(leg).organes, join(work, `organes-${leg}.zip`));
      unzip(join(work, `scrutins-${leg}.zip`), join(work, `scrutins-${leg}`));
      unzip(join(work, `organes-${leg}.zip`), join(work, `organes-${leg}`));
    }
    const organes = LEGISLATURES.flatMap((leg) => readJsonDir(join(work, `organes-${leg}/json/organe`)));
    const groupes = convertirGroupes(organes);
    const sigleDe = new Map(groupes.flatMap((g) => g.periodes.map((p) => [p.id, g.sigle])));
    const inconnus = new Set();
    const scrutins = LEGISLATURES.flatMap((leg) =>
      readJsonDir(join(work, `scrutins-${leg}/json`))
        .map((s) => convertirScrutin(s, sigleDe, inconnus))
        .sort((a, b) => a.numero - b.numero),
    );
    if (inconnus.size) console.warn(`Identifiants de groupe inconnus, ignorés : ${[...inconnus].join(', ')}`);
    const horsOrdre = groupes.filter((g) => !ORDRE_HEMICYCLE.includes(g.sigle)).map((g) => g.sigle);
    if (horsOrdre.length) console.warn(`Groupes absents de ORDRE_HEMICYCLE : ${horsOrdre.join(', ')}`);
    const deputes = {};
    for (const leg of LEGISLATURES) convertirDeputes(readJsonDir(join(work, `organes-${leg}/json/acteur`)), sigleDe, deputes);

    const meta = { source: Object.fromEntries(LEGISLATURES.map((l) => [l, sources(l)])), licence: 'Licence Ouverte / Etalab 2.0', recupereLe: new Date().toISOString() };
    writeFileSync(join(OUT_DIR, 'groupes.json'), JSON.stringify({ meta, groupes }, null, 2));
    writeFileSync(join(OUT_DIR, 'scrutins.json'), JSON.stringify({ meta, scrutins }));
    writeFileSync(join(OUT_DIR, 'deputes.json'), JSON.stringify({ meta, deputes }));
    const parLeg = LEGISLATURES.map((l) => `${l}e : ${scrutins.filter((s) => s.legislature === l).length}`).join(', ');
    console.log(`${groupes.length} groupes, ${Object.keys(deputes).length} députés, scrutins par législature : ${parLeg} → ${OUT_DIR}/`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
