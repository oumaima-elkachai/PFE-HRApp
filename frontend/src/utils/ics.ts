// src/utils/ics.ts
//
// Génération de fichiers iCalendar (.ics), conforme à la RFC 5545.
//
// Partagé entre l'agenda du salarié, qui exporte tout son calendrier,
// et la page Événements, qui exporte un événement seul. Le même code
// à deux endroits aurait divergé au premier correctif.
//
// Trois pièges, et chacun produit un fichier qu'Outlook refuse sans
// rien expliquer : les fins de ligne doivent être CRLF, les virgules
// et points-virgules d'un texte doivent être échappés, et une ligne
// dépassant 75 octets doit être repliée.

export interface EntreeIcs {
  /** Identifiant stable : il devient l'UID de l'événement. */
  id: string;
  titre: string;
  description?: string;
  lieu?: string | null;
  url?: string | null;
  /** ISO complet pour un horaire, AAAA-MM-JJ pour une journée entière. */
  debut: string;
  fin?: string;
  journeeEntiere: boolean;
}

const echapper = (s: string) =>
  String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

const octets = (s: string) => new TextEncoder().encode(s).length;

/**
 * Replie une ligne à 75 octets, la suite préfixée d'une espace.
 *
 * La limite de la RFC est en OCTETS, pas en caractères : un « é » pèse
 * deux octets, donc une ligne de soixante-quinze lettres accentuées la
 * dépasse déjà. On compte donc les octets, mais on coupe sur les
 * caractères — scinder un « é » en deux produirait un fichier illisible.
 * La deuxième limite est à 74 : l'espace de continuation compte.
 */
function replier(ligne: string): string {
  if (octets(ligne) <= 75) return ligne;

  const morceaux: string[] = [];
  let courant = '';
  let limite = 75;

  for (const caractere of ligne) {
    if (courant && octets(courant + caractere) > limite) {
      morceaux.push(courant);
      courant = caractere;
      limite = 74;
    } else {
      courant += caractere;
    }
  }
  if (courant) morceaux.push(courant);

  return morceaux.map((m, i) => (i ? ` ${m}` : m)).join('\r\n');
}

const deuxChiffres = (n: number) => String(n).padStart(2, '0');

const horodatageUtc = (d: Date) =>
  `${d.getUTCFullYear()}${deuxChiffres(d.getUTCMonth() + 1)}`
  + `${deuxChiffres(d.getUTCDate())}T${deuxChiffres(d.getUTCHours())}`
  + `${deuxChiffres(d.getUTCMinutes())}${deuxChiffres(d.getUTCSeconds())}Z`;

const jourIcs = (iso: string) => iso.slice(0, 10).replace(/-/g, '');

/** Lendemain d'une date AAAA-MM-JJ, au même format. */
function lendemain(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${deuxChiffres(d.getMonth() + 1)}-${deuxChiffres(d.getDate())}`;
}

export function construireIcs(entrees: EntreeIcs[]): string {
  const maintenant = horodatageUtc(new Date());

  const lignes: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HR UP//Agenda//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const e of entrees) {
    lignes.push('BEGIN:VEVENT');
    lignes.push(`UID:${e.id}@hr-up`);
    lignes.push(`DTSTAMP:${maintenant}`);

    if (e.journeeEntiere) {
      // Une journée entière se déclare en VALUE=DATE, et DTEND est
      // EXCLUSIF : un congé du 3 au 5 se termine le 6, sans quoi le
      // dernier jour manque dans tous les agendas.
      lignes.push(`DTSTART;VALUE=DATE:${jourIcs(e.debut)}`);
      lignes.push(`DTEND;VALUE=DATE:${jourIcs(lendemain(e.fin ?? e.debut))}`);
    } else {
      lignes.push(`DTSTART:${horodatageUtc(new Date(e.debut))}`);
      lignes.push(`DTEND:${horodatageUtc(new Date(e.fin ?? e.debut))}`);
    }

    lignes.push(`SUMMARY:${echapper(e.titre)}`);
    if (e.description) lignes.push(`DESCRIPTION:${echapper(e.description)}`);
    if (e.lieu) lignes.push(`LOCATION:${echapper(e.lieu)}`);
    if (e.url) lignes.push(`URL:${echapper(e.url)}`);
    lignes.push('END:VEVENT');
  }

  lignes.push('END:VCALENDAR');

  return `${lignes.map(replier).join('\r\n')}\r\n`;
}

/**
 * Déclenche le téléchargement du fichier.
 *
 * Renvoie false si le navigateur l'a refusé, pour que l'appelant
 * affiche un message plutôt que de laisser croire au succès.
 */
export function telechargerIcs(entrees: EntreeIcs[], nomFichier: string): boolean {
  try {
    const blob = new Blob([construireIcs(entrees)], {
      type: 'text/calendar;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomFichier;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  } catch {
    return false;
  }
}

// Exportés pour les essais : ces trois fonctions se vérifient sans
// navigateur, et ce sont elles qui portent les pièges de la RFC.
export { echapper, replier, lendemain };