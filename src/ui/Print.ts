import { Platform } from 'react-native';
import { Question, Worksheet } from '../data/types';
import { sanitizeSvg } from './Math';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Brüche als echte Bruchschreibweise, wie in der App */
const math = (t: string) => esc(t).replace(/(\d+)\s*\/\s*(\d+)/g, '<span class="fr"><span>$1</span><span>$2</span></span>').replace(/\n/g, '<br>');

function space(q: Question, pts: number, mathy: boolean): string {
  if (q.type === 'choice' || (q.type === 'table' && !q.paper)) return '';
  const kind = q.space ?? (q.paper ? 'blank' : mathy ? 'grid' : 'lines');
  const size = Math.min(12, Math.max(1, Math.round(q.size ?? (q.paper ? 7 : Math.min(8, 1 + pts)))));
  return `<div class="sp ${kind}" style="height:${size * (kind === 'lines' ? 9 : 10)}mm"></div>`;
}

function task(q: Question, i: number, pts: number | undefined, mathy: boolean) {
  const fig = sanitizeSvg(q.figure);
  const opts = q.type === 'choice' && q.options?.length
    ? `<div class="opts">${q.options.map(o => `<div class="opt"><span class="box"></span>${math(o)}</div>`).join('')}</div>` : '';
  const tab = q.type === 'table' && q.table
    ? `<table class="tab">${q.table.header.length ? `<tr>${q.table.header.map(h => `<th>${math(h)}</th>`).join('')}</tr>` : ''}${q.table.rows.map(r => `<tr>${r.map(c => `<td>${c.trim() === '?' ? '' : math(c)}</td>`).join('')}</tr>`).join('')}</table>` : '';
  return `<section class="task">
    <div class="th"><b>Aufgabe ${i + 1}</b>${pts ? `<span>${pts} ${pts === 1 ? 'Punkt' : 'Punkte'}</span>` : ''}</div>
    <div class="q">${math(q.q)}</div>
    ${fig ? `<div class="fig">${fig}</div>` : ''}${opts}${tab}${space(q, pts ?? 2, mathy)}
  </section>`;
}

const CSS = `
@page { size: A4; margin: 16mm 15mm 16mm 18mm; }
* { box-sizing: border-box; }
body { font: 11.5pt/1.45 Arial, Helvetica, sans-serif; color: #000; margin: 0; }
.bar { position: sticky; top: 0; background: #5b4cf0; color: #fff; padding: 12px 16px; display: flex; gap: 12px; align-items: center; font-weight: 700; }
.bar button { font: inherit; padding: 10px 18px; border-radius: 10px; border: 0; background: #fff; color: #5b4cf0; cursor: pointer; }
.page { max-width: 176mm; margin: 0 auto; padding: 8mm 12px; }
.head { border: 1.5px solid #000; display: grid; grid-template-columns: 1fr 1fr 1fr; }
.head div { padding: 6px 8px; border-right: 1px solid #000; border-bottom: 1px solid #000; min-height: 12mm; }
.head div:nth-child(3n) { border-right: 0; }
.head .lbl { font-size: 8pt; text-transform: uppercase; color: #444; display: block; }
h1 { font-size: 16pt; margin: 6mm 0 1mm; }
.sub { color: #333; margin-bottom: 4mm; }
.pts { width: 100%; border-collapse: collapse; margin: 0 0 6mm; font-size: 9.5pt; }
.pts td, .pts th { border: 1px solid #000; text-align: center; padding: 3px 2px; }
.pts td { height: 9mm; }
.task { break-inside: avoid; margin: 0 0 6mm; }
.th { display: flex; justify-content: space-between; border-bottom: 1px solid #000; margin-bottom: 2mm; }
.th span { font-size: 9.5pt; }
.q { margin-bottom: 2mm; }
.fig { margin: 2mm 0; text-align: center; } .fig svg { max-width: 120mm; height: auto; }
.opts { display: grid; gap: 2mm; margin: 2mm 0 0 2mm; }
.opt { display: flex; gap: 3mm; align-items: center; }
.box { width: 4.5mm; height: 4.5mm; border: 1.3px solid #000; display: inline-block; flex: none; }
.tab { border-collapse: collapse; margin: 2mm 0; } .tab td, .tab th { border: 1px solid #000; min-width: 22mm; height: 9mm; padding: 2px 6px; text-align: center; }
.sp { border: 1px solid #999; margin-top: 2mm; }
.sp.lines { border: 0; background: repeating-linear-gradient(to bottom, transparent 0 8.6mm, #888 8.6mm 9mm); }
.sp.grid { background-image: linear-gradient(#bbb 1px, transparent 1px), linear-gradient(90deg, #bbb 1px, transparent 1px); background-size: 5mm 5mm; }
.fr { display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; font-size: 0.85em; line-height: 1.05; margin: 0 2px; }
.fr span:first-child { border-bottom: 1px solid #000; padding: 0 2px; }
.sol li { margin-bottom: 3mm; break-inside: avoid; }
.foot { margin-top: 8mm; font-size: 9pt; color: #444; }
@media print { .bar { display: none; } .page { padding: 0 1.5mm 0 0; max-width: none; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
`;

export function sheetHtml(sheet: Worksheet, o: { name: string; grade?: string; subject: string; solutions?: boolean }) {
  const pts = sheet.exam?.points ?? [];
  const total = pts.reduce((a, b) => a + b, 0);
  const mathy = /mathe|geometrie|physik/i.test(o.subject + sheet.title);
  const title = esc(sheet.title.replace(new RegExp(`^${o.subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*`), ''));
  const bar = `<div class="bar"><span style="flex:1">${o.solutions ? 'Lösungsblatt' : 'Probe-Klassenarbeit'}: im Druckmenü „Als PDF sichern“ oder Drucker wählen</span><button onclick="window.print()">Drucken / PDF</button></div>`;
  if (o.solutions) {
    return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lösungen ${title}</title><style>${CSS}</style></head><body>${bar}<div class="page">
      <h1>Lösungen: ${esc(o.subject)}, ${title}</h1><div class="sub">Für Eltern. ${esc(o.name)}${total ? ` · ${total} Punkte gesamt` : ''}</div>
      <ol class="sol">${sheet.questions.map((q, i) => `<li><b>${math(q.solution.replace(/\s*\|\s*/g, '  |  '))}</b>${pts[i] ? ` <span style="color:#555">(${pts[i]} P.${sheet.exam?.skills[i] ? `, ${esc(sheet.exam.skills[i])}` : ''})</span>` : ''}${q.paper ? '<br><span style="color:#555">Zeichnung prüfen: Maße mit dem Geodreieck nachmessen, kleine Abweichungen (1 bis 2 mm, 1 bis 2 Grad) sind in Ordnung.</span>' : ''}</li>`).join('')}</ol>
      ${total ? `<p><b>Notenschlüssel (Richtwert):</b> 1 ab ${Math.ceil(total * 0.92)} · 2 ab ${Math.ceil(total * 0.81)} · 3 ab ${Math.ceil(total * 0.67)} · 4 ab ${Math.ceil(total * 0.5)} · 5 ab ${Math.ceil(total * 0.3)} Punkten</p>` : ''}
    </div></body></html>`;
  }
  const head = `<div class="head">
    <div><span class="lbl">Name</span>${esc(o.name)}</div><div><span class="lbl">Klasse</span>${esc(o.grade ?? '')}</div><div><span class="lbl">Datum</span></div>
    <div><span class="lbl">Fach</span>${esc(o.subject)}</div><div><span class="lbl">Zeit</span>${sheet.exam ? `${sheet.exam.minutes} Minuten` : ''}</div><div><span class="lbl">Note</span></div>
  </div>`;
  const ptsTable = pts.length ? `<table class="pts"><tr><th>Aufgabe</th>${pts.map((_, i) => `<th>${i + 1}</th>`).join('')}<th>Summe</th></tr>
    <tr><th>möglich</th>${pts.map(p => `<td style="height:auto">${p}</td>`).join('')}<td style="height:auto">${total}</td></tr>
    <tr><th>erreicht</th>${pts.map(() => '<td></td>').join('')}<td></td></tr></table>` : '';
  const tools = sheet.questions.some(q => q.paper) ? '<div class="sub">Du brauchst: Bleistift, Geodreieck, Zirkel.</div>' : '';
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.subject)} ${title}</title><style>${CSS}</style></head><body>${bar}<div class="page">
    ${head}<h1>${esc(o.subject)}: ${title}</h1>${tools}${ptsTable}
    ${sheet.questions.map((q, i) => task(q, i, pts[i], mathy)).join('')}
    <div class="foot">Viel Erfolg! Wenn du fertig bist, gib das Blatt Mama oder Papa zum Korrigieren.</div>
  </div></body></html>`;
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
