// Exercise interaction state without a browser or third-party test packages.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup() {
  const html = fs.readFileSync(path.join(__dirname, '../rocket_ui/index.html'), 'utf8');
  const nodes = new Map();
  const element = () => ({ style: {}, dataset: {}, children: [], _value: '', checked: false,
    get value() { return this._value; }, set value(value) { this._value = String(value); },
    classList: { toggle() {} }, setAttribute() {}, addEventListener(name, fn) { this[name] = fn; },
    querySelector() { return element(); }, checkValidity() { return true; },
    append(...children) { this.children.push(...children); }, replaceChildren() { this.children = []; },
    getContext() { return {}; }, focus() {} });
  for (const match of html.matchAll(/id="([^"]+)"/g)) nodes.set(match[1], element());
  const node = (id) => { assert.ok(nodes.has(id), `Missing HTML element: ${id}`); return nodes.get(id); };
  node('seed').value = '100'; node('fresh-start').checked = true;
  const requests = [];
  let nextSeed = 200, failNext = false;
  function flight(policy, seed, interventions = []) {
    return { policy, seed, fps: 50, steps: 100, reward: 12, outcome: 'landed', model_steps: 1000,
      world: { pad: [8, 12, 3] }, interventions,
      frames: Array.from({ length: 101 }, (_, step) => ({ position: [10, 9 - step / 20],
        velocity: [0.1, -0.2], angle: 0, reward: step / 10, action: 2, contacts: [false, false] })) };
  }
  const context = vm.createContext({
    document: { getElementById: node, querySelectorAll() { return []; },
      querySelector() { return element(); }, addEventListener() {}, createElement: element },
    ResizeObserver: class { observe() {} }, requestAnimationFrame() {},
    URLSearchParams, crypto: { getRandomValues(array) { array[0] = nextSeed++; return array; } },
    fetch: async (url) => {
      requests.push(url);
      if (failNext) { failNext = false; throw new Error('Connection lost'); }
      if (url === '/api/status') return { ok: true, json: async () => ({
        policies: { trained: true, best: true, random: true }, benchmarks: {} }) };
      const query = new URLSearchParams(url.split('?')[1]);
      return { ok: true, json: async () => flight(query.get('policy'), Number(query.get('seed')),
        JSON.parse(query.get('interventions') || '[]')) };
    },
  });
  const source = fs.readFileSync(path.join(__dirname, '../rocket_ui/app.js'), 'utf8');
  vm.runInContext(source.replace(/\ninit\(\);\s*$/, '') +
    '\nglobalThis.api = { state, init, launch, pushCraft, setPlaying, refreshTelemetry, replay, finish, setMode };', context);
  return { api: context.api, node, requests, fail() { failNext = true; } };
}

test('fresh conditions, fixed seeds, branching, rewind, replay and failed requests', async () => {
  const { api, node, requests, fail } = setup();
  await api.init();
  await api.launch();
  const firstSeed = api.state.flights[0].seed;
  await api.launch();
  assert.notEqual(api.state.flights[0].seed, firstSeed);
  node('fresh-start').checked = false; node('seed').value = '100';
  await api.launch();
  assert.equal(api.state.flights[0].seed, 100);
  api.state.step = 10; api.setPlaying(false);
  await api.pushCraft(1);
  assert.equal(api.state.step, 10);
  assert.equal(api.state.playing, false);
  assert.match(requests.at(-1), /interventions=/);
  assert.equal(api.state.flights[0].interventions[0].step, 10);
  api.state.step = 20; api.setPlaying(true);
  await api.pushCraft(-1);
  assert.equal(api.state.playing, true);
  assert.equal(api.state.flights[0].interventions.length, 2);
  api.replay();
  assert.equal(api.state.step, 0);
  assert.equal(api.state.flights[0].interventions.length, 2);
  api.state.step = 5;
  await api.pushCraft(-1);
  assert.equal(api.state.flights[0].interventions.length, 1);
  assert.equal(api.state.flights[0].interventions[0].step, 5);
  const beforeFailure = api.state.flights[0];
  fail(); await api.pushCraft(1);
  assert.equal(api.state.flights[0], beforeFailure);
  assert.equal(api.state.busy, false);
  assert.equal(node('loading-overlay').hidden, true);
  assert.equal(node('push-right').disabled, false);
  api.state.step = api.state.maxSteps; api.finish();
  assert.equal(node('push-left').disabled, true);
  assert.equal(api.state.history[0].flight.interventions.length, 1);
  api.setMode('compare'); await api.launch();
  assert.equal(api.state.flights.length, 2);
  assert.equal(api.state.flights[0].seed, api.state.flights[1].seed);
  assert.equal(node('push-left').disabled, true);
});
