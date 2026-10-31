// Génère la maquette du site à partir des vraies données :
//   maquette/index.html       — accueil : recherche et liste de tous les sujets
//   maquette/<sujet>.html     — une page par sujet ayant une sélection de votes (data/selection/<sujet>.json)
//
// Sources : data/sujets.json, data/an/*.json, data/selection/, data/explications/ (orateurs, liens, vidéos),
// data/programmes/ (citations de programmes), data/logos/ (facultatif).
//
// Usage : node scripts/maquette.mjs

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PAGES, SIGNALER } from './pages.mjs';

// Lecture des vidéos dans la page : désactivée tant que l'Assemblée nationale n'a pas donné son accord
// (ses conditions interdisent de reproduire ses ressources multimédias sans accord préalable).
// Sans accord, « Voir la vidéo » ouvre le compte rendu officiel au moment de l'intervention.
const VIDEO_INTEGREE = true;

const lire = (chemin) => JSON.parse(readFileSync(chemin, 'utf8'));
const lireSiExiste = (chemin, defaut) => (existsSync(chemin) ? lire(chemin) : defaut);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const dateFr = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const json = (d) => JSON.stringify(d).replace(/</g, '\\u003c');

const sujets = lire('data/sujets.json');
const idDe = (sel) => sel.id ?? `VTANR5L17V${sel.numero}`;
const { groupes: tousGroupes, meta } = lire('data/an/groupes.json');
const { scrutins } = lire('data/an/scrutins.json');
const parId = new Map(scrutins.map((s) => [s.id, s]));
const sourcesProgrammes = lireSiExiste('data/programmes/sources.json', []);

// Logos : copiés une fois dans maquette/logos/ et partagés par toutes les pages.
const TYPES_IMAGE = ['svg', 'png', 'webp'];
mkdirSync('maquette/logos', { recursive: true });
// Les groupes 2022-2024 reprennent le logo du parti de leur successeur.
const ALIAS_LOGO = { 'LFI-NUPES': 'LFI-NFP', 'GDR-NUPES': 'GDR', 'Ecolo-NUPES': 'EcoS', RE: 'EPR', LR: 'DR' };
function logo(sigle) {
  for (const ext of TYPES_IMAGE) {
    const fichier = `${ALIAS_LOGO[sigle] ?? sigle}.${ext}`;
    if (!existsSync(`data/logos/${fichier}`)) continue;
    copyFileSync(`data/logos/${fichier}`, `maquette/logos/${fichier}`);
    return `logos/${fichier}`;
  }
  return null;
}
const groupesAvecLogo = tousGroupes.map((g) => ({ sigle: g.sigle, nom: g.nom, logo: logo(g.sigle) }));

// --- Données d'un sujet ------------------------------------------------------------------------

function donneesSujet(sujet) {
  const selection = lire(`data/selection/${sujet.id}.json`);
  const debats = lireSiExiste(`data/explications/${sujet.id}.json`, { scrutins: [] });
  const extraits = lireSiExiste(`data/programmes/extraits/${sujet.id}.json`, { extraits: [] }).extraits;

  const votes = selection.scrutins.map((sel) => {
    const s = parId.get(idDe(sel));
    const interventions = debats.scrutins.find((d) => d.id === s.id)?.interventions ?? {};
    const explications = Object.fromEntries(
      Object.entries(sel.explications ?? {}).map(([sigle, e]) => {
        const i = (interventions[sigle] ?? []).find((i) => i.ancre === e.ancre);
        return [sigle, { citations: e.citations, annonce: e.annonce, remarque: e.remarque, statut: e.statut, orateur: i?.orateur, date: i?.date, url: i?.url, video: i?.video ?? null }];
      }).filter(([, e]) => e.url || e.remarque),
    );
    return {
      cle: s.id,
      numero: s.numero,
      legislature: s.legislature,
      congres: s.id.startsWith('VTCG'),
      motion: /^motion de (rejet|censure)/i.test(sel.resume) || /^(la |sur la )?motion de (rejet|censure)/i.test(s.titre) ? (/censure/i.test(s.titre) ? 'censure' : 'rejet') : null,
      lecture: sel.lecture ?? null,
      resume: sel.resume,
      statut: sel.statut,
      date: s.date,
      titre: s.titre,
      resolution: /résolution/i.test(s.titre),
      resultat: s.resultat,
      decompte: s.decompte,
      url: s.url,
      groupes: s.groupes,
      explications,
    };
  });

  const groupes = groupesAvecLogo.filter((g) => votes.some((v) => v.groupes[g.sigle]));
  const programmes = sourcesProgrammes
    .map((src) => ({ ...src, sigles: src.groupe.split(/,\s*/), extraits: extraits.filter((e) => e.source === src.id) }))
    .filter((p) => p.extraits.length || extraits.length);
  const couverts = new Set(programmes.flatMap((p) => p.sigles));
  const sansProgramme = groupes.filter((g) => g.sigle !== 'NI' && !couverts.has(g.sigle)).map((g) => g.sigle);
  return { votes, groupes, programmes, sansProgramme, nbExtraits: extraits.length };
}

const pages = sujets
  .filter((s) => existsSync(`data/selection/${s.id}.json`))
  .map((s) => ({ sujet: s, ...donneesSujet(s) }))
  .filter((p) => p.votes.length);

// --- Gabarit commun ----------------------------------------------------------------------------

const CSS = `
:root {
  --fond: #f6f7f9; --carte: #ffffff; --texte: #1b1f24; --discret: #667085; --bord: #e6e8ec; --survol: #f1f4f8;
  --accent: #2f6fde; --pour: #2f6fde; --contre: #ee8434; --abstention: #a6acb8; --partage: #8b6fd6; --absent: #e4e7ec;
  --adopte: #1f8a5b; --rejete: #c2410c; --citation: #f4f6fa;
  color-scheme: light;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: 72px; }
body { margin: 0; background: var(--fond); color: var(--texte); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif; -webkit-font-smoothing: antialiased; }
a { color: var(--accent); }
button { font: inherit; }
[hidden] { display: none !important; }
.contenu { max-width: 1160px; margin: 0 auto; padding: 0 20px; }
.discret { color: var(--discret); font-size: 13px; }
.brouillon { background: #fff4db; color: #8a5a00; border-radius: 999px; padding: 1px 8px; font-weight: 500; font-size: 12px; white-space: nowrap; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

header.site { position: sticky; top: 0; z-index: 20; background: rgba(255,255,255,.94); backdrop-filter: blur(8px); border-bottom: 1px solid var(--bord); }
header.site .contenu { display: flex; align-items: center; gap: 20px; height: 60px; }
.marque { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 18px; text-decoration: none; color: var(--texte); flex-shrink: 0; }
.marque svg { width: 30px; }
.recherche-entete { margin-left: auto; width: min(340px, 100%); }
.champ { width: 100%; padding: 9px 14px; border: 1px solid var(--bord); border-radius: 999px; background: var(--fond); font: inherit; font-size: 15px; color: var(--texte); }
.champ:focus { outline: 2px solid var(--accent); outline-offset: 0; border-color: transparent; background: #fff; }

.cadre-logo { display: inline-grid; place-items: center; width: 56px; height: 34px; border-radius: 8px; background: #fff; border: 1px solid var(--bord); overflow: hidden; flex-shrink: 0; }
.cadre-logo img { width: 100%; height: 100%; object-fit: contain; padding: 4px; }
.sigle-logo { font-size: 11px; font-weight: 700; color: #3b4452; letter-spacing: -0.02em; }
.cadre-logo.petit { width: 44px; height: 26px; border-radius: 6px; }
.cadre-logo.petit img { padding: 3px; }
.cadre-logo.petit .sigle-logo { font-size: 9.5px; }

.badge { font-size: 12px; font-weight: 600; text-align: center; border-radius: 999px; padding: 3px 10px; color: #fff; white-space: nowrap; }
.b-pour { background: var(--pour); } .b-contre { background: var(--contre); } .b-abstention { background: var(--abstention); }
.b-partage { background: var(--partage); } .b-null { background: var(--absent); color: var(--discret); }
.res { font-size: 12px; font-weight: 600; border-radius: 999px; padding: 2px 10px; white-space: nowrap; }
.res-adopté { color: var(--adopte); background: #e7f5ee; }
.res-rejeté { color: var(--rejete); background: #fdeee4; }

footer { margin: 64px 0 0; padding: 24px 0 48px; border-top: 1px solid var(--bord); font-size: 13px; color: var(--discret); background: var(--carte); }
.liens-pied { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-bottom: 10px; font-weight: 500; }
.liens-pied a { color: var(--texte); text-decoration: none; }
.liens-pied a:hover { color: var(--accent); }
.bandeau-test { background: #fff4db; color: #6b4a00; font-size: 13px; text-align: center; padding: 7px 16px; }
.bandeau-test a { color: inherit; font-weight: 600; }
.page-texte { max-width: 760px; padding-top: 32px; }
.page-texte h1 { font-size: clamp(28px, 4.5vw, 40px); letter-spacing: -0.02em; margin: 0 0 16px; }
.page-texte h2 { font-size: 19px; margin: 32px 0 8px; }
.page-texte p, .page-texte li { font-size: 15.5px; line-height: 1.65; color: #2b3138; }
.page-texte .chapeau { font-size: 18px; color: var(--texte); }
.page-texte ul { padding-left: 20px; }
@media (max-width: 560px) {
  .contenu { padding: 0 16px; }
  .marque span { display: none; }
}
`;

const MARQUE = `<a class="marque" href="index.html">
  <svg viewBox="0 0 32 18" aria-hidden="true"><path d="M2 17a14 14 0 0 1 28 0" fill="none" stroke="var(--pour)" stroke-width="3" stroke-linecap="round"/><path d="M9 17a7 7 0 0 1 14 0" fill="none" stroke="var(--contre)" stroke-width="3" stroke-linecap="round"/></svg>
  <span>Poliapp</span>
</a>`;

const PIED = `<footer><div class="contenu">
  <nav class="liens-pied"><a href="methodologie.html">Méthodologie</a><a href="sources.html">Sources et licences</a><a href="mentions-legales.html">Mentions légales</a><a href="confidentialite.html">Données personnelles</a><a href="${SIGNALER}" target="_blank" rel="noopener">Signaler une erreur</a></nav>
  <p>Données : Assemblée nationale, open data (${esc(meta.licence)}), récupérées le ${dateFr(meta.recupereLe)}. Programmes : documents officiels des partis. Toutes les citations sont reprises mot pour mot. Site indépendant, sans publicité, sans lien avec un parti.</p>
</div></footer>`;

// Bandeau affiché tant que le contenu n'a pas été entièrement relu.
const BANDEAU = `<div class="bandeau-test">Version de test : une partie des sélections et des citations est automatique et en cours de relecture. <a href="methodologie.html">En savoir plus</a></div>`;

function document_({ titre, corps, css = '', script = '' }) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titre)}</title>
<style>${CSS}${css}</style>
</head>
<body>
${BANDEAU}
${corps}
${PIED}
${script}
</body>
</html>`;
}

// --- Hémicycle (partagé entre la génération et le navigateur) -----------------------------------

// Rangées concentriques, nombre de sièges proportionnel au rayon de chaque rangée, sièges triés de
// gauche à droite : on les attribue ensuite aux groupes dans l'ordre de l'hémicycle.
// Fonction autonome : elle est aussi injectée telle quelle dans les pages via toString().
function dispositionHemicycle(n) {
  const cache = (dispositionHemicycle.cache ??= new Map());
  if (cache.has(n)) return cache.get(n);
  const rangees = n > 400 ? 12 : n > 200 ? 9 : 6;
  const r0 = 0.38;
  const rayons = Array.from({ length: rangees }, (_, i) => r0 + ((1 - r0) * i) / (rangees - 1));
  const somme = rayons.reduce((a, b) => a + b, 0);
  const parRangee = rayons.map((r) => Math.floor((n * r) / somme));
  for (let i = rangees - 1, reste = n - parRangee.reduce((a, b) => a + b, 0); reste > 0; reste--, i = (i - 1 + rangees) % rangees) parRangee[i]++;
  const sieges = [];
  rayons.forEach((r, i) => {
    const k = parRangee[i];
    for (let j = 0; j < k; j++) {
      const angle = Math.PI * (1 - (k === 1 ? 0.5 : j / (k - 1)));
      sieges.push({ angle, r, x: r * Math.cos(angle), y: -r * Math.sin(angle) });
    }
  });
  sieges.sort((a, b) => b.angle - a.angle || a.r - b.r);
  const resultat = { sieges, rayon: (((1 - r0) / (rangees - 1)) * 0.4).toFixed(4) };
  cache.set(n, resultat);
  return resultat;
}

// Version statique (sans étiquettes ni interaction), pour l'accueil.
function miniHemicycle(vote, ordre) {
  const presents = ordre.filter((g) => vote.groupes[g.sigle]);
  const total = presents.reduce((n, g) => n + vote.groupes[g.sigle].membres, 0);
  const { sieges, rayon } = dispositionHemicycle(total);
  // Format compact (une page d'accueil en affiche des dizaines) : points regroupés par position,
  // coordonnées courtes. Le rayon est un attribut : Safari (iPhone) ignore la propriété CSS « r ».
  const court = (n) => n.toFixed(3).replace(/^(-?)0\./, '$1.');
  const parPosition = { pour: [], contre: [], abstention: [], null: [] };
  let i = 0;
  for (const g of presents) {
    const r = vote.groupes[g.sigle];
    const absents = Math.max(r.membres - r.pour - r.contre - r.abstention, 0);
    for (const [pos, nb] of [['pour', r.pour], ['contre', r.contre], ['abstention', r.abstention], ['null', absents]]) {
      for (let k = 0; k < nb && i < sieges.length; k++, i++) parPosition[pos].push(`<circle cx="${court(sieges[i].x)}" cy="${court(sieges[i].y)}" r="${rayon}"/>`);
    }
  }
  const groupes = Object.entries(parPosition).map(([pos, c]) => `<g class="s-${pos}">${c.join('')}</g>`).join('');
  return `<svg class="mini-hemi" viewBox="-1.04 -1.04 2.08 1.08" aria-hidden="true">${groupes}</svg>`;
}

// --- Page sujet --------------------------------------------------------------------------------

// Code exécuté dans le navigateur, injecté tel quel via toString().
function appSujet(DATA) {
  const POSITIONS = { pour: 'Pour', contre: 'Contre', abstention: 'Abstention', partage: 'Partagé', null: "N'a pas voté" };
  const SVG = 'http://www.w3.org/2000/svg';
  const $ = (sel, racine = document) => racine.querySelector(sel);
  const $$ = (sel, racine = document) => [...racine.querySelectorAll(sel)];
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const dateFr = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const dateCourte = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  const normaliser = (t) => t.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const groupe = (sigle) => DATA.groupes.find((g) => g.sigle === sigle);
  const logoHtml = (g, taille = '') =>
    `<span class="cadre-logo ${taille}" aria-hidden="true">${g.logo ? `<img src="${g.logo}" alt="">` : `<span class="sigle-logo">${esc(g.sigle)}</span>`}</span>`;

  const disposition = dispositionHemicycle;
  const element = (tag, attrs = {}, texte) => {
    const e = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (texte) e.textContent = texte;
    return e;
  };
  function hemicycle(vote) {
    const presents = DATA.groupes.filter((g) => vote.groupes[g.sigle]);
    const total = presents.reduce((n, g) => n + vote.groupes[g.sigle].membres, 0);
    const { sieges, rayon } = disposition(total);
    const svg = element('svg', { viewBox: '-1.3 -1.2 2.6 1.26', role: 'img', 'aria-label': `Hémicycle : ${vote.decompte.pour} pour, ${vote.decompte.contre} contre, ${vote.decompte.abstention} abstentions` });
    let i = 0;
    for (const g of presents) {
      const r = vote.groupes[g.sigle];
      const portion = sieges.slice(i, i + r.membres);
      if (portion.length) {
        const milieu = (portion[0].angle + portion.at(-1).angle) / 2;
        const deg = (milieu * 180) / Math.PI;
        const gauche = deg > 90;
        const [x, y] = [(1.05 * Math.cos(milieu)).toFixed(4), (-1.05 * Math.sin(milieu)).toFixed(4)];
        const t = element('text', { x, y, transform: `rotate(${gauche ? 180 - deg : -deg} ${x} ${y})`, 'text-anchor': gauche ? 'end' : 'start', 'dominant-baseline': 'central', class: 'etiquette' }, g.sigle);
        t.dataset.groupe = g.sigle;
        svg.appendChild(t);
      }
      const nonVotants = Math.max(r.membres - r.pour - r.contre - r.abstention, 0);
      for (const [pos, nb] of [['pour', r.pour], ['contre', r.contre], ['abstention', r.abstention], ['null', nonVotants]]) {
        for (let k = 0; k < nb && i < sieges.length; k++, i++) {
          const c = element('circle', { cx: sieges[i].x.toFixed(4), cy: sieges[i].y.toFixed(4), r: rayon, class: `siege s-${pos}` });
          c.dataset.groupe = g.sigle;
          svg.appendChild(c);
        }
      }
    }
    svg.appendChild(element('text', { x: 0, y: -0.1, class: `centre res-${vote.resultat}` }, vote.resultat === 'adopté' ? 'Adopté' : 'Rejeté'));
    svg.appendChild(element('text', { x: 0, y: 0, class: 'centre-detail' }, `${vote.decompte.votants} votants`));
    svg.addEventListener('mouseover', (e) => e.target.dataset?.groupe && surligner(e.target.dataset.groupe));
    svg.addEventListener('mouseleave', () => surligner(null));
    return svg;
  }
  function surligner(sigle) {
    $$('#panneau .siege, #panneau .etiquette').forEach((c) => c.classList.toggle('estompe', !!sigle && c.dataset.groupe !== sigle));
    $$('#panneau .ligne-groupe').forEach((l) => l.classList.toggle('actif', l.dataset.groupe === sigle));
  }

  // --- Lecteur vidéo : flux HLS officiel de la séance, ouvert au moment de l'intervention.
  let hls = null;
  let chargementHls = null;
  const chargerHls = () =>
    (chargementHls ??= new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = 'vendor/hls.min.js'; // hls.js 1.5.13 (Apache 2.0), servi par le site
      s.onload = () => ok(window.Hls);
      s.onerror = ko;
      document.head.appendChild(s);
    }));
  async function lireVideo({ flux, debut, titre, source }) {
    const dialogue = $('#lecteur');
    const video = $('#lecteur video');
    $('#lecteur-titre').textContent = titre;
    $('#lecteur-source').href = source;
    $('#lecteur-erreur').hidden = true;
    dialogue.showModal();
    const erreur = () => ($('#lecteur-erreur').hidden = false);
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = flux;
      video.addEventListener('loadedmetadata', () => { video.currentTime = debut; video.play().catch(() => {}); }, { once: true });
      video.addEventListener('error', erreur, { once: true });
      return;
    }
    try {
      const Hls = await chargerHls();
      hls = new Hls({ startPosition: debut });
      hls.on(Hls.Events.ERROR, (_, d) => d.fatal && erreur());
      hls.loadSource(flux);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    } catch {
      erreur();
    }
  }
  $('#lecteur').addEventListener('close', () => {
    const video = $('#lecteur video');
    video.pause();
    hls?.destroy();
    hls = null;
    video.removeAttribute('src');
    video.load();
  });
  $('#lecteur-fermer').addEventListener('click', () => $('#lecteur').close());
  $('#lecteur').addEventListener('click', (e) => e.target === e.currentTarget && $('#lecteur').close());

  // --- Panneau d'un vote.
  function explicationHtml(ex, sigle) {
    if (!ex) return sigle === 'NI' ? '' : `<p class="pas-explication">Pas d'explication de vote relevée dans les débats.</p>`;
    const annonce = ex.annonce ? `<p class="annonce">Annonce du vote : « ${esc(ex.annonce)} »</p>` : '';
    if (!ex.citations.length) return `<p class="pas-explication">${esc(ex.remarque)} <a href="${ex.url}" target="_blank" rel="noopener">Voir l'intervention</a></p>${annonce}`;
    return `
      <div class="explication" data-ouvert="false">
        <blockquote>${ex.citations.map((c) => `« ${esc(c)} »`).join(' <span class="coupe">[…]</span> ')}</blockquote>
        ${annonce}
        <div class="actions">
          ${
            ex.video
              ? DATA.videoIntegree
                ? `<button class="action video" data-groupe="${esc(sigle)}"><span aria-hidden="true">▶</span> Voir en vidéo</button>`
                : `<a class="action video" href="${ex.url}" target="_blank" rel="noopener" title="Ouvre le compte rendu officiel à ce passage : la vidéo se lance avec le bouton ▶ à côté du nom de l'orateur"><span aria-hidden="true">▶</span> Vidéo sur le site de l'Assemblée</a><span class="aide-video">Sur la page de l'Assemblée, touchez ▶ à côté du nom de l'orateur.</span>`
              : ''
          }
          <button class="action lire">Lire tout</button>
          <a class="action" href="${ex.url}" target="_blank" rel="noopener">Source ↗</a>
          <span class="qui">${esc(ex.orateur ?? '')}${ex.statut === 'auto' ? ' · <span class="brouillon">extrait automatique</span>' : ex.statut === 'brouillon' ? ' · <span class="brouillon">à valider</span>' : ''}</span>
        </div>
      </div>`;
  }
  function ligneGroupe(vote, g) {
    const r = vote.groupes[g.sigle];
    if (!r) return '';
    const votants = r.pour + r.contre + r.abstention;
    const detail = [r.pour && `${r.pour} pour`, r.contre && `${r.contre} contre`, r.abstention && `${r.abstention} abst.`].filter(Boolean).join(' · ') || 'aucun votant';
    return `
      <li class="ligne-groupe" data-groupe="${esc(g.sigle)}">
        <div class="ligne-haut">
          ${logoHtml(g)}
          <span class="nom-groupe"><strong>${esc(g.sigle)}</strong><small>${detail} — ${votants} votants sur ${r.membres}</small></span>
          <span class="badge b-${r.position}">${vote.motion === 'censure' && !r.position ? 'Ne vote pas la censure' : POSITIONS[r.position]}</span>
        </div>
        ${explicationHtml(vote.explications[g.sigle], g.sigle)}
      </li>`;
  }

  let courant = null;
  function afficher(cle, { defiler = false } = {}) {
    const index = Math.max(DATA.votes.findIndex((v) => v.cle === cle), 0);
    const vote = DATA.votes[index];
    courant = vote;
    $$('.choix-vote').forEach((b) => b.setAttribute('aria-current', String(b.dataset.cle === vote.cle)));
    $('.choix-vote[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
    $('#panneau-entete').innerHTML = `
      <p class="meta">${dateFr(vote.date)} · ${vote.congres ? 'Congrès du Parlement' : vote.motion ? 'Motion' : vote.resolution ? 'Résolution' : 'Loi'}${vote.lecture ? ` · ${esc(vote.lecture)}` : ''} · <span class="res res-${vote.resultat}">${vote.resultat === 'adopté' ? 'Adopté' : 'Rejeté'}</span>${vote.statut === 'auto' ? ' · <span class="brouillon">sélection automatique</span>' : vote.statut === 'brouillon' ? ' · <span class="brouillon">à valider</span>' : ''}</p>
      <h3>${esc(vote.resume)}</h3>
      ${vote.motion ? `<p class="aide-motion">${vote.motion === 'censure' ? 'Voter <b>pour</b> cette motion, c’est vouloir renverser le gouvernement. Seuls les votes pour sont comptés : il faut la majorité absolue des membres de l’Assemblée (289 si tous les sièges sont pourvus).' : 'Voter <b>pour</b> cette motion, c’est rejeter le texte sans l’examiner.'}</p>` : ''}`;
    $('#hemicycle').replaceChildren(hemicycle(vote));
    $('#totaux').innerHTML = `
      <span><i class="pastille s-pour"></i><strong>${vote.decompte.pour}</strong> pour</span>
      <span><i class="pastille s-contre"></i><strong>${vote.decompte.contre}</strong> contre</span>
      <span><i class="pastille s-abstention"></i><strong>${vote.decompte.abstention}</strong> abstention${vote.decompte.abstention > 1 ? 's' : ''}</span>
      <span><i class="pastille s-null"></i>absents</span>`;
    $('#liste-groupes').innerHTML = DATA.groupes.map((g) => ligneGroupe(vote, g)).join('');
    $('#lien-officiel').href = vote.url;
    $('#precedent').disabled = index === 0;
    $('#suivant').disabled = index === DATA.votes.length - 1;
    $('#position-vote').textContent = `${index + 1} / ${DATA.votes.length}`;
    $$('.ligne-groupe').forEach((l) => {
      l.addEventListener('mouseenter', () => surligner(l.dataset.groupe));
      l.addEventListener('mouseleave', () => surligner(null));
    });
    $$('#liste-groupes .lire').forEach((b) =>
      b.addEventListener('click', () => {
        const bloc = b.closest('.explication');
        const ouvert = bloc.dataset.ouvert !== 'true';
        bloc.dataset.ouvert = String(ouvert);
        b.textContent = ouvert ? 'Réduire' : 'Lire tout';
      }),
    );
    $$('#liste-groupes .video').forEach((b) =>
      b.addEventListener('click', () => {
        const ex = courant.explications[b.dataset.groupe];
        lireVideo({ ...ex.video, titre: `${ex.orateur} (${b.dataset.groupe}) — ${dateFr(ex.date)}`, source: ex.url });
      }),
    );
    history.replaceState(null, '', `#vote-${vote.cle}`);
    if (defiler) $('#panneau').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // --- Liste des votes.
  $('#liste-votes').innerHTML = DATA.votes
    .map(
      (v) => `
      <button class="choix-vote" data-cle="${v.cle}" data-texte="${esc(normaliser(v.resume + ' ' + v.titre))}" aria-current="false">
        <span class="meta">${dateCourte(v.date)}${v.legislature === 16 ? ' · <span class="leg">2022-2024</span>' : ''}</span>
        <span class="resume">${esc(v.resume)}</span>
        <span class="apercu">${DATA.groupes
          .filter((g) => v.groupes[g.sigle])
          .map((g) => `<i class="mini b-${v.groupes[g.sigle] ? v.groupes[g.sigle].position : 'absent'}" title="${esc(g.sigle)} : ${v.groupes[g.sigle] ? POSITIONS[v.groupes[g.sigle].position] : '—'}"></i>`)
          .join('')}</span>
      </button>`,
    )
    .join('');
  $$('.choix-vote').forEach((b) => b.addEventListener('click', () => afficher(b.dataset.cle, { defiler: window.matchMedia('(max-width: 900px)').matches })));
  $('#filtre').addEventListener('input', (e) => {
    const q = normaliser(e.target.value.trim());
    let visibles = 0;
    $$('.choix-vote').forEach((b) => {
      b.hidden = !!q && !b.dataset.texte.includes(q);
      visibles += !b.hidden;
    });
    $('#aucun-resultat').hidden = visibles > 0;
  });
  $('#precedent').addEventListener('click', () => afficher(DATA.votes[DATA.votes.indexOf(courant) - 1].cle));
  $('#suivant').addEventListener('click', () => afficher(DATA.votes[DATA.votes.indexOf(courant) + 1].cle));
  $$('[data-logo]').forEach((el) => {
    const g = groupe(el.dataset.logo);
    if (g) el.outerHTML = logoHtml(g, 'petit');
  });

  // Anciens liens « #vote-3061 » : numéro seul = XVIIe législature.
  const ancre = (location.hash.match(/vote-(\w+)/) ?? [])[1];
  afficher(/^\d+$/.test(ancre ?? '') ? `VTANR5L17V${ancre}` : ancre ?? DATA.votes[0].cle);
}

const CSS_SUJET = `
.entete-sujet { background: var(--carte); border-bottom: 1px solid var(--bord); padding: 32px 0 0; }
.fil { color: var(--discret); font-size: 14px; margin: 0 0 6px; }
.fil a { color: inherit; text-decoration: none; }
.fil a:hover { color: var(--accent); }
h1 { font-size: clamp(30px, 5vw, 44px); line-height: 1.1; letter-spacing: -0.025em; margin: 0 0 12px; }
.contexte { font-size: 17px; max-width: 760px; margin: 0; color: #3b4452; }
.onglets { display: flex; gap: 24px; margin-top: 24px; }
.onglets a { padding: 0 0 12px; text-decoration: none; color: var(--discret); font-weight: 600; border-bottom: 2px solid transparent; }
.onglets a:hover { color: var(--texte); }
.onglets a.actif { color: var(--texte); border-color: var(--texte); }
.onglets span { font-weight: 500; color: var(--discret); margin-left: 4px; }

section { padding-top: 32px; }
h2 { font-size: 24px; letter-spacing: -0.015em; margin: 0 0 16px; }

.disposition { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 24px; align-items: start; }
.colonne-liste { position: sticky; top: 76px; max-height: calc(100vh - 92px); display: flex; flex-direction: column; gap: 10px; min-width: 0; }
#liste-votes { overflow-y: auto; display: grid; gap: 8px; padding: 2px 4px 8px 2px; }
.choix-vote { all: unset; box-sizing: border-box; cursor: pointer; display: grid; gap: 6px; background: var(--carte); border: 1px solid var(--bord); border-radius: 12px; padding: 12px 14px; transition: border-color .15s, box-shadow .15s; }
.choix-vote:hover { border-color: #c9d3e3; }
.choix-vote:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.choix-vote[aria-current="true"] { border-color: var(--accent); box-shadow: 0 0 0 3px #2f6fde1f; }
.choix-vote .meta { font-size: 12px; color: var(--discret); }
.leg { background: var(--survol); border-radius: 999px; padding: 0 6px; }
.choix-vote .resume { font-size: 14.5px; font-weight: 500; line-height: 1.4; }
.apercu { display: inline-flex; gap: 2px; }
.mini { display: block; width: 9px; height: 9px; border-radius: 50%; }
.mini.b-absent { background: transparent; border: 1px dashed var(--bord); }
#aucun-resultat { font-size: 14px; color: var(--discret); margin: 0; }

.panneau { background: var(--carte); border: 1px solid var(--bord); border-radius: 16px; padding: 24px; scroll-margin-top: 72px; }
.navigation-vote { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
.btn { all: unset; cursor: pointer; padding: 6px 12px; border: 1px solid var(--bord); border-radius: 999px; font-size: 13px; font-weight: 500; background: var(--carte); }
.btn:hover:not(:disabled) { background: var(--survol); }
.btn:disabled { opacity: .35; cursor: default; }
.btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
#position-vote { font-size: 13px; color: var(--discret); }
.panneau .meta { font-size: 13px; color: var(--discret); margin: 0; }
.aide-motion { margin: 8px 0 0; font-size: 13.5px; background: #fff4db; color: #6b4a00; border-radius: 8px; padding: 6px 10px; display: inline-block; }
.panneau h3 { font-size: 22px; line-height: 1.3; letter-spacing: -0.01em; margin: 8px 0 0; }
#hemicycle { margin: 4px auto 0; max-width: 540px; }
#hemicycle svg { display: block; width: 100%; height: auto; }
.siege, .etiquette { transition: opacity .15s; }
.estompe { opacity: 0.15; }
.etiquette { font: 600 0.05px system-ui, sans-serif; fill: var(--discret); }
.s-pour { fill: var(--pour); background: var(--pour); } .s-contre { fill: var(--contre); background: var(--contre); }
.s-abstention { fill: var(--abstention); background: var(--abstention); } .s-null { fill: var(--absent); background: var(--absent); }
.centre { font: 700 0.15px system-ui, sans-serif; text-anchor: middle; }
.centre.res-adopté { fill: var(--adopte); } .centre.res-rejeté { fill: var(--rejete); }
.centre-detail { font: 500 0.065px system-ui, sans-serif; fill: var(--discret); text-anchor: middle; }
.totaux { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 18px; font-size: 14px; margin: 6px 0 20px; }
.totaux span { display: inline-flex; align-items: center; gap: 6px; }
.pastille { display: inline-block; width: 11px; height: 11px; border-radius: 50%; }

.titre-groupes { font-size: 15px; margin: 0; padding-bottom: 10px; border-bottom: 1px solid var(--bord); }
ul.groupes { list-style: none; margin: 0; padding: 0; }
.ligne-groupe { padding: 14px 6px; border-bottom: 1px solid var(--bord); display: grid; gap: 10px; border-radius: 8px; }
.ligne-groupe.actif { background: var(--survol); }
.ligne-haut { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; align-items: center; gap: 12px; }
.nom-groupe { display: grid; min-width: 0; line-height: 1.35; }
.nom-groupe strong { font-size: 15px; }
.nom-groupe small { font-size: 12.5px; color: var(--discret); }
.explication { margin-left: 68px; background: var(--citation); border-radius: 10px; padding: 12px 14px; }
.explication blockquote { margin: 0; font-size: 15px; line-height: 1.6; }
.explication[data-ouvert="false"] blockquote { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.explication .coupe { color: var(--discret); }
.aide-video { flex-basis: 100%; font-size: 12px; color: var(--discret); }
.annonce { margin: 6px 0 0; font-size: 13px; color: var(--discret); }
.pas-explication + .annonce { margin-left: 68px; }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; margin-top: 8px; font-size: 13px; }
.action { all: unset; cursor: pointer; color: var(--accent); font-weight: 500; }
.action:hover { text-decoration: underline; }
.action:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.action.video { background: var(--texte); color: #fff; border-radius: 999px; padding: 4px 12px; }
.action.video:hover { text-decoration: none; opacity: .9; }
.qui { color: var(--discret); margin-left: auto; }
.pas-explication { margin: 0 0 0 68px; font-size: 13px; color: var(--discret); font-style: italic; }
.note-lecture { font-size: 12.5px; color: var(--discret); margin: 16px 0 0; }

.programmes { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }
.programme { background: var(--carte); border: 1px solid var(--bord); border-radius: 16px; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
.entete-prog { display: flex; align-items: center; gap: 12px; }
.logos-prog { display: flex; gap: 4px; flex-wrap: wrap; max-width: 96px; }
.entete-prog h3 { margin: 0; font-size: 17px; line-height: 1.3; }
.entete-prog p { margin: 2px 0 0; font-size: 12.5px; color: var(--discret); }
.propositions { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.propositions li { background: var(--citation); border-radius: 10px; padding: 10px 12px; font-size: 15px; line-height: 1.5; }
.propositions q { quotes: "« " " »"; }
.propositions a { font-size: 12px; white-space: nowrap; margin-left: 4px; }
.programme .ref { margin: auto 0 0; font-size: 12.5px; color: var(--discret); }
.avertissement { font-size: 14px; color: #3b4452; background: var(--carte); border: 1px solid var(--bord); border-left: 4px solid var(--partage); border-radius: 12px; padding: 12px 16px; margin: 0 0 16px; }
.manquants { margin-top: 16px; font-size: 14px; color: var(--discret); display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }

dialog#lecteur { width: min(860px, 94vw); padding: 0; border: none; border-radius: 16px; background: #000; color: #fff; }
dialog#lecteur::backdrop { background: rgba(10, 14, 20, .75); }
.lecteur-entete { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: #14171c; font-size: 14px; }
.lecteur-entete strong { flex: 1; font-weight: 600; }
.lecteur-entete a { color: #9fc0ff; font-size: 13px; }
#lecteur-fermer { all: unset; cursor: pointer; font-size: 22px; line-height: 1; padding: 0 4px; }
dialog#lecteur video { display: block; width: 100%; aspect-ratio: 16 / 9; background: #000; }
#lecteur-erreur { padding: 10px 16px; margin: 0; background: #14171c; font-size: 13px; }
#lecteur-erreur a { color: #9fc0ff; }

@media (max-width: 900px) {
  .disposition { grid-template-columns: minmax(0, 1fr); }
  .colonne-liste { position: static; max-height: none; }
  #liste-votes { grid-auto-flow: column; grid-auto-columns: 78%; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; padding-bottom: 10px; }
  .choix-vote { scroll-snap-align: start; }
  .panneau { padding: 18px; }
}
@media (max-width: 560px) {
  .entete-sujet { padding-top: 22px; }
  .contexte { font-size: 16px; }
  .recherche-entete { width: auto; flex: 1; }
  .ligne-haut { grid-template-columns: 48px minmax(0, 1fr) auto; gap: 10px; }
  .ligne-haut .cadre-logo { width: 48px; height: 30px; }
  .explication, .pas-explication, .pas-explication + .annonce { margin-left: 0; }
  .qui { margin-left: 0; width: 100%; }
  .programmes { grid-template-columns: 1fr; }
  .panneau h3 { font-size: 19px; }
}
`;

const ENTETE = (avecRecherche = true) => `<header class="site"><div class="contenu">
  ${MARQUE}
  ${avecRecherche ? `<form class="recherche-entete" action="index.html" role="search"><input class="champ" type="search" name="q" placeholder="Rechercher un sujet, un vote…" aria-label="Rechercher"></form>` : ''}
</div></header>`;

function pageSujet({ sujet, votes, groupes, programmes, sansProgramme, nbExtraits }) {
  const logos = (sigles) => sigles.map((s) => `<span data-logo="${esc(s)}"></span>`).join('');
  const blocsProgrammes = programmes
    .map(
      (p) => `
      <article class="programme">
        <header class="entete-prog">
          <span class="logos-prog">${logos(p.sigles)}</span>
          <div><h3>${esc(p.parti)}</h3><p>${
            p.type === 'declaration'
              ? `Déclaration de ${esc(p.orateur)} · ${esc(p.media)}, ${dateFr(p.publieLe)}`
              : `${esc(p.titre)} · ${esc(p.election)}`
          }</p></div>
        </header>
        ${
          p.extraits.length
            ? `<ul class="propositions">${p.extraits
                .map((e) => `<li><q>${esc(e.citation)}</q><a href="${p.url}${e.page ? `#page=${e.page}` : ''}" target="_blank" rel="noopener">${e.page ? `p. ${e.page}` : 'source'} ↗</a></li>`)
                .join('')}</ul>`
            : '<p class="discret">Aucune proposition identifiée sur ce thème dans ce document.</p>'
        }
        <p class="ref">${p.extraits.length && p.extraits.length < 3 ? 'Aucune autre proposition identifiée sur ce thème. · ' : ''}<a href="${p.url}" target="_blank" rel="noopener">Document complet ↗</a></p>
      </article>`,
    )
    .join('');

  const corps = `
${ENTETE()}
<div class="entete-sujet"><div class="contenu">
  <p class="fil"><a href="index.html">Tous les sujets</a> › ${esc(sujet.titre)}</p>
  <h1>${esc(sujet.titre)}</h1>
  <p class="contexte">${esc(sujet.contexte ?? sujet.description)}</p>
  <nav class="onglets" aria-label="Sections">
    <a href="#votes" class="actif">Ce qu'ils ont voté<span>${votes.length}</span></a>
    <a href="#programmes">Ce qu'ils proposent<span>${nbExtraits}</span></a>
  </nav>
</div></div>

<main class="contenu">
  <section id="votes">
    <div class="disposition">
      <div class="colonne-liste">
        <input type="search" id="filtre" class="champ" placeholder="Filtrer les votes…" aria-label="Filtrer les votes">
        <div id="liste-votes"></div>
        <p id="aucun-resultat" hidden>Aucun vote ne correspond.</p>
      </div>
      <div class="panneau" id="panneau">
        <div class="navigation-vote">
          <button class="btn" id="precedent">← Plus récent</button>
          <span id="position-vote"></span>
          <button class="btn" id="suivant">Plus ancien →</button>
        </div>
        <div id="panneau-entete"></div>
        <div id="hemicycle"></div>
        <div class="totaux" id="totaux"></div>
        <h4 class="titre-groupes">Pourquoi chaque groupe a voté ainsi</h4>
        <ul class="groupes" id="liste-groupes"></ul>
        <p class="note-lecture">Seuls les scrutins publics sont enregistrés. La position d'un groupe est celle de la majorité de ses votants. Explications citées mot pour mot depuis les débats. · <a id="lien-officiel" target="_blank" rel="noopener">Scrutin officiel ↗</a></p>
      </div>
    </div>
  </section>

  <section id="programmes">
    <h2>Ce qu'ils proposent</h2>
    <p class="avertissement"><strong>Programmes 2027 pas encore publiés.</strong> En attendant, voici les derniers programmes officiels complets (législatives 2024) et les déclarations publiques des partis, toujours sourcées.</p>
    ${
      nbExtraits
        ? `<div class="programmes">${blocsProgrammes}</div>
    ${sansProgramme.length ? `<p class="manquants">Rien de relevé pour l'instant pour : ${logos(sansProgramme)}</p>` : ''}`
        : '<p class="discret">Aucune proposition relevée pour l’instant sur ce sujet.</p>'
    }
  </section>
</main>

<dialog id="lecteur" aria-labelledby="lecteur-titre">
  <div class="lecteur-entete"><strong id="lecteur-titre"></strong><a id="lecteur-source" target="_blank" rel="noopener">Compte rendu ↗</a><button id="lecteur-fermer" aria-label="Fermer">×</button></div>
  <video controls playsinline></video>
  <p id="lecteur-erreur" hidden>La vidéo n'a pas pu être chargée. Elle reste disponible sur le <a href="https://videos.assemblee-nationale.fr" target="_blank" rel="noopener">portail vidéo de l'Assemblée</a>.</p>
</dialog>`;

  return document_({
    titre: `${sujet.titre} — Poliapp`,
    corps,
    css: CSS_SUJET,
    script: `<script>${dispositionHemicycle.toString()}
(${appSujet.toString()})(${json({ groupes, votes, videoIntegree: VIDEO_INTEGREE })});</script>`,
  });
}

// --- Accueil -----------------------------------------------------------------------------------

function appAccueil(DATA) {
  const $ = (sel) => document.querySelector(sel);
  // Les mini-hémicycles sont dessinés ici, à partir des seuls décomptes, pour garder la page légère.
  document.querySelectorAll('[data-hemi]').forEach((el) => (el.outerHTML = miniHemicycle(DATA.hemicycles[el.dataset.hemi], DATA.ordre)));
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const normaliser = (t) => t.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const dateCourte = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  const champ = $('#recherche');

  function chercher(q) {
    const n = normaliser(q.trim());
    $('#resultats').hidden = !n;
    $('#grille-sujets').hidden = !!n;
    if (!n) return;
    const mots = n.split(/\s+/);
    const trouve = (texte) => mots.every((m) => normaliser(texte).includes(m));
    const sujets = DATA.sujets.filter((s) => trouve(`${s.titre} ${s.description} ${s.motsCles.join(' ')}`));
    const votes = DATA.votes.filter((v) => trouve(`${v.resume} ${v.titre} ${v.sujetTitre}`)).slice(0, 20);
    $('#resultats').innerHTML = `
      ${sujets.length ? `<h2>Sujets</h2><div class="liste-resultats">${sujets.map((s) => `<a class="resultat" href="${s.pret ? `${s.id}.html` : '#'}" ${s.pret ? '' : 'aria-disabled="true"'}><strong>${esc(s.titre)}</strong><span>${s.pret ? `${s.nbVotes} votes` : 'En préparation'}</span></a>`).join('')}</div>` : ''}
      ${votes.length ? `<h2>Votes</h2><div class="liste-resultats">${votes.map((v) => `<a class="resultat" href="${v.sujet}.html#vote-${v.cle}"><strong>${esc(v.resume)}</strong><span>${esc(v.sujetTitre)} · ${dateCourte(v.date)}</span></a>`).join('')}</div>` : ''}
      ${!sujets.length && !votes.length ? '<p class="vide">Aucun résultat. Essayez un autre mot, par exemple « retraites » ou « logement ».</p>' : ''}`;
  }
  champ.addEventListener('input', () => {
    chercher(champ.value);
    history.replaceState(null, '', champ.value ? `?q=${encodeURIComponent(champ.value)}` : location.pathname);
  });
  const initial = new URLSearchParams(location.search).get('q') ?? '';
  champ.value = initial;
  chercher(initial);
}

const CSS_ACCUEIL = `
.hero { background: var(--carte); border-bottom: 1px solid var(--bord); padding: 48px 0 40px; }
.hero .contenu { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 40px; align-items: center; }
.hero h1 { font-size: clamp(34px, 5.5vw, 54px); line-height: 1.04; letter-spacing: -0.03em; margin: 0 0 14px; }
.hero h1 em { font-style: normal; color: var(--accent); }
.hero p.accroche { font-size: 18px; color: var(--discret); margin: 0 0 24px; max-width: 520px; }
.grande-recherche .champ { padding: 15px 22px; font-size: 17px; box-shadow: 0 4px 18px rgba(20, 30, 50, .06); background: #fff; border-color: #d9dde4; }
.suggestions { margin: 12px 0 0; font-size: 14px; color: var(--discret); display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.suggestions a { text-decoration: none; background: var(--survol); color: var(--texte); border-radius: 999px; padding: 3px 12px; font-weight: 500; }
.suggestions a:hover { background: #e3e9f3; }
.une { display: block; text-decoration: none; color: var(--texte); background: var(--fond); border: 1px solid var(--bord); border-radius: 20px; padding: 20px 22px 18px; transition: border-color .15s, box-shadow .15s; }
.une:hover { border-color: var(--accent); box-shadow: 0 8px 28px rgba(47, 111, 222, .12); }
.une .etiquette-une { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--accent); }
.une h2 { font-size: 18px; line-height: 1.35; margin: 6px 0 4px; letter-spacing: -0.01em; }
.une .mini-hemi { width: 100%; margin-top: 6px; }
.une .chiffres-une { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 13px; color: var(--discret); }
.une .chiffres-une b { color: var(--texte); }
.mini-hemi { display: block; width: 100%; height: auto; }
.mini-hemi .s-pour { fill: var(--pour); } .mini-hemi .s-contre { fill: var(--contre); }
.mini-hemi .s-abstention { fill: var(--abstention); } .mini-hemi .s-null { fill: var(--absent); }
section { padding-top: 40px; }
.titre-section { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 0 0 14px; }
h2.surtitre { font-size: 14px; text-transform: uppercase; letter-spacing: .07em; color: var(--discret); margin: 0; }
.derniers { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.carte-vote { display: flex; flex-direction: column; gap: 8px; background: var(--carte); border: 1px solid var(--bord); border-radius: 16px; padding: 16px; text-decoration: none; color: var(--texte); transition: border-color .15s, transform .15s; }
.carte-vote:hover { border-color: var(--accent); transform: translateY(-1px); }
.carte-vote .sujet-tag { font-size: 12px; font-weight: 600; color: var(--accent); }
.carte-vote strong { font-size: 14.5px; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.carte-vote .pied { margin-top: auto; display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--discret); }
.grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 14px; }
.carte-sujet { display: grid; grid-template-rows: auto auto 1fr auto; gap: 6px; background: var(--carte); border: 1px solid var(--bord); border-radius: 16px; padding: 18px; text-decoration: none; color: var(--texte); transition: border-color .15s, box-shadow .15s, transform .15s; }
a.carte-sujet:hover { border-color: var(--accent); box-shadow: 0 6px 20px rgba(47, 111, 222, .1); transform: translateY(-1px); }
.carte-sujet .mini-hemi { max-width: 150px; opacity: .95; }
.carte-sujet h3 { margin: 4px 0 0; font-size: 17px; letter-spacing: -0.01em; }
.carte-sujet p { margin: 0; font-size: 13.5px; color: var(--discret); line-height: 1.45; }
.carte-sujet .pied-carte { display: flex; gap: 10px; font-size: 13px; font-weight: 600; color: var(--accent); padding-top: 6px; }
.carte-sujet.bientot { background: transparent; border-style: dashed; }
.carte-sujet.bientot .pied-carte { color: var(--discret); font-weight: 500; }
#resultats { padding-top: 32px; }
.liste-resultats { display: grid; gap: 8px; margin-bottom: 28px; }
.resultat { display: flex; justify-content: space-between; align-items: center; gap: 16px; background: var(--carte); border: 1px solid var(--bord); border-radius: 12px; padding: 14px 18px; text-decoration: none; color: var(--texte); }
.resultat:hover { border-color: var(--accent); }
.resultat span { font-size: 13px; color: var(--discret); white-space: nowrap; }
.resultat[aria-disabled="true"] { pointer-events: none; opacity: .6; }
#resultats h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .07em; color: var(--discret); margin: 0 0 12px; }
.vide { color: var(--discret); }
.principes { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-top: 48px; padding: 24px; background: var(--carte); border: 1px solid var(--bord); border-radius: 16px; }
.principes div { font-size: 14px; color: var(--discret); }
.principes strong { display: block; color: var(--texte); font-size: 15px; margin-bottom: 4px; }
@media (max-width: 900px) {
  .hero .contenu { grid-template-columns: 1fr; gap: 28px; }
  .derniers { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 560px) {
  .hero { padding: 32px 0 28px; }
  .hero p.accroche { font-size: 16px; }
  .derniers { grid-auto-flow: column; grid-template-columns: none; grid-auto-columns: 72%; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: 8px; }
  .carte-vote { scroll-snap-align: start; }
  .resultat { flex-direction: column; align-items: flex-start; gap: 4px; }
}
`;

function pageAccueil() {
  const prets = new Map(pages.map((p) => [p.sujet.id, p]));
  const dateCourte = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  const resultat = (v) => `<span class="res res-${v.resultat}">${v.resultat === 'adopté' ? 'Adopté' : 'Rejeté'}</span>`;

  // Tous les votes, une seule fois chacun, rattachés au premier sujet qui les présente.
  const tousVotes = [];
  for (const p of pages) for (const v of p.votes) if (!tousVotes.some((x) => x.vote.cle === v.cle)) tousVotes.push({ vote: v, page: p });
  tousVotes.sort((a, b) => b.vote.date.localeCompare(a.vote.date));
  // À la une : le vote récent le plus suivi.
  const recents = tousVotes.slice(0, 12);
  const une = recents.reduce((m, x) => (x.vote.decompte.votants > m.vote.decompte.votants ? x : m), recents[0]);
  const derniers = tousVotes.filter((x) => x !== une).slice(0, 4);

  // Décomptes des votes à dessiner en hémicycle (voir appAccueil).
  const hemicycles = [];
  const hemi = (vote) => {
    hemicycles.push({ groupes: Object.fromEntries(Object.entries(vote.groupes).map(([g, r]) => [g, { membres: r.membres, pour: r.pour, contre: r.contre, abstention: r.abstention }])) });
    return `<span data-hemi="${hemicycles.length - 1}"></span>`;
  };
  const carteVote = ({ vote, page }) => `
    <a class="carte-vote" href="${page.sujet.id}.html#vote-${vote.cle}">
      <span class="sujet-tag">${esc(page.sujet.titre)}</span>
      ${hemi(vote)}
      <strong>${esc(vote.resume)}</strong>
      <span class="pied"><span>${dateCourte(vote.date)}</span>${resultat(vote)}</span>
    </a>`;

  const sujetsAffiches = [...sujets].sort((a, b) => Number(prets.has(b.id)) - Number(prets.has(a.id)));
  const cartes = sujetsAffiches
    .map((s) => {
      const p = prets.get(s.id);
      if (!p) return `<div class="carte-sujet bientot"><span></span><h3>${esc(s.titre)}</h3><p>${esc(s.description)}</p><div class="pied-carte">Aucun scrutin public relevé depuis 2022</div></div>`;
      return `<a class="carte-sujet" href="${s.id}.html">${hemi(p.votes[0])}<h3>${esc(s.titre)}</h3><p>${esc(s.description)}</p><div class="pied-carte"><span>${p.votes.length} votes</span>${p.nbExtraits ? `<span>${p.nbExtraits} propositions</span>` : ''}</div></a>`;
    })
    .join('');

  const donnees = {
    sujets: sujets.map((s) => ({ id: s.id, titre: s.titre, description: s.description, motsCles: s.motsCles, pret: prets.has(s.id), nbVotes: prets.get(s.id)?.votes.length ?? 0 })),
    votes: tousVotes.map(({ vote, page }) => ({ sujet: page.sujet.id, sujetTitre: page.sujet.titre, cle: vote.cle, resume: vote.resume, titre: vote.titre, date: vote.date })),
    ordre: groupesAvecLogo.map((g) => ({ sigle: g.sigle })),
    hemicycles,
  };
  const corps = `
${ENTETE(false)}
<div class="hero"><div class="contenu">
  <div>
    <h1>Ce qu'ils <em>votent</em>.<br>Ce qu'ils <em>proposent</em>.</h1>
    <p class="accroche">Les votes de l'Assemblée nationale depuis 2022 et les propositions des partis, sujet par sujet. Toujours sourcé, jamais commenté.</p>
    <div class="grande-recherche">
      <input id="recherche" class="champ" type="search" placeholder="Un sujet, une loi… ex. « retraites »" aria-label="Rechercher">
      <p class="suggestions">${['Retraites', 'IVG', 'Immigration', 'Fin de vie', 'Logement'].map((m) => `<a href="?q=${encodeURIComponent(m)}">${m}</a>`).join('')}</p>
    </div>
  </div>
  <a class="une" href="${une.page.sujet.id}.html#vote-${une.vote.cle}">
    <span class="etiquette-une">À la une · ${esc(une.page.sujet.titre)}</span>
    <h2>${esc(une.vote.resume)}</h2>
    ${hemi(une.vote)}
    <div class="chiffres-une"><span>${dateCourte(une.vote.date)}</span>${resultat(une.vote)}<span><b>${une.vote.decompte.pour}</b> pour</span><span><b>${une.vote.decompte.contre}</b> contre</span><span><b>${une.vote.decompte.abstention}</b> abst.</span></div>
  </a>
</div></div>
<main class="contenu">
  <div id="resultats" hidden></div>
  <div id="grille-sujets">
    <section>
      <div class="titre-section"><h2 class="surtitre">Derniers votes</h2></div>
      <div class="derniers">${derniers.map(carteVote).join('')}</div>
    </section>
    <section>
      <div class="titre-section"><h2 class="surtitre">Tous les sujets</h2><span class="discret">${pages.length} sujets · ${tousVotes.length} votes</span></div>
      <div class="grille">${cartes}</div>
    </section>
    <div class="principes">
      <div><strong>Les votes réels</strong>Chaque scrutin public depuis 2022, chaque groupe, avec la participation.</div>
      <div><strong>Leurs propres mots</strong>Les explications des groupes, citées depuis les débats, en texte et en vidéo.</div>
      <div><strong>Vérifiable</strong>Chaque citation renvoie à sa source officielle et est vérifiée automatiquement.</div>
    </div>
  </div>
</main>`;
  return document_({ titre: 'Poliapp — Ce qu’ils votent, ce qu’ils proposent', corps, css: CSS_ACCUEIL, script: `<script>${dispositionHemicycle.toString()}
${miniHemicycle.toString()}
(${appAccueil.toString()})(${json(donnees)});</script>` });
}

// --- Écriture ----------------------------------------------------------------------------------

mkdirSync('maquette', { recursive: true });
writeFileSync('maquette/index.html', pageAccueil());
for (const p of PAGES) {
  const corps = `${ENTETE()}<main class="contenu page-texte"><h1>${esc(p.titre)}</h1>${p.corps}</main>`;
  writeFileSync(`maquette/${p.fichier}`, document_({ titre: `${p.titre} — Poliapp`, corps }));
}
for (const p of pages) writeFileSync(`maquette/${p.sujet.id}.html`, pageSujet(p));
console.log(`maquette/index.html + ${pages.map((p) => `${p.sujet.id}.html (${p.votes.length} votes)`).join(', ')} · ${sujets.length - pages.length} sujets en préparation`);
