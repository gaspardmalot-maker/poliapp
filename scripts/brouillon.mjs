// Pré-sélection automatique des votes d'un sujet, pour démarrer vite sur tous les sujets.
//
// Pour chaque sujet sans sélection manuelle, on retient les votes finaux (vote sur l'ensemble d'un texte,
// motions) trouvés par le pré-tri, plus les ajouts de data/curation.json, moins ses exclusions.
// On garde en priorité les votes les plus suivis (nombre de votants), puis on les range par date.
// Le résumé est tiré de l'intitulé officiel, sans reformulation.
//
// Le fichier produit (data/selection/<sujet>.json) porte « auto: true » : il peut être régénéré.
// Une entrée dont le statut n'est plus « auto » (relue à la main) est toujours conservée.
//
// Usage : node scripts/brouillon.mjs [sujet…]    (sans argument : tous les sujets)

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const MAX_VOTES = 12;
const lire = (chemin) => JSON.parse(readFileSync(chemin, 'utf8'));
const lireSiExiste = (chemin, defaut) => (existsSync(chemin) ? lire(chemin) : defaut);

const sujets = lire('data/sujets.json');
const { scrutins } = lire('data/an/scrutins.json');
const curation = lireSiExiste('data/curation.json', {});
const parId = new Map(scrutins.map((s) => [s.id, s]));
const idDe = (sel) => sel.id ?? `VTANR5L17V${sel.numero}`;

// « l'ensemble de la proposition de loi visant à X (première lecture). » → { resume: "Proposition de loi visant à X", lecture: "première lecture" }
export function resumeDepuisTitre(titre) {
  const lecture = titre.match(/\(([^()]*(lecture|commission mixte paritaire|définitive)[^()]*)\)\.?\s*$/i)?.[1] ?? null;
  const texte = titre
    .replace(/\s*\([^()]*(lecture|commission mixte paritaire|définitive)[^()]*\)\.?\s*$/i, '')
    .replace(/^(l['’]ensemble|sur la motion)\s+(du|de la|de l['’]|des|de)\s+/i, '')
    .replace(/^(la|le|les|l['’])\s+/i, '')
    .replace(/\.$/, '')
    .trim();
  return { resume: texte.charAt(0).toUpperCase() + texte.slice(1), lecture };
}

const estExclu = (s, exclusions) => exclusions.some((e) => e === s.id || (e.length > 12 && s.titre.toLowerCase().includes(e.toLowerCase())));

function preselectionner(sujet) {
  const chemin = `data/selection/${sujet.id}.json`;
  const existant = lireSiExiste(chemin, null);
  if (existant && !existant.auto) return { sujet, ignore: 'sélection manuelle' };

  const { ajouter = [], exclure = [] } = curation[sujet.id] ?? {};
  const candidats = lireSiExiste(`data/candidats/${sujet.id}.json`, { textes: [] }).textes.flatMap((t) => t.scrutins);
  const finaux = candidats.filter((c) => ['ensemble', 'motion'].includes(c.type)).map((c) => parId.get(c.id));
  const forces = ajouter.map((id) => parId.get(id)).filter(Boolean);

  // Les entrées relues à la main restent ; le reste est recalculé.
  const relues = (existant?.scrutins ?? []).filter((e) => e.statut !== 'auto');
  const dejaPris = new Set([...relues.map(idDe), ...forces.map((s) => s.id)]);
  // Une motion de rejet reprend le débat du texte : inutile si le vote final de ce texte est disponible.
  const textesVotes = new Set(finaux.filter((s) => s?.type === 'ensemble').map((s) => s.texte));
  const automatiques = finaux
    .filter((s) => s && !dejaPris.has(s.id) && !estExclu(s, exclure))
    .filter((s) => s.type !== 'motion' || !textesVotes.has(s.texte))
    .filter((s, i, liste) => liste.findIndex((x) => x.id === s.id) === i)
    .sort((a, b) => b.decompte.votants - a.decompte.votants)
    .slice(0, Math.max(MAX_VOTES - relues.length - forces.length, 0));

  const anciennes = new Map((existant?.scrutins ?? []).map((e) => [idDe(e), e]));
  const entrees = [
    ...relues,
    ...[...forces, ...automatiques].map((s) => {
      const { resume, lecture } = resumeDepuisTitre(s.titre);
      // On garde les explications déjà proposées pour ce scrutin.
      return { id: s.id, resume, ...(lecture ? { lecture } : {}), statut: 'auto', ...(anciennes.get(s.id)?.explications ? { explications: anciennes.get(s.id).explications } : {}) };
    }),
  ].sort((a, b) => parId.get(idDe(b)).date.localeCompare(parId.get(idDe(a)).date));

  writeFileSync(
    chemin,
    JSON.stringify(
      {
        sujet: sujet.id,
        auto: true,
        note: 'Pré-sélection automatique (scripts/brouillon.mjs). Passer « statut » à « valide » après relecture : l’entrée ne sera plus modifiée.',
        scrutins: entrees,
      },
      null,
      2,
    ) + '\n',
  );
  return { sujet, entrees };
}

const demandes = process.argv.slice(2);
for (const sujet of sujets.filter((s) => !demandes.length || demandes.includes(s.id))) {
  const r = preselectionner(sujet);
  if (r.ignore) {
    console.log(`= ${sujet.titre} (${r.ignore})`);
    continue;
  }
  console.log(`\n## ${sujet.titre} — ${r.entrees.length} votes`);
  for (const e of r.entrees) {
    const s = parId.get(idDe(e));
    console.log(`  ${s.id.padEnd(15)} ${s.date} ${String(s.decompte.votants).padStart(3)} votants  ${e.resume.slice(0, 110)}`);
  }
}
