import { Platform } from 'react-native';
import { Question, Worksheet } from '../data/types';
import { sanitizeSvg } from './Math';
import { BRAND } from '../brand';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Brüche als echte Bruchschreibweise, wie in der App */
const math = (t: string) => esc(t).replace(/(\d+)\s*\/\s*(\d+)/g, '<span class="fr"><span>$1</span><span>$2</span></span>').replace(/\n/g, '<br>');

function space(q: Question, pts: number, mathy: boolean): string {
  if (q.type === 'choice' || (q.type === 'table' && !q.paper)) return '';
  const kind = q.space ?? (q.paper ? 'blank' : mathy ? 'grid' : 'lines');
  const size = Math.min(12, Math.max(1, Math.round(q.size ?? (q.paper ? 7 : Math.min(8, 1 + pts)))));
  return `<div class="sp ${kind}" style="height:${size * (kind === 'lines' ? 9 : 10)}mm"></div>`;
}

const ptsWord = (p: number) => `${p} ${p === 1 ? 'Punkt' : 'Punkte'}`;

/** Tabelle; mit fill werden die "?"-Felder der Reihe nach mit der Lösung gefüllt. */
function tableHtml(q: Question, fill?: string[]) {
  if (q.type !== 'table' || !q.table) return '';
  let k = 0;
  const cell = (c: string) => {
    if (c.trim() !== '?') return `<td>${math(c)}</td>`;
    const v = fill ? fill[k++] ?? '' : '';
    return `<td class="${fill ? 'fill' : 'blank'}">${math(v)}</td>`;
  };
  return `<table class="tab">${q.table.header.length ? `<tr>${q.table.header.map(h => `<th>${math(h)}</th>`).join('')}</tr>` : ''}${q.table.rows.map(r => `<tr>${r.map(cell).join('')}</tr>`).join('')}</table>`;
}

function task(q: Question, i: number, pts: number | undefined, mathy: boolean) {
  const fig = sanitizeSvg(q.figure);
  const opts = q.type === 'choice' && q.options?.length
    ? `<div class="opts${q.options.every(o => o.length <= 14) ? ' two' : ''}">${q.options.map((o, k) => `<div class="opt"><span class="box"></span><span class="ol">${String.fromCharCode(97 + k)})</span>${math(o)}</div>`).join('')}</div>` : '';
  return `<section class="task">
    <div class="tn">${i + 1}</div>
    <div class="tb">
      <div class="q">${math(q.q)}</div>
      ${q.paper ? '<div class="hint">✏️ Mit Bleistift, Geodreieck und Zirkel zeichnen.</div>' : ''}
      ${fig ? `<div class="fig">${fig}</div>` : ''}${opts}${tableHtml(q)}${space(q, pts ?? 2, mathy)}
    </div>
    ${pts ? `<div class="pbox"><span class="got"></span><span class="max">/ ${pts}</span></div>` : ''}
  </section>`;
}

const CSS = `
@page { size: A4; margin: 15mm 14mm 16mm 16mm;
  @bottom-left { content: "${BRAND.name}"; font: 8pt Arial, sans-serif; color: #8a8fa8; }
  @bottom-right { content: "Seite " counter(page) " von " counter(pages); font: 8pt Arial, sans-serif; color: #8a8fa8; } }
* { box-sizing: border-box; }
body { font: 11pt/1.5 Arial, Helvetica, sans-serif; color: #15182b; margin: 0; background: #fff; }
.bar { position: sticky; top: 0; z-index: 2; background: #5b4cf0; color: #fff; padding: 12px 16px; display: flex; gap: 12px; align-items: center; font-weight: 700; }
.bar button { font: inherit; padding: 10px 18px; border-radius: 10px; border: 0; background: #fff; color: #5b4cf0; cursor: pointer; }
.page { max-width: 180mm; margin: 0 auto; padding: 8mm 14px 12mm; }
.top { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2.5px solid #15182b; padding-bottom: 3mm; margin-bottom: 4mm; gap: 6mm; }
.kind { font-size: 8.5pt; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #5b4cf0; }
h1 { font-size: 19pt; line-height: 1.2; margin: 1mm 0 0; }
.subj { font-size: 11pt; color: #4a4f6a; margin-top: 1mm; }
.badge { flex: none; border: 1.5px solid #5b4cf0; color: #5b4cf0; border-radius: 99px; padding: 1.5mm 4mm; font-size: 9pt; font-weight: 700; white-space: nowrap; }
.badge.red { border-color: #c62839; color: #c62839; }
.info { display: grid; grid-template-columns: 2.2fr 1fr 1.3fr 1fr; border: 1.5px solid #15182b; border-radius: 3mm; overflow: hidden; margin-bottom: 4mm; }
.info div { padding: 1.8mm 3mm; min-height: 12mm; border-right: 1px solid #c9ccd9; border-top: 1px solid #c9ccd9; }
.info div:nth-child(-n+4) { border-top: 0; } .info div:nth-child(4n) { border-right: 0; }
.info .lbl { display: block; font-size: 7.5pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #6b7088; }
.info .val { font-size: 11pt; font-weight: 700; }
.info .wide { grid-column: span 2; }
.note { display: flex; gap: 4mm; background: #f2f3f9; border-radius: 3mm; padding: 2.5mm 4mm; font-size: 9.5pt; color: #3a3e57; margin-bottom: 6mm; }
.note b { color: #15182b; }
.task { display: grid; grid-template-columns: 9mm 1fr 17mm; gap: 3mm; break-inside: avoid; padding: 4mm 0; border-top: 1px solid #dfe1ea; }
.task:first-of-type { border-top: 0; }
.tn { width: 8mm; height: 8mm; border-radius: 50%; background: #15182b; color: #fff; font-weight: 700; font-size: 11pt; display: flex; align-items: center; justify-content: center; margin-top: .3mm; }
.q { font-size: 11.5pt; margin: .8mm 0 2mm; }
.hint { font-size: 9pt; color: #6b7088; margin: -1mm 0 2mm; }
.pbox { align-self: start; border: 1.5px solid #15182b; border-radius: 2mm; height: 11mm; display: flex; align-items: flex-end; justify-content: flex-end; padding: 0 2mm 1.2mm; gap: 1mm; }
.pbox .max { font-size: 9pt; color: #4a4f6a; white-space: nowrap; }
.fig { margin: 2mm 0; text-align: center; } .fig svg { max-width: 110mm; max-height: 55mm; width: auto; height: auto; }
.opts { display: grid; gap: 2.2mm; margin: 1mm 0 0 1mm; } .opts.two { grid-template-columns: 1fr 1fr; }
.opt { display: flex; gap: 2.5mm; align-items: center; }
.ol { color: #6b7088; font-size: 9.5pt; }
.box { width: 4.5mm; height: 4.5mm; border: 1.3px solid #15182b; border-radius: .8mm; display: inline-block; flex: none; }
.box.on { background: #15182b; }
.tab { border-collapse: collapse; margin: 1mm 0 2mm; }
.tab td, .tab th { border: 1px solid #15182b; min-width: 20mm; height: 9mm; padding: 1mm 3mm; text-align: center; }
.tab th { background: #f2f3f9; font-size: 10pt; }
.tab td.fill { font-weight: 700; color: #0e7a45; }
.sp { border: 1px solid #b9bccb; border-radius: 1.5mm; margin-top: 2mm; }
.sp.lines { border: 0; border-radius: 0; background: repeating-linear-gradient(to bottom, transparent 0 8.6mm, #9a9eb3 8.6mm 9mm); }
.sp.grid { background-image: linear-gradient(#d3d5e0 1px, transparent 1px), linear-gradient(90deg, #d3d5e0 1px, transparent 1px); background-size: 5mm 5mm; background-position: -1px -1px; }
.fr { display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; font-size: .85em; line-height: 1.05; margin: 0 2px; }
.fr span:first-child { border-bottom: 1px solid currentColor; padding: 0 2px; }
h2 { font-size: 12pt; margin: 8mm 0 2.5mm; letter-spacing: .02em; }
.pts { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-bottom: 4mm; }
.pts td, .pts th { border: 1px solid #15182b; text-align: center; padding: 1.5mm 1mm; }
.pts th { background: #f2f3f9; font-weight: 700; } .pts th:first-child { text-align: left; width: 22mm; }
.pts td.e { height: 9mm; }
.end { text-align: center; margin-top: 6mm; font-size: 10pt; color: #4a4f6a; }
.sol { width: 100%; border-collapse: collapse; }
.sol td { border-top: 1px solid #dfe1ea; padding: 3mm 2mm; vertical-align: top; }
.sol tr { break-inside: avoid; }
.sol .n { width: 9mm; } .sol .n span { display: inline-flex; width: 7mm; height: 7mm; border-radius: 50%; background: #15182b; color: #fff; font-weight: 700; font-size: 10pt; align-items: center; justify-content: center; }
.sol .qq { color: #6b7088; font-size: 9pt; margin-bottom: 1.5mm; }
.sol .a { font-weight: 700; font-size: 11.5pt; color: #0e7a45; }
.sol .p { width: 22mm; text-align: right; font-size: 9pt; color: #4a4f6a; white-space: nowrap; }
.sol .p b { display: block; font-size: 11pt; color: #15182b; }
.sol .chk { font-size: 9pt; color: #6b7088; margin-top: 1.5mm; }
.key { width: 100%; border-collapse: collapse; text-align: center; font-size: 10pt; }
.key th, .key td { border: 1px solid #15182b; padding: 1.8mm 1mm; } .key th { background: #f2f3f9; } .key th:first-child, .key td:first-child { width: 28mm; text-align: left; padding-left: 3mm; }
.keep { break-inside: avoid; }
.tips { font-size: 9.5pt; color: #3a3e57; padding-left: 5mm; margin: 0; } .tips li { margin-bottom: 1mm; }
@media print { .bar { display: none; } .page { padding: 0; max-width: none; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
@media screen and (max-width: 600px) { .info { grid-template-columns: 1fr 1fr; } .info div:nth-child(n) { border-top: 1px solid #c9ccd9; border-right: 1px solid #c9ccd9; } .info div:nth-child(2n) { border-right: 0; } .info .wide { grid-column: span 2; } .task { grid-template-columns: 8mm 1fr; } .pbox { grid-column: 2; justify-self: end; width: 22mm; } .opts.two { grid-template-columns: 1fr; } .top { flex-direction: column; align-items: flex-start; } }
`;

/** Notenschlüssel nach gängigen Prozentgrenzen, als Mindestpunktzahl je Note */
function gradeKey(total: number) {
  const cut = [0.92, 0.81, 0.67, 0.5, 0.3, 0].map(p => Math.ceil(total * p * 2) / 2);
  return `<table class="key"><tr><th>Note</th>${[1, 2, 3, 4, 5, 6].map(n => `<th>${n}</th>`).join('')}</tr>
    <tr><td>ab Punkten</td>${cut.map(c => `<td>${String(c).replace('.', ',')}</td>`).join('')}</tr></table>`;
}

const doc = (title: string, body: string) => `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${CSS}</style></head><body>${body}</body></html>`;

export function sheetHtml(sheet: Worksheet, o: { name: string; grade?: string; subject: string; solutions?: boolean }) {
  const pts = sheet.exam?.points ?? [];
  const total = pts.reduce((a, b) => a + b, 0);
  const mathy = /mathe|geometrie|physik/i.test(o.subject + sheet.title);
  const title = esc(sheet.title.replace(/^(Schwachstellen|Nochmal):\s*/, '').replace(new RegExp(`^${o.subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*`), ''));
  const kind = sheet.exam ? 'Probe-Klassenarbeit' : 'Übung';
  const bar = `<div class="bar"><span style="flex:1">${o.solutions ? 'Lösungsblatt' : kind}: im Druckmenü „Als PDF sichern“ oder Drucker wählen</span><button onclick="window.print()">Drucken / PDF</button></div>`;
  const top = (badge: string, red = false) => `<div class="top"><div><div class="kind">${o.solutions ? `Lösungsblatt · ${kind}` : kind}</div><h1>${title}</h1><div class="subj">${esc(o.subject)}${o.grade ? ` · Klasse ${esc(o.grade)}` : ''}</div></div><div class="badge${red ? ' red' : ''}">${badge}</div></div>`;

  if (o.solutions) {
    const rows = sheet.questions.map((q, i) => {
      const sol = q.solution.split('|').map(x => x.trim());
      const answer = q.type === 'table' && q.table ? tableHtml(q, sol)
        : q.type === 'choice' && q.options?.length ? `<div class="opts${q.options.every(x => x.length <= 14) ? ' two' : ''}">${q.options.map(op => `<div class="opt"><span class="box${op === q.solution ? ' on' : ''}"></span>${op === q.solution ? `<span class="a">${math(op)}</span>` : `<span style="color:#8a8fa8">${math(op)}</span>`}</div>`).join('')}</div>`
        : `<div class="a">${math(q.solution)}</div>`;
      const skill = sheet.exam?.skills[i];
      return `<tr><td class="n"><span>${i + 1}</span></td><td><div class="qq">${math(q.q.length > 160 ? q.q.slice(0, 157) + '…' : q.q)}</div>${answer}${q.paper ? '<div class="chk">Zeichnung nachmessen: 1 bis 2 mm oder 1 bis 2 Grad Abweichung sind in Ordnung.</div>' : ''}</td><td class="p">${pts[i] ? `<b>${ptsWord(pts[i])}</b>` : ''}${skill ? esc(skill) : ''}</td></tr>`;
    }).join('');
    return doc(`Lösungen ${title}`, `${bar}<div class="page">
      ${top('🔒 Nur für Eltern', true)}
      <div class="note"><div><b>${esc(o.name)}</b>${total ? ` · ${total} Punkte gesamt` : ''}${sheet.exam ? ` · ${sheet.exam.minutes} Minuten` : ''}</div></div>
      <table class="sol">${rows}</table>
      ${total ? `<div class="keep"><h2>Notenschlüssel (Richtwert)</h2>${gradeKey(total)}</div>` : ''}
      <div class="keep"><h2>So korrigieren</h2>
      <ul class="tips"><li>Richtiger Rechenweg mit kleinem Fehler: Teilpunkte geben, halbe Punkte sind möglich.</li><li>Folgefehler nur einmal abziehen.</li><li>Andere richtige Schreibweisen zählen, zum Beispiel 0,75 statt 3/4, wenn Kürzen nicht verlangt war.</li><li>Danach in der App die Punkte je Aufgabe eintragen. Die App zeigt Note und Schwachstellen.</li></ul></div>
    </div>`);
  }

  const info = `<div class="info">
    <div><span class="lbl">Name</span><span class="val">${esc(o.name)}</span></div>
    <div><span class="lbl">Klasse</span><span class="val">${esc(o.grade ?? '')}</span></div>
    <div><span class="lbl">Datum</span></div>
    <div><span class="lbl">Zeit</span><span class="val">${sheet.exam ? `${sheet.exam.minutes} Min.` : ''}</span></div>
    <div class="wide"><span class="lbl">Note</span></div>
    <div class="wide"><span class="lbl">Unterschrift Eltern</span></div>
  </div>`;
  const tools = sheet.questions.some(q => q.paper) ? ' Du brauchst Bleistift, Geodreieck und Zirkel.' : '';
  const note = `<div class="note"><div><b>So geht's:</b> Lies jede Aufgabe genau. Schreib deine Rechenwege auf, sie geben auch Punkte.${tools} ${sheet.exam ? 'Die Punktekästchen füllen Mama oder Papa aus.' : ''}</div></div>`;
  const score = pts.length ? `<table class="pts"><tr><th>Aufgabe</th>${pts.map((_, i) => `<th>${i + 1}</th>`).join('')}<th>Summe</th></tr>
    <tr><th>möglich</th>${pts.map(p => `<td>${p}</td>`).join('')}<td><b>${total}</b></td></tr>
    <tr><th>erreicht</th>${pts.map(() => '<td class="e"></td>').join('')}<td class="e"></td></tr></table>` : '';
  return doc(`${esc(o.subject)} ${title}`, `${bar}<div class="page">
    ${top(sheet.exam ? `${sheet.questions.length} Aufgaben · ${total} Punkte` : `${sheet.questions.length} Aufgaben`)}${info}${score}${note}
    ${sheet.questions.map((q, i) => task(q, i, pts[i], mathy)).join('')}
    <div class="end">Viel Erfolg! 🍀 Wenn du fertig bist: alle Seiten in ${BRAND.name} fotografieren oder Mama oder Papa geben.</div>
  </div>`);
}

/** Druckt fertiges HTML. Im Browser in einem neuen Tab mit Druckknopf (dort auch „Als PDF sichern“),
 *  wird der Tab blockiert, über einen unsichtbaren Rahmen. In der App über expo-print. */
export async function printHtml(html: string): Promise<void> {
  if (Platform.OS !== 'web') { const Print = await import('expo-print'); await Print.printAsync({ html }); return; }
  const withBar = html.includes('class="bar"') ? html : html.replace(/<body([^>]*)>/i, `<body$1><style>@media print{.bar{display:none}}</style><div class="bar" style="position:sticky;top:0;background:#5b4cf0;color:#fff;padding:12px 16px;display:flex;gap:12px;align-items:center;font:700 15px Arial"><span style="flex:1">Druckansicht: im Druckmenü „Als PDF sichern“ oder Drucker wählen</span><button onclick="window.print()" style="font:inherit;padding:10px 18px;border-radius:10px;border:0;background:#fff;color:#5b4cf0">Drucken / PDF</button></div>`);
  const url = URL.createObjectURL(new Blob([withBar], { type: 'text/html' }));
  setTimeout(() => URL.revokeObjectURL(url), 300000);
  if (window.open(url, '_blank')) return;
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  f.srcdoc = html;
  f.onload = () => { f.contentWindow?.focus(); f.contentWindow?.print(); setTimeout(() => f.remove(), 60000); };
  document.body.appendChild(f);
}
