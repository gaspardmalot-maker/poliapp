// Pré-tri des scrutins par sujet, à partir des mots-clés de data/sujets.json.
// Ce n'est qu'une aide : le rattachement définitif d'un vote à un sujet se fait à la main,
// dans data/selection/<sujet>.json, que ce script ne modifie jamais.
//
// Produit, pour chaque sujet :
//   data/candidats/<sujet>.json  — les scrutins candidats, regroupés par texte
//   docs/revue/<sujet>.md        — la même chose en version lisible, pour la relecture
//
// Usage : node scripts/pretri.mjs

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const sujets = JSON.parse(readFileSync('data/sujets.json', 'utf8'));
const { scrutins } = JSON.parse(readFileSync('data/an/scrutins.json', 'utf8'));

// Ordre de priorité pour la relecture : les votes sur l'ensemble d'un texte d'abord.
const PRIORITE = ['ensemble', 'motion', 'article', 'amendement', 'sous-amendement', 'declaration', 'autre'];

const normaliser = (t) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’`]/g, "'");

// Un mot-clé correspond au début d'un mot : « femme » trouve « femmes » mais pas « sage-femme »… ni « refermer ».
const motif = (motCle) => new RegExp(`(?<![a-z])${normaliser(motCle).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);

// Un scrutin retenu est désigné par son identifiant officiel (id), ou par son seul numéro pour la XVIIe législature.
export const idDe = (sel) => sel.id ?? `VTANR5L17V${sel.numero}`;

function selectionExistante(id) {
  const chemin = `data/selection/${id}.json`;
  if (!existsSync(chemin)) return new Set();
  return new Set(JSON.parse(readFileSync(chemin, 'utf8')).scrutins.map(idDe));
}

function pretrier(sujet) {
  const motifs = sujet.motsCles.map((m) => [m, motif(m)]);
  const dejaRetenus = selectionExistante(sujet.id);
  const parTexte = new Map();

  for (const s of scrutins) {
    // On cherche dans le titre du scrutin, qui contient le nom du texte concerné.
    const titre = normaliser(s.titre);
    const trouves = motifs.filter(([, re]) => re.test(titre)).map(([m]) => m);
    if (!trouves.length) continue;

    const cle = `${s.legislature}|${s.texte ?? '(sans texte identifié)'}`;
    const groupe = parTexte.get(cle) ?? { texte: s.texte ?? '(sans texte identifié)', legislature: s.legislature, motsCles: new Set(), scrutins: [] };
    trouves.forEach((m) => groupe.motsCles.add(m));
    groupe.scrutins.push({
      id: s.id,
      legislature: s.legislature,
      numero: s.numero,
      date: s.date,
      type: s.type,
      resultat: s.resultat,
      titre: s.titre,
      url: s.url,
      dejaRetenu: dejaRetenus.has(s.id),
    });
    parTexte.set(cle, groupe);
  }

  const textes = [...parTexte.values()]
    .map((g) => ({
      ...g,
      motsCles: [...g.motsCles],
      scrutins: g.scrutins.sort((a, b) => PRIORITE.indexOf(a.type) - PRIORITE.indexOf(b.type) || a.numero - b.numero),
    }))
    // Les textes qui ont un vote final passent en premier, puis les plus récents.
    .sort((a, b) => {
      const final = (g) => (g.scrutins.some((s) => s.type === 'ensemble') ? 0 : 1);
      const recent = (g) => g.scrutins.reduce((d, s) => (s.date > d ? s.date : d), '');
      return final(a) - final(b) || recent(b).localeCompare(recent(a));
    });

  return { sujet: sujet.id, titre: sujet.titre, genereLe: new Date().toISOString(), textes };
}

function enMarkdown({ titre, textes }) {
  const lignes = [
    `# Revue : ${titre}`,
    '',
    `Scrutins trouvés par mots-clés, regroupés par texte. **À relire** : un mot-clé peut correspondre à un texte hors sujet,`,
    `et beaucoup d'amendements pertinents n'apparaissent pas ici car leur titre ne mentionne que le nom du texte.`,
    '',
    `Pour retenir un scrutin, ajoute son numéro dans \`data/selection/<sujet>.json\` avec une phrase de contexte.`,
    '',
  ];
  for (const t of textes) {
    const parType = Object.entries(Object.groupBy(t.scrutins, (s) => s.type))
      .map(([type, l]) => `${l.length} ${type}`)
      .join(', ');
    lignes.push(`## ${t.texte}`, '', `Mots-clés : ${t.motsCles.join(', ')} — ${parType}`, '');
    for (const s of t.scrutins.filter((s) => ['ensemble', 'motion', 'article'].includes(s.type)).slice(0, 8)) {
      const coche = s.dejaRetenu ? '[x]' : '[ ]';
      lignes.push(`- ${coche} [n°${s.numero}](${s.url}) — ${s.date} — ${s.type}, ${s.resultat} — ${s.titre}`);
    }
    lignes.push('');
  }
  return lignes.join('\n');
}

mkdirSync('data/candidats', { recursive: true });
mkdirSync('docs/revue', { recursive: true });
for (const sujet of sujets) {
  const resultat = pretrier(sujet);
  writeFileSync(`data/candidats/${sujet.id}.json`, JSON.stringify(resultat, null, 2));
  writeFileSync(`docs/revue/${sujet.id}.md`, enMarkdown(resultat));
  const nb = resultat.textes.reduce((n, t) => n + t.scrutins.length, 0);
  const finaux = resultat.textes.filter((t) => t.scrutins.some((s) => s.type === 'ensemble')).length;
  console.log(`${sujet.titre.padEnd(30)} ${String(resultat.textes.length).padStart(3)} textes (${finaux} avec vote final), ${nb} scrutins`);
}
