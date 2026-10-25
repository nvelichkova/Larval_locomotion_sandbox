// params.js — list every parameter you can set in a sweep config.
//
//   node params.js                 every parameter, with its group
//   node params.js patch memory    only ones matching a word
//   node params.js --json          machine-readable
//
// The ids are what go in `params: { ... }` in a config; the label is what the
// slider is called in the page. Ranges are the slider's own limits — the model
// is not guaranteed to behave sensibly outside them, and `feasible.js` is the
// check for whether a setting still reproduces the measured kinematics.
//
// Buttons (genotype, food, arena) are not parameters: they are presets that
// rewrite several sliders at once, so they go in `buttons: [...]` instead, and
// they are applied BEFORE params. The list is printed at the end.

const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, 'larval_locomotion_sandbox.html');

/* labels in the page are HTML, so they carry entities */
const ENT = { '&mu;': 'mu', '&lambda;': 'lambda', '&tau;': 'tau', '&amp;': '&',
  '&deg;': 'deg', '&middot;': '·', '&times;': 'x', '&nbsp;': ' ' };
const txt = (x) => x.replace(/&\w+;/g, (e) => ENT[e] !== undefined ? ENT[e] : e).trim();

function parse() {
  const html = fs.readFileSync(APP, 'utf8');
  const out = [];
  // each slider sits in a .row with a <label title="..."><span>Name</span>
  const re = /<label title="([^"]*)"><span>([^<]*)<\/span>[\s\S]{0,120}?<input type="range" id="(\w+)"\s+min="([-\d.]+)"\s+max="([-\d.]+)"\s+step="([-\d.]+)"\s+value="([-\d.]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    out.push({ id: m[3], label: txt(m[2]), min: +m[4], max: +m[5],
      step: +m[6], default: +m[7], note: txt(m[1]) });
  }
  // group headings, so the listing matches the page's own layout
  const groups = [];
  const gre = /data-grp="(\w+)"/g;
  let g;
  while ((g = gre.exec(html))) if (!groups.includes(g[1])) groups.push(g[1]);
  return { params: out, groups };
}

function buttons() {
  const html = fs.readFileSync(APP, 'utf8');
  const out = [];
  const re = /<button id="([a-z]_\w+|mix)"[^>]*>([^<]*)</g;
  let m;
  while ((m = re.exec(html))) out.push({ id: m[1], label: txt(m[2]) });
  return out;
}

function main() {
  const { params } = parse();
  const btns = buttons();
  const args = process.argv.slice(2);

  if (args.includes('--json')) {
    console.log(JSON.stringify({ params, buttons: btns }, null, 2));
    return;
  }

  const words = args.filter((a) => !a.startsWith('--')).map((w) => w.toLowerCase());
  const hit = (p) => !words.length || words.some((w) =>
    p.id.toLowerCase().includes(w) || p.label.toLowerCase().includes(w) ||
    p.note.toLowerCase().includes(w));
  const show = params.filter(hit);

  console.log(`${show.length} of ${params.length} parameters` +
    (words.length ? ` matching ${words.join(', ')}` : '') + '\n');
  console.log('  The default is the page\'s starting value. A preset button may');
  console.log('  overwrite it (the rover preset sets `per` to 0.90), and buttons are');
  console.log('  applied first, so a param you also set in `params` wins.');
  console.log('  Sweeps are NOT clamped to the slider range - the ocmp dose-response');
  console.log('  deliberately runs to 6 against a slider max of 3.');
  console.log('  per, rt and pf are DERIVED: the model recomputes them from the');
  console.log('  genotype and substrate every frame, so sweeping one of them gives');
  console.log('  identical conditions. Change the preset or the substrate instead.\n');
  console.log('  id'.padEnd(12) + 'label'.padEnd(010 + 12) + 'default'.padStart(9) +
    '   range');
  console.log('  ' + '-'.repeat(62));
  const DERIVED = new Set(['per', 'rt', 'pf']);
  for (const p of show) {
    console.log('  ' + p.id.padEnd(10) + p.label.padEnd(22) +
      String(p.default).padStart(9) + '   ' + `${p.min} – ${p.max}` +
      (DERIVED.has(p.id) ? '   [derived - cannot be swept]' : ''));
  }

  if (!words.length) {
    console.log('\n  buttons (presets — go in `buttons: [...]`, applied before params)\n');
    for (const b of btns) console.log('  ' + b.id.padEnd(12) + b.label);
    console.log(`
  use in a config:

    module.exports = {
      duration: 1800, seeds: 20,
      buttons: ['s_yeast', 'm_p4', 'mix'],      // yeast, 4 patches, mixed quality
      base: { aw: 250, pr: 18 },                 // applied to every condition
      conditions: {
        on:  { params: { ocmp: 1.2 } },
        off: { params: { ocmp: 0 } },
      },
    };
`);
  } else {
    console.log('');
    for (const p of show) if (p.note) console.log(`  ${p.id}: ${p.note}`);
    console.log('');
  }
}

if (require.main === module) main();
module.exports = { parse, buttons };
