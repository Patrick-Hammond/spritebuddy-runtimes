// The examples playground: a list of examples, the selected one's code in an editor, and the
// example running beside it. Editing the code runs it again. Bundled into dist/playground.js
// by scripts/build-playground.mjs (CodeMirror comes from npm).
import { basicSetup, EditorView } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { examples, groups } from '../list.js';

const $ = (id) => document.getElementById(id);
const RERUN_AFTER = 600; // ms after the last keystroke

/** The code each example started with, and your edits to it, by id. */
const original = new Map();
const edits = new Map();
let current;
let runs = 0;
let timer;
let loading = false;

const editor = new EditorView({
  parent: $('editor'),
  extensions: [
    basicSetup,
    javascript(),
    oneDark,
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (!update.docChanged || loading) return;
      edits.set(current.id, update.state.doc.toString());
      clearTimeout(timer);
      timer = setTimeout(run, RERUN_AFTER);
    }),
  ],
});

// The preview page asks for the code to run here, so it runs your edits.
window.playground = {
  code: (id) => edits.get(id) ?? original.get(id),
  get editor() {
    return editor;
  },
};

// The sidebar: one heading per engine, one link per example.
for (const group of groups) {
  const section = document.createElement('section');
  const heading = document.createElement('h3');
  heading.textContent = group.name;
  section.append(heading);
  for (const example of group.examples) {
    const link = document.createElement('a');
    link.href = `#${example.id}`;
    link.textContent = example.title;
    link.dataset.id = example.id;
    section.append(link);
  }
  $('list').append(section);
}

$('filter').addEventListener('input', () => {
  const words = $('filter').value.toLowerCase().split(/\s+/).filter(Boolean);
  for (const section of $('list').children) {
    let shown = 0;
    for (const link of section.querySelectorAll('a')) {
      const example = examples.find((e) => e.id === link.dataset.id);
      const text = `${example.group} ${example.title} ${example.about}`.toLowerCase();
      link.hidden = !words.every((w) => text.includes(w));
      if (!link.hidden) shown++;
    }
    section.hidden = shown === 0;
  }
});

$('run').addEventListener('click', run);
$('reset').addEventListener('click', () => {
  edits.delete(current.id);
  show(original.get(current.id));
  run();
});
addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    run();
  }
});
addEventListener('hashchange', select);
select();

/** Shows the example the address names (#pixi/lighting), or the first one. */
async function select() {
  const id = decodeURIComponent(location.hash.slice(1));
  const example = examples.find((e) => e.id === id) ?? examples.find((e) => !e.link);
  current = example;
  clearTimeout(timer);
  for (const link of $('list').querySelectorAll('a')) {
    if (link.dataset.id === example.id) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  $('title').textContent = `${example.group}: ${example.title}`;
  $('about').textContent = example.about;
  $('uses').textContent = example.uses;
  document.title = `${example.title} · SpriteBuddy examples`;

  const external = Boolean(example.link);
  $('workspace').hidden = external;
  $('external').hidden = !external;
  for (const id of ['run', 'reset', 'open']) $(id).hidden = external;
  if (external) {
    $('preview').src = 'about:blank';
    $('external-text').textContent = example.about;
    $('external-link').href = example.link;
    return;
  }

  $('open').href = `./run.html?example=${example.id}`;
  if (!original.has(example.id)) {
    const response = await fetch(`./src/${example.id}.js`);
    original.set(example.id, await response.text());
    if (current !== example) return; // another was picked while this loaded
  }
  show(edits.get(example.id) ?? original.get(example.id));
  run();
}

/** Puts code in the editor without counting it as an edit. */
function show(code) {
  loading = true;
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: code } });
  loading = false;
}

/** Runs the current example in a fresh page, so nothing from the last run is left behind. */
function run() {
  clearTimeout(timer);
  const edited = edits.has(current.id) ? '&edited' : '';
  $('preview').src = `./run.html?example=${current.id}${edited}&run=${++runs}`;
  $('reset').disabled = !edits.has(current.id);
}
