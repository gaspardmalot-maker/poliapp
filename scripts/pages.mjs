// Pages institutionnelles du site : mentions légales, confidentialité, méthodologie, sources et licences.
// Le contenu est rédigé ici ; le gabarit (en-tête, pied de page, styles) vient de scripts/maquette.mjs.

export const DEPOT = 'https://github.com/gaspardmalot-maker/poliapp';
export const SIGNALER = `${DEPOT}/issues/new`;

const MISE_A_JOUR = '31 octobre 2026';

export const PAGES = [
  {
    fichier: 'methodologie.html',
    titre: 'Méthodologie',
    corps: `
<p class="chapeau">Poliapp montre, sujet par sujet, ce que les groupes ont voté à l'Assemblée nationale depuis juin 2022 et ce que les partis proposent. Le site ne classe pas, ne note pas et ne recommande aucun vote.</p>

<h2>D'où viennent les votes</h2>
<ul>
  <li>Des <strong>scrutins publics</strong> publiés en données ouvertes par l'Assemblée nationale (XVI<sup>e</sup> législature, 2022-2024, et XVII<sup>e</sup> législature, depuis 2024), ainsi que des votes du Congrès.</li>
  <li>Les votes à main levée ne sont pas enregistrés nominativement : ils n'apparaissent pas sur le site.</li>
  <li>La position d'un groupe est celle de la majorité de ses <strong>votants</strong>, recalculée à partir du décompte des voix (la position publiée par l'Assemblée le contredit dans environ 3 % des cas). La participation est toujours affichée.</li>
  <li>Pour une motion de censure, seuls les votes « pour » sont comptés : c'est la règle de l'Assemblée.</li>
</ul>

<h2>Comment les votes sont choisis</h2>
<ul>
  <li>Pour chaque sujet, un programme repère les scrutins par mots-clés, puis retient les votes finaux les plus suivis. Des ajouts et exclusions manuels corrigent ce tri ; ils sont publiés dans le dépôt du projet.</li>
  <li>Chaque vote est marqué <em>sélection automatique</em>, <em>à valider</em> ou validé après relecture humaine.</li>
</ul>

<h2>Les explications de vote</h2>
<ul>
  <li>Elles viennent exclusivement des <strong>comptes rendus officiels des débats</strong> : discussion générale, explications de vote, débat des motions.</li>
  <li>Pour chaque groupe, on cite la ou les phrases où l'orateur annonce le vote de son groupe et en donne la raison. On écarte les attaques visant d'autres groupes.</li>
  <li>Les citations sont <strong>reprises mot pour mot</strong>. Plusieurs extraits d'une même intervention sont séparés par « […] ». Un programme vérifie que chaque citation figure exactement dans le compte rendu.</li>
  <li>Une citation marquée <em>extrait automatique</em> a été choisie par un programme et n'a pas encore été relue.</li>
  <li>Les non-inscrits ne forment pas un groupe : leurs interventions ne sont pas présentées comme une position collective.</li>
</ul>

<h2>Les propositions des partis</h2>
<ul>
  <li>Seuls les documents publiés par les partis ou candidats eux-mêmes servent de source, jamais les résumés de tiers.</li>
  <li>Les propositions sont citées mot pour mot, avec le document, la page et la date. Tant que les programmes 2027 ne sont pas publiés, le site affiche le dernier programme officiel complet, avec son élection d'origine.</li>
  <li>Quand rien n'a été relevé pour un parti, le site l'indique au lieu de laisser un vide.</li>
</ul>

<h2>Présentation</h2>
<ul>
  <li>Les groupes sont désignés par leur nom officiel, dans l'ordre de l'hémicycle, jamais par une étiquette (« extrême gauche », « centre »…).</li>
  <li>Les couleurs représentent le vote (pour, contre, abstention), jamais un parti.</li>
  <li>Le site ne publie pas de sondages.</li>
</ul>

<h2>Erreurs et corrections</h2>
<p>Une erreur, un oubli, une citation sortie de son contexte ? <a href="${SIGNALER}" target="_blank" rel="noopener">Signalez-la</a> : chaque correction est publique et datée dans l'historique du dépôt.</p>`,
  },
  {
    fichier: 'sources.html',
    titre: 'Sources et licences',
    corps: `
<h2>Données de l'Assemblée nationale</h2>
<p>Scrutins, députés, groupes et comptes rendus des débats : <a href="https://data.assemblee-nationale.fr" target="_blank" rel="noopener">data.assemblee-nationale.fr</a>, sous <a href="https://www.etalab.gouv.fr/licence-ouverte-open-licence/" target="_blank" rel="noopener">Licence Ouverte / Open Licence 2.0</a>. La date de dernière récupération figure en bas de chaque page. Les débats parlementaires sont des documents publics, librement reproductibles : chaque citation renvoie au passage original du compte rendu sur assemblee-nationale.fr.</p>

<h2>Vidéos des séances</h2>
<p>Les vidéos appartiennent à l'Assemblée nationale. Le site ne les télécharge, ne les héberge ni ne les modifie : le bouton « Voir en vidéo » lit le flux public de la séance directement depuis les serveurs de l'Assemblée, au moment de l'intervention, avec un lien vers le compte rendu officiel. Sur demande de l'Assemblée, cette lecture intégrée sera retirée au profit d'un simple lien.</p>
<p>La lecture des vidéos utilise la bibliothèque <a href="https://github.com/video-dev/hls.js" target="_blank" rel="noopener">hls.js</a> (licence Apache 2.0), servie par le site lui-même.</p>

<h2>Programmes et déclarations des partis</h2>
<p>Les propositions sont de courtes citations, accompagnées de leur source, au titre du droit de citation (article L. 122-5 du code de la propriété intellectuelle). Les documents complets ne sont pas republiés : le site renvoie vers leur adresse d'origine.</p>

<h2>Logos</h2>
<p>Les logos des partis et groupes sont des marques appartenant à leurs titulaires. Ils sont utilisés uniquement pour identifier les groupes, à taille égale pour tous. Fichiers issus de <a href="https://commons.wikimedia.org" target="_blank" rel="noopener">Wikimedia Commons</a> ; la provenance de chacun est listée dans le dépôt. Un titulaire qui souhaite le retrait de son logo peut le <a href="${SIGNALER}" target="_blank" rel="noopener">demander</a>.</p>

<h2>Contenus du site</h2>
<ul>
  <li><strong>Code source</strong> : licence MIT, disponible sur <a href="${DEPOT}" target="_blank" rel="noopener">GitHub</a>.</li>
  <li><strong>Sélections, résumés et données produites par le projet</strong> : licence <a href="https://creativecommons.org/licenses/by/4.0/deed.fr" target="_blank" rel="noopener">Creative Commons BY 4.0</a> (réutilisation libre avec mention de la source).</li>
</ul>`,
  },
  {
    fichier: 'mentions-legales.html',
    titre: 'Mentions légales',
    corps: `
<h2>Éditeur</h2>
<p>Poliapp est un site d'information citoyenne, gratuit, sans publicité et sans financement, édité à titre non professionnel par un particulier. Conformément à la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique (LCEN), l'éditeur non professionnel peut ne communiquer au public que les coordonnées de l'hébergeur ; son identité est connue de celui-ci.</p>
<p>Le site n'est rattaché à aucun parti, groupe parlementaire, candidat ou institution, et n'en reçoit aucun soutien.</p>

<h2>Hébergeur</h2>
<p>GitHub, Inc. (service GitHub Pages)<br>88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis<br><a href="https://github.com" target="_blank" rel="noopener">github.com</a></p>

<h2>Contact, signalement et droit de réponse</h2>
<p>Pour signaler une erreur, un contenu illicite ou exercer un droit de réponse (toute personne nommée ou désignée sur le site peut en faire la demande), écrivez via <a href="${SIGNALER}" target="_blank" rel="noopener">le formulaire de signalement du projet</a>. Les demandes sont traitées dans les meilleurs délais ; les corrections sont publiques et datées.</p>

<h2>Responsabilité</h2>
<p>Les informations proviennent de sources officielles et sont reprises sans modification. Le site ne peut garantir l'absence d'erreur dans ces sources (il en signale certaines) ni dans leur traitement : chaque information renvoie à sa source pour vérification. Les liens vers des sites tiers n'engagent pas l'éditeur sur leur contenu.</p>

<h2>Propriété intellectuelle</h2>
<p>Voir la page <a href="sources.html">Sources et licences</a>.</p>
<p class="discret">Dernière mise à jour : ${MISE_A_JOUR}.</p>`,
  },
  {
    fichier: 'confidentialite.html',
    titre: 'Données personnelles',
    corps: `
<h2>Visiteurs du site</h2>
<ul>
  <li>Le site ne dépose <strong>aucun cookie</strong>, n'utilise <strong>aucun outil de mesure d'audience</strong> ni de publicité, et ne demande aucune information (pas de compte, pas de formulaire). Aucun bandeau de consentement n'est donc nécessaire.</li>
  <li>Toutes les ressources (pages, styles, logos, scripts) sont servies par l'hébergeur ; le site ne charge aucune police ni script depuis un service tiers.</li>
  <li>Seule exception, et uniquement si vous cliquez sur « Voir en vidéo » : la vidéo est lue depuis les serveurs de l'Assemblée nationale, qui reçoivent alors votre adresse IP, comme lorsque vous la regardez sur leur site.</li>
  <li>Comme tout hébergeur, GitHub enregistre techniquement l'adresse IP des visiteurs pour assurer le service et la sécurité : voir la <a href="https://docs.github.com/fr/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener">politique de confidentialité de GitHub</a>.</li>
  <li>Les liens vers l'Assemblée nationale ou les sites des partis mènent à des sites qui ont leurs propres règles.</li>
</ul>

<h2>Personnes citées : députés et responsables politiques</h2>
<p>Le site traite des données relatives à des personnes exerçant un mandat public : nom, groupe politique, votes en scrutin public, interventions en séance, déclarations publiques.</p>
<ul>
  <li><strong>Source</strong> : publications officielles de l'Assemblée nationale (rendues publiques en application des règles de publicité des débats) et documents publiés par les partis eux-mêmes.</li>
  <li><strong>Finalité</strong> : informer les citoyens sur l'action publique de leurs représentants.</li>
  <li><strong>Base légale</strong> : intérêt légitime (article 6.1.f du RGPD), limité à l'activité publique liée au mandat. Aucune donnée relevant de la vie privée n'est collectée.</li>
  <li><strong>Durée</strong> : les données sont conservées tant qu'elles sont utiles à l'information sur l'action parlementaire depuis 2022.</li>
  <li><strong>Vos droits</strong> : toute personne concernée peut demander la rectification d'une erreur, ou s'opposer à un traitement, via <a href="${SIGNALER}" target="_blank" rel="noopener">le formulaire de signalement</a>. Vous pouvez aussi saisir la <a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener">CNIL</a>.</li>
</ul>
<p class="discret">Dernière mise à jour : ${MISE_A_JOUR}.</p>`,
  },
];
