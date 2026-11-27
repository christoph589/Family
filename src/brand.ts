/** Name der App an einer Stelle. Arbeitstitel, bis Name und Domain feststehen. */
export const BRAND = { name: 'Famelio', claim: 'Der Familienalltag auf einem Bildschirm.', url: 'https://famelio.de/' };

/** Rechtstexte liegen als eigene Seiten unter famelio.de (public/impressum, public/datenschutz, public/agb). */
export const LEGAL = {
  impressum: BRAND.url + 'impressum/',
  datenschutz: BRAND.url + 'datenschutz/',
  agb: BRAND.url + 'agb/',
};
