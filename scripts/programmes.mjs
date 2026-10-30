// Chaîne de traitement des programmes (PDF ou pages web), en trois commandes :
//
//   extraire  — télécharge chaque document de sources.json, en garde une copie et son empreinte
//               (preuve de ce qui a été cité, même si le parti modifie son site), puis extrait le texte page par page.
//   pretri    — repère, pour chaque sujet, les passages qui contiennent ses mots-clés : candidats à relire.
//   verifier  — vérifie que chaque citation retenue dans extraits/<sujet>.json existe mot pour mot dans le document, à la page indiquée.
//
// Usage : node scripts/programmes.mjs <extraire|pretri|verifier> [--dossier data/programmes] [--force]

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractText, getDocumentProxy } from 'unpdf';

const args = process.argv.slice(2);
const commande = args[0];
const option = (nom, defaut) => {
  const i = args.indexOf(nom);
  return i === -1 ? defaut : args[i + 1];
};
const DOSSIER = option('--dossier', 'data/programmes');
const FORCE = args.includes('--force');

const lire = (chemin) => JSON.parse(readFileSync(chemin, 'utf8'));
const ecrire = (chemin, donnees) => writeFileSync(chemin, JSON.stringify(donnees, null, 2));

// Normalisation pour comparer des textes : apostrophes, espaces, césures de fin de ligne.
const normaliserCitation = (t) =>
  t
    .replace(/[’‘`]/g, "'")
    .replace(/[«»“”]/g, '"')
    .replace(/­/g, '')
    .replace(/(\p{L})-\s*\n\s*(\p{L})/gu, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
const normaliserRecherche = (t) => normaliserCitation(t).toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

// --- extraire ---------------------------------------------------------------------------------

async function telecharger(source) {
  if (source.fichier) return { octets: readFileSync(source.fichier), type: source.fichier.endsWith('.pdf') ? 'pdf' : 'html' };
  const res = await fetch(source.url, { headers: { 'User-Agent': 'Poliapp (comparateur citoyen, non commercial)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const octets = Buffer.from(await res.arrayBuffer());
  const type = (res.headers.get('content-type') ?? '').includes('pdf') || source.url.endsWith('.pdf') ? 'pdf' : 'html';
  return { octets, type };
}

async function pagesDuPdf(octets) {
  const pdf = await getDocumentProxy(new Uint8Array(octets));
  const { text } = await extractText(pdf, { mergePages: false });
  return text.map((texte, i) => ({ page: i + 1, texte }));
}

// Une page web n'a pas de pages : on la traite comme un seul bloc (page null).
function pagesDuHtml(octets) {
  const texte = octets
    .toString('utf8')
    .replace(/<(script|style|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|br|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&rsquo;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n');
  return [{ page: null, texte }];
}

async function extraire() {
  const sources = lire(join(DOSSIER, 'sources.json'));
  mkdirSync(join(DOSSIER, 'documents'), { recursive: true });
  mkdirSync(join(DOSSIER, 'textes'), { recursive: true });
  for (const source of sources) {
    const sortie = join(DOSSIER, 'textes', `${source.id}.json`);
    if (existsSync(sortie) && !FORCE) {
      console.log(`= ${source.id} (déjà extrait, --force pour recommencer)`);
      continue;
    }
    try {
      const { octets, type } = await telecharger(source);
      writeFileSync(join(DOSSIER, 'documents', `${source.id}.${type}`), octets);
      const pages = type === 'pdf' ? await pagesDuPdf(octets) : pagesDuHtml(octets);
      ecrire(sortie, {
        source,
        sha256: createHash('sha256').update(octets).digest('hex'),
        telechargeLe: new Date().toISOString(),
        pages,
      });
      const vides = pages.filter((p) => !p.texte.trim()).length;
      console.log(`✓ ${source.id} : ${pages.length} page(s)${vides ? `, dont ${vides} sans texte (PDF scanné ? à vérifier)` : ''}`);
    } catch (e) {
      console.error(`✗ ${source.id} : ${e.message}`);
    }
  }
}

// --- pretri -----------------------------------------------------------------------------------

const textesExtraits = () =>
  existsSync(join(DOSSIER, 'textes'))
    ? readdirSync(join(DOSSIER, 'textes'))
        .filter((f) => f.endsWith('.json'))
        .map((f) => lire(join(DOSSIER, 'textes', f)))
    : [];

// Découpe en phrases, en gardant la phrase précédente et la suivante comme contexte de lecture.
function phrases(texte) {
  return normaliserCitation(texte)
    .split(/(?<=[.!?;:])\s+(?=[\p{Lu}•\-–0-9«"])/u)
    .filter((p) => p.length > 20);
}

function pretri() {
  const sujets = lire('data/sujets.json');
  const documents = textesExtraits();
  mkdirSync(join(DOSSIER, 'candidats'), { recursive: true });
  for (const sujet of sujets) {
    const motifs = sujet.motsCles.map((m) => [m, new RegExp(`(?<![a-z])${normaliserRecherche(m).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)]);
    const passages = [];
    for (const doc of documents) {
      for (const { page, texte } of doc.pages) {
        const liste = phrases(texte);
        liste.forEach((phrase, i) => {
          const trouves = motifs.filter(([, re]) => re.test(normaliserRecherche(phrase))).map(([m]) => m);
          if (!trouves.length) return;
          passages.push({
            source: doc.source.id,
            parti: doc.source.parti,
            page,
            motsCles: trouves,
            phrase,
            contexte: [liste[i - 1], phrase, liste[i + 1]].filter(Boolean).join(' '),
          });
        });
      }
    }
    ecrire(join(DOSSIER, 'candidats', `${sujet.id}.json`), { sujet: sujet.id, genereLe: new Date().toISOString(), passages });
    const parParti = Object.entries(Object.groupBy(passages, (p) => p.parti)).map(([p, l]) => `${p} ${l.length}`);
    console.log(`${sujet.titre.padEnd(30)} ${passages.length} passages${parParti.length ? ` (${parParti.join(', ')})` : ''}`);
  }
}

// --- verifier ---------------------------------------------------------------------------------

// Le PDF coupe parfois un mot en fin de ligne sans tiret (« reval\norisé ») : en dernier recours,
// on compare sans aucune espace.
const contient = (texte, citation) =>
  normaliserCitation(texte).includes(citation) || normaliserCitation(texte).replace(/ /g, '').includes(citation.replace(/ /g, ''));

function verifier() {
  const documents = new Map(textesExtraits().map((d) => [d.source.id, d]));
  const dossierExtraits = join(DOSSIER, 'extraits');
  const fichiers = existsSync(dossierExtraits) ? readdirSync(dossierExtraits).filter((f) => f.endsWith('.json')) : [];
  let erreurs = 0;
  for (const f of fichiers) {
    for (const e of lire(join(dossierExtraits, f)).extraits) {
      const doc = documents.get(e.source);
      const citation = normaliserCitation(e.citation);
      const ici = doc?.pages.find((p) => p.page === e.page);
      let verdict;
      if (!doc) verdict = `✗ document « ${e.source} » inconnu (lancer extraire)`;
      else if (ici && contient(ici.texte, citation)) verdict = '✓';
      else {
        const ailleurs = doc.pages.find((p) => contient(p.texte, citation));
        verdict = ailleurs ? `✗ trouvée page ${ailleurs.page}, pas page ${e.page}` : '✗ introuvable dans le document';
      }
      if (verdict !== '✓') erreurs++;
      console.log(`${verdict.padEnd(3)} ${f} · ${e.source} p.${e.page ?? '–'} · « ${citation.slice(0, 70)}${citation.length > 70 ? '…' : ''} »`);
    }
  }
  console.log(erreurs ? `\n${erreurs} citation(s) à corriger.` : `\nToutes les citations sont conformes.`);
  process.exitCode = erreurs ? 1 : 0;
}

const commandes = { extraire, pretri, verifier };
if (!commandes[commande]) {
  console.error('Usage : node scripts/programmes.mjs <extraire|pretri|verifier> [--dossier …] [--force]');
  process.exit(1);
}
await commandes[commande]();
