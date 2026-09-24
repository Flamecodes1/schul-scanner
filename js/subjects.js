// Wissen über typische Schulfächer: Namen, Farben, Stichwörter, Sprache.
// Damit werden Fächer aus Untis ("D", "M", "BIO") zu schönen Namen und bekommen
// sinnvolle Start-Stichwörter für die automatische Erkennung.

export const KNOWN = [
  { key: 'deutsch', name: 'Deutsch', color: '#e5484d', re: /deutsch|^d$|^deu$/i,
    words: ['deutsch', 'gedicht', 'lyrik', 'erörterung', 'inhaltsangabe', 'kurzgeschichte', 'novelle', 'drama', 'roman', 'grammatik', 'rechtschreibung', 'kommasetzung', 'zeichensetzung', 'satzglieder', 'wortarten', 'textanalyse', 'interpretation', 'epik', 'strophe', 'metapher', 'erzähler', 'sachtext', 'argumentation', 'konjunktiv', 'ballade', 'szene', 'autor'] },
  { key: 'mathe', name: 'Mathe', color: '#0d74ce', re: /mathe|^m$|^ma$/i,
    words: ['mathe', 'mathematik', 'gleichung', 'gleichungen', 'funktion', 'funktionen', 'berechne', 'berechnen', 'dreieck', 'winkel', 'prozent', 'bruch', 'brüche', 'term', 'terme', 'geometrie', 'ableitung', 'integral', 'wahrscheinlichkeit', 'graph', 'koordinatensystem', 'parabel', 'quadratisch', 'pythagoras', 'flächeninhalt', 'volumen', 'umfang', 'vektor', 'lineare', 'potenzen', 'wurzel', 'rechteck', 'kreis'] },
  { key: 'englisch', name: 'Englisch', color: '#8e4ec6', re: /englisch|english|^e$|^en$|^eng$/i, lang: 'en',
    words: ['english', 'englisch', 'vocabulary', 'grammar', 'exercise', 'unit', 'present', 'past', 'simple', 'progressive'] },
  { key: 'franz', name: 'Französisch', color: '#3e63dd', re: /franz|französisch|french|^f$|^fr$/i, lang: 'fr',
    words: ['français', 'französisch', 'vocabulaire', 'exercice', 'conjugaison', 'leçon', 'unité'] },
  { key: 'latein', name: 'Latein', color: '#a18072', re: /latein|latin|^l$|^la$/i, lang: 'la',
    words: ['latein', 'lektion', 'deklination', 'konjugation', 'ablativ', 'übersetze', 'caesar', 'cicero', 'ovid', 'römer'] },
  { key: 'spanisch', name: 'Spanisch', color: '#f76b15', re: /spanisch|spanish|^s$|^sn$|^spa$/i, lang: 'es',
    words: ['español', 'spanisch', 'vocabulario', 'ejercicio', 'unidad'] },
  { key: 'bio', name: 'Biologie', color: '#30a46c', re: /bio/i,
    words: ['biologie', 'zelle', 'zellen', 'organismus', 'pflanze', 'pflanzen', 'fotosynthese', 'photosynthese', 'dna', 'genetik', 'evolution', 'ökosystem', 'enzym', 'mitose', 'blut', 'nerven', 'bakterien', 'mikroskop', 'lebewesen', 'ernährung', 'organe', 'art', 'arten'] },
  { key: 'chemie', name: 'Chemie', color: '#12a594', re: /chemie|^ch$/i,
    words: ['chemie', 'element', 'elemente', 'atom', 'atome', 'molekül', 'reaktion', 'säure', 'säuren', 'base', 'periodensystem', 'elektronen', 'ionen', 'oxidation', 'salz', 'stoff', 'stoffe', 'teilchen', 'formel', 'versuch', 'lösung'] },
  { key: 'physik', name: 'Physik', color: '#0797b9', re: /physik|^ph$/i,
    words: ['physik', 'kraft', 'energie', 'geschwindigkeit', 'beschleunigung', 'strom', 'spannung', 'widerstand', 'elektrisch', 'magnet', 'welle', 'optik', 'linse', 'druck', 'masse', 'leistung', 'newton', 'joule', 'watt', 'volt', 'ampere', 'schaltung'] },
  { key: 'geschichte', name: 'Geschichte', color: '#b08a3e', re: /geschichte|^g$|^ge$|^gs$/i,
    words: ['geschichte', 'jahrhundert', 'krieg', 'kaiser', 'könig', 'revolution', 'mittelalter', 'antike', 'weimarer', 'republik', 'nationalsozialismus', 'reich', 'quelle', 'historisch', 'epoche', 'reformation', 'weltkrieg', 'herrschaft'] },
  { key: 'erdkunde', name: 'Erdkunde', color: '#6c9a2b', re: /erdkunde|geograph|geografie|^ek$|^geo$/i,
    words: ['erdkunde', 'geographie', 'geografie', 'klima', 'karte', 'kontinent', 'bevölkerung', 'landwirtschaft', 'vulkan', 'erdbeben', 'atlas', 'globalisierung', 'tourismus', 'relief', 'plattentektonik', 'niederschlag', 'region'] },
  { key: 'politik', name: 'Politik', color: '#d6409f', re: /politik|sozialkunde|gemeinschaftskunde|powi|wirtschaft|^po$|^sk$|^gk$|^wi$/i,
    words: ['politik', 'demokratie', 'bundestag', 'wahl', 'wahlen', 'grundgesetz', 'partei', 'parteien', 'regierung', 'gesellschaft', 'bundesrat', 'gewaltenteilung', 'verfassung', 'wirtschaft', 'markt', 'bürger'] },
  { key: 'religion', name: 'Religion', color: '#7d66d9', re: /religion|ethik|philosophie|werte|^er$|^kr$|^rk$|^ev$|^re$|^eth?$|^pp$/i,
    words: ['religion', 'ethik', 'gott', 'bibel', 'kirche', 'jesus', 'glaube', 'moral', 'philosophie', 'islam', 'judentum', 'christentum', 'gewissen', 'werte', 'gerechtigkeit'] },
  { key: 'kunst', name: 'Kunst', color: '#e38a00', re: /kunst|^ku$|^bk$/i,
    words: ['kunst', 'malerei', 'zeichnung', 'perspektive', 'künstler', 'komposition', 'skulptur', 'farbkreis', 'bildanalyse'] },
  { key: 'musik', name: 'Musik', color: '#e93d82', re: /musik|^mu$/i,
    words: ['musik', 'noten', 'takt', 'rhythmus', 'melodie', 'komponist', 'tonleiter', 'akkord', 'instrument', 'orchester', 'notenschlüssel'] },
  { key: 'sport', name: 'Sport', color: '#46a758', re: /sport|^sp$/i,
    words: ['sport', 'training', 'regeln', 'aufwärmen', 'fitness'] },
  { key: 'informatik', name: 'Informatik', color: '#687076', re: /informatik|^if$|^inf$|^in$/i,
    words: ['informatik', 'programm', 'algorithmus', 'python', 'variable', 'schleife', 'computer', 'daten', 'binär', 'html', 'java', 'code'] },
  { key: 'nawi', name: 'NaWi', color: '#29a383', re: /nawi|naturwissenschaft|^nw$/i,
    words: ['naturwissenschaft', 'experiment', 'versuch', 'beobachtung'] },
];

const EXTRA_COLORS = ['#0090ff', '#e54666', '#8d8d86', '#ffba18', '#00a2c7', '#978365', '#ab4aba', '#3e9b4f'];

/** Findet das bekannte Fach zu einem Untis-Kürzel oder Namen */
export function knownFor(short = '', long = '') {
  const cleanShort = short.replace(/[\d_\-.\s].*$/, '').trim(); // "E5", "D-GK1" → "E", "D"
  for (const k of KNOWN) if (long && k.re.test(long)) return k;
  for (const k of KNOWN) if (cleanShort && k.re.test(cleanShort)) return k;
  for (const k of KNOWN) if (short && k.re.test(short)) return k;
  return null;
}

export function colorFor(index) {
  return EXTRA_COLORS[index % EXTRA_COLORS.length];
}

/** Standard-Fächer, falls (noch) kein Untis-Stundenplan da ist */
export function defaultSubjects() {
  return KNOWN.filter((k) => k.key !== 'nawi').map((k) => ({
    id: k.key,
    name: k.name,
    color: k.color,
    keywords: [],
    hidden: ['latein', 'spanisch', 'informatik'].includes(k.key),
  }));
}

/** Häufige Wörter pro Sprache – damit erkennt man englische/französische usw. Blätter */
export const STOPWORDS = {
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', 'eine', 'mit', 'zu', 'den', 'von', 'sie', 'es', 'auf', 'für', 'im', 'dem', 'wie', 'auch', 'sich', 'wird', 'werden', 'oder', 'bei', 'aus', 'nach', 'deine', 'dein', 'schreibe', 'lies'],
  en: ['the', 'and', 'is', 'are', 'you', 'your', 'of', 'to', 'what', 'which', 'write', 'read', 'with', 'this', 'that', 'for', 'it', 'on', 'be', 'have', 'has', 'they', 'there', 'were', 'was', 'can', 'do', 'does', 'my', 'about', 'these', 'answer', 'questions'],
  fr: ['le', 'la', 'les', 'des', 'est', 'et', 'une', 'un', 'du', 'vous', 'je', 'tu', 'il', 'elle', 'avec', 'pour', 'dans', 'pas', 'que', 'qui', 'sur', 'au', 'aux', 'ce', 'cette', 'sont', 'nous', 'écris', 'lis', 'réponds'],
  la: ['est', 'sunt', 'sed', 'cum', 'quod', 'atque', 'enim', 'nec', 'erat', 'esse', 'eius', 'autem', 'neque', 'apud', 'quae', 'quid', 'non', 'ad', 'et', 'ab', 'ex', 'hic', 'haec', 'ille', 'iam', 'tamen', 'ubi'],
  es: ['el', 'los', 'las', 'es', 'y', 'en', 'que', 'de', 'un', 'una', 'por', 'para', 'con', 'está', 'son', 'del', 'al', 'lo', 'como', 'pero', 'muy', 'tu', 'escribe', 'lee', 'qué'],
};
