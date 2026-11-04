// @ts-nocheck
/* Геологическое ядро прототипа. Работает локально, без внешних сервисов. */
/* Исправленные функции второй вкладки «Извлечение из DXF».
 * Справочный вариант для ревизии 38b258d; не изменяет первую вкладку.
 * Запуск проверки: node geology_extractor_fix.js "Геология 3.11. 1.dxf" [--reviewed]
 * --reviewed применяет только ручное исключение TEXT handle 3034B («0,31»),
 * подтверждённое пользователем для конкретного DXF. Глобального фильтра 0,31 нет.
 */
'use strict';

const num = v => Number(String(v ?? '').trim().replace(',', '.'));
const finite = (...v) => v.every(Number.isFinite);
const close = (a, b, eps) => Math.abs(a - b) <= eps;

function parseDXF(content) {
  const lines = content.replace(/\r/g, '').split('\n');
  const out = { texts: [], circles: [], segments: [] };
  let entity = null, section = null, expectSection = false;

  function flush() {
    if (!entity) return;
    const g = entity.g;
    if (entity.type === 'TEXT' && finite(num(g[10]), num(g[20]))) {
      out.texts.push({ text: g[1] || '', x: num(g[10]), y: num(g[20]), handle: g[5] || '', layer: g[8] || '' });
    } else if (entity.type === 'CIRCLE' && finite(num(g[10]), num(g[20]), num(g[40]))) {
      out.circles.push({ x: num(g[10]), y: num(g[20]), r: num(g[40]), handle: g[5] || '' });
    } else if (entity.type === 'LINE') {
      out.segments.push({ x1: num(g[10]), y1: num(g[20]), x2: num(g[11]), y2: num(g[21]), layer: g[8] || '', handle: g[5] || '' });
    } else if (entity.type === 'LWPOLYLINE') {
      const v = entity.vertices;
      for (let i = 1; i < v.length; i++) {
        out.segments.push({ x1: v[i - 1][0], y1: v[i - 1][1], x2: v[i][0], y2: v[i][1], layer: g[8] || '', handle: g[5] || '' });
      }
      if ((Number(g[70] || 0) & 1) && v.length > 2) {
        out.segments.push({ x1: v[v.length - 1][0], y1: v[v.length - 1][1], x2: v[0][0], y2: v[0][1], layer: g[8] || '', handle: g[5] || '' });
      }
    }
    entity = null;
  }

  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim(), value = lines[i + 1].trim();
    if (code === '0') {
      flush();
      if (value === 'SECTION') expectSection = true;
      else if (value === 'ENDSEC') section = null;
      else if (section === 'ENTITIES' && ['TEXT', 'CIRCLE', 'LINE', 'LWPOLYLINE'].includes(value)) {
        entity = { type: value, g: {}, vertices: [] };
      }
      continue;
    }
    if (code === '2' && expectSection) {
      section = value;
      expectSection = false;
      continue;
    }
    if (!entity) continue;
    if (entity.type === 'LWPOLYLINE' && code === '10') {
      entity.vertices.push([num(value), NaN]);
      continue;
    }
    if (entity.type === 'LWPOLYLINE' && code === '20') {
      if (entity.vertices.length) entity.vertices[entity.vertices.length - 1][1] = num(value);
      continue;
    }
    entity.g[code] = value;
  }
  flush();
  return out;
}

function extractColumns(geo) {
  const geology = s => /ГЕОЛОГИЯ/i.test(s.layer || '');
  const verticals = geo.segments.filter(s => geology(s) && close(s.x1, s.x2, 0.06) && Math.abs(s.y2 - s.y1) >= 5)
    .map(s => ({ x: (s.x1 + s.x2) / 2, top: Math.max(s.y1, s.y2), bottom: Math.min(s.y1, s.y2), source: s }))
    .sort((a, b) => a.x - b.x);
  const used = new Set(), pairs = [];
  for (let i = 0; i < verticals.length; i++) {
    if (used.has(i)) continue;
    const a = verticals[i];
    let best = null;
    for (let j = i + 1; j < verticals.length; j++) {
      if (used.has(j)) continue;
      const b = verticals[j];
      if (!close(Math.abs(b.x - a.x), 2, 0.06) || !close(a.top, b.top, 0.12) || !close(a.bottom, b.bottom, 0.12)) continue;
      const score = Math.abs(Math.abs(b.x - a.x) - 2) + Math.abs(a.top - b.top) + Math.abs(a.bottom - b.bottom);
      if (!best || score < best.score) best = { j, b, score };
    }
    if (best) {
      used.add(i); used.add(best.j);
      pairs.push({ x: (a.x + best.b.x) / 2, sideTop: (a.top + best.b.top) / 2,
        sideBottom: (a.bottom + best.b.bottom) / 2, verticals: [a.source, best.b.source] });
    }
  }
  pairs.sort((a, b) => a.x - b.x);
  const merged = [];
  for (const p of pairs) {
    const last = merged[merged.length - 1];
    if (last && close(last.x, p.x, 0.3)) {
      if (p.sideTop - p.sideBottom > last.sideTop - last.sideBottom) merged[merged.length - 1] = p;
    } else merged.push(p);
  }
  const ticks = geo.segments.filter(s => geology(s) && close(s.y1, s.y2, 0.06) && close(Math.abs(s.x2 - s.x1), 2, 0.3))
    .map(s => ({ x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2, source: s }));
  const columns = [];
  for (const p of merged) {
    const levels = [];
    for (const t of ticks.filter(t => close(t.x, p.x, 0.3) && t.y <= p.sideTop + 0.12 && t.y >= p.sideBottom - 0.12).sort((a, b) => b.y - a.y)) {
      if (!levels.some(y => close(y, t.y, 0.35))) levels.push(t.y);
    }
    if (levels.length < 2) continue;
    columns.push({ ...p, levels, top: levels[0], bottom: levels[levels.length - 1], right: p.x + 1 });
  }
  return columns;
}

const nameRe = /(?:скв\.?|скважин)[\s._-]*[\wа-яё.-]+/i;

function assignNameAssignments(columns, texts) {
  const labels = [];
  for (const t of texts) {
    const raw = t.text.trim();
    if (nameRe.test(raw) && !/^скв\.?\s*$/i.test(raw)) labels.push(t);
    if (/^скв\.?\s*$/i.test(raw)) {
      const suffix = texts.filter(q => q !== t && /^(?:[А-ЯЁA-Z]{1,4}[-.]?\d+[А-ЯЁA-Z0-9/-]*|\d+[А-ЯЁA-Z0-9/-]*)$/i.test(q.text.trim()) &&
        Math.abs(q.x - t.x) < 12 && Math.abs(q.y - t.y) < 5)
        .sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y))[0];
      if (suffix) labels.push({ text: 'скв.' + suffix.text.trim(), x: (t.x + suffix.x) / 2, y: Math.max(t.y, suffix.y), handle: t.handle });
    }
  }
  const pairs = [];
  for (let i = 0; i < columns.length; i++) for (let j = 0; j < labels.length; j++) {
    const c = columns[i], t = labels[j], dx = Math.abs(t.x - c.x), dy = t.y - c.top;
    // В исходном DXF четыре настоящие подписи имеют dy=28…35; предел 22 их терял.
    if (dx <= 18 && dy >= -1 && dy <= 40) pairs.push({ i, j, score: dx + Math.abs(dy - 5) * 0.12 });
  }
  pairs.sort((a, b) => a.score - b.score);
  const names = columns.map((_, i) => 'Скв. ' + (i + 1));
  const nameHandles = columns.map(() => '');
  const usedI = new Set(), usedJ = new Set(), usedNames = new Set();
  for (const p of pairs) {
    const name = labels[p.j].text.trim(), key = name.toLowerCase();
    if (usedI.has(p.i) || usedJ.has(p.j) || usedNames.has(key)) continue;
    names[p.i] = name;
    nameHandles[p.i] = labels[p.j].handle || '';
    usedI.add(p.i); usedJ.add(p.j); usedNames.add(key);
  }
  return { names, nameHandles };
}

function assignNames(columns, texts) {
  return assignNameAssignments(columns, texts).names;
}

function buildCircleCodes(geo) {
  const codeRe = /^[0-9]+[а-яa-z]?$/i, codeTexts = new Set();
  const circles = geo.circles.map(c => {
    const candidates = geo.texts.filter(t => codeRe.test(t.text.trim()) && Math.hypot(t.x - c.x, t.y - c.y) <= c.r + 0.2)
      .sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y));
    const text = candidates[0] || null;
    if (text) codeTexts.add(text);
    return { ...c, text, code: text ? text.text.trim() : '' };
  });
  return { circles, codeTexts };
}

function extractDepths(columns, geo, circleCodes, soilScale = 100, ignoredHandles = new Set()) {
  const factor = 1000 / soilScale;
  return columns.map((w, i) => {
    const next = columns[i + 1];
    const rightLimit = next ? Math.min(w.x + 10, (w.x + next.x) / 2) : w.x + 10;
    const candidates = geo.texts.filter(t => /^\d+(?:[.,]\d+)?$/.test(t.text.trim()) && !circleCodes.codeTexts.has(t) &&
      t.x >= w.x + 1.3 && t.x < rightLimit && t.y <= w.sideTop + 1.5 && t.y >= w.sideBottom - 6 && num(t.text) > 0 && num(t.text) <= 100);
    const decimal = candidates.filter(t => /[.,]/.test(t.text));
    const medianX = decimal.length ? decimal.map(t => t.x).sort((a, b) => a - b)[Math.floor((decimal.length - 1) / 2)] : w.x + 3.5;
    const maxDepth = (w.sideTop - w.sideBottom) / factor + 0.11;
    const accepted = [], excluded = [];
    for (const t of candidates.sort((a, b) => b.y - a.y)) {
      const depth = num(t.text);
      let reason = '';
      if (ignoredHandles.has(t.handle)) reason = 'Исключено после ручной проверки конкретного DXF';
      else if (Math.abs(t.x - medianX) > 2.5) reason = 'Вне вертикального ряда подписей глубин';
      else if (depth > maxDepth) reason = 'Глубина больше геометрической длины колонки';
      else if (accepted.length && depth <= accepted[accepted.length - 1].depth + 0.005) reason = 'Нарушено возрастание глубин';
      if (reason) excluded.push({ text: t.text, handle: t.handle, x: t.x, y: t.y, reason });
      else accepted.push({ depth, y: t.y, text: t });
    }
    return { column: w, accepted, excluded, maxDepth };
  });
}

/* Топологическая привязка ИГЭ. Односторонняя граница даёт кандидата,
 * но конкурирующие разные коды остаются неоднозначными и не экспортируются как факт.
 */
function buildTopology(columns, geo) {
  const seen = new Set(), base = [];
  for (const s of geo.segments) {
    if (!/ГЕОЛОГИЯ/i.test(s.layer || '') || close(s.x1, s.x2, 0.06)) continue;
    const length = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    if (length <= 4.5) continue;
    const key = [s.x1, s.y1, s.x2, s.y2].map(v => v.toFixed(3)).join('|');
    if (!seen.has(key)) { seen.add(key); base.push(s); }
  }

  function makeGraph(segments) {
    const nodes = [], adj = [], segNodes = [];
    function nodeFor(x, y) {
      for (let i = 0; i < nodes.length; i++) if (close(nodes[i][0], x, 0.08) && close(nodes[i][1], y, 0.08)) return i;
      nodes.push([x, y]); adj.push(new Map());
      return nodes.length - 1;
    }
    for (const s of segments) {
      const a = nodeFor(s.x1, s.y1), b = nodeFor(s.x2, s.y2), w = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
      segNodes.push([a, b]); adj[a].set(b, w); adj[b].set(a, w);
    }
    const endInfo = new Map();
    for (let ni = 0; ni < nodes.length; ni++) {
      const [x, y] = nodes[ni];
      for (let ci = 0; ci < columns.length; ci++) {
        const c = columns[ci];
        if (!close(Math.abs(x - c.x), 1, 0.12)) continue;
        const bounds = [...c.levels, c.sideTop, c.sideBottom];
        const yy = bounds.reduce((best, v) => Math.abs(v - y) < Math.abs(best - y) ? v : best, bounds[0]);
        if (close(yy, y, 0.25)) {
          if (!endInfo.has(ni)) endInfo.set(ni, []);
          endInfo.get(ni).push({ ci, y: yy });
        }
      }
    }
    return { nodes, adj, segNodes, endInfo };
  }

  const initial = makeGraph(base), bridges = [];
  for (let ni = 0; ni < initial.nodes.length; ni++) {
    if (initial.adj[ni].size !== 1 || initial.endInfo.has(ni)) continue;
    const [x, y] = initial.nodes[ni];
    let best = null;
    for (let ci = 0; ci < columns.length; ci++) {
      const c = columns[ci];
      for (const side of [c.x - 1, c.x + 1]) {
        if (Math.abs(side - x) > 12) continue;
        for (const yy of new Set([...c.levels, c.sideTop, c.sideBottom])) {
          if (Math.abs(yy - y) > 0.6) continue;
          const d = Math.hypot(side - x, yy - y);
          if (!best || d < best.d) best = { d, side, yy };
        }
      }
    }
    if (best) bridges.push({ x1: x, y1: y, x2: best.side, y2: best.yy, layer: '01 ГЕОЛОГИЯ', bridge: true });
  }
  const segments = base.concat(bridges), graph = makeGraph(segments);

  function intersections(x) {
    const out = [];
    for (let si = 0; si < segments.length; si++) {
      const s = segments[si];
      if (x < Math.min(s.x1, s.x2) - 1e-6 || x > Math.max(s.x1, s.x2) + 1e-6 || close(s.x1, s.x2, 1e-9)) continue;
      const f = (x - s.x1) / (s.x2 - s.x1);
      out.push({ y: s.y1 + f * (s.y2 - s.y1), si });
    }
    return out;
  }

  function nearestEndpoint(si, ci) {
    const starts = graph.segNodes[si], dist = new Map(), queue = [];
    for (const n of starts) { dist.set(n, 0); queue.push([0, n]); }
    let best = null;
    while (queue.length) {
      queue.sort((a, b) => b[0] - a[0]);
      const [d, n] = queue.pop();
      if (d !== dist.get(n)) continue;
      for (const e of graph.endInfo.get(n) || []) {
        if (e.ci === ci && (!best || d < best.distance)) best = { distance: d, y: e.y };
      }
      for (const [m, w] of graph.adj[n]) {
        const nd = d + w;
        if (nd < (dist.get(m) ?? Infinity)) { dist.set(m, nd); queue.push([nd, m]); }
      }
    }
    return best;
  }

  return { segments, bridges, intersections, nearestEndpoint };
}

function circleColumnCode(circle, ci, bounds, topology) {
  const ints = topology.intersections(circle.x);
  const aboveList = ints.filter(z => z.y > circle.y), belowList = ints.filter(z => z.y < circle.y);
  const aboveHit = aboveList.length ? aboveList.reduce((a, b) => a.y < b.y ? a : b) : null;
  const belowHit = belowList.length ? belowList.reduce((a, b) => a.y > b.y ? a : b) : null;
  const above = aboveHit ? topology.nearestEndpoint(aboveHit.si, ci) : null;
  const below = belowHit ? topology.nearestEndpoint(belowHit.si, ci) : null;
  let topo = null, reason = '';
  if (above && below) {
    for (let j = 0; j < bounds.length - 1; j++) {
      if (close(bounds[j], above.y, 0.26) && close(bounds[j + 1], below.y, 0.26)) { topo = j; reason = 'above+below'; break; }
    }
  }
  if (topo === null && below) {
    for (let j = 0; j < bounds.length - 1; j++) if (close(bounds[j + 1], below.y, 0.26)) { topo = j; reason = 'below'; break; }
  }
  if (topo === null && above) {
    for (let j = 0; j < bounds.length - 1; j++) if (close(bounds[j], above.y, 0.26)) { topo = j; reason = 'above'; break; }
  }
  let vertical = null;
  for (let j = 0; j < bounds.length - 1; j++) {
    if (bounds[j] + 0.65 >= circle.y && circle.y >= bounds[j + 1] - 0.65) { vertical = j; break; }
  }
  return { topo, vertical, reason };
}

function assignCodes(columns, depths, circleCodes, topology, soilScale = 100) {
  const factor = 1000 / soilScale;
  return columns.map((c, ci) => {
    const previous = columns[ci - 1], next = columns[ci + 1];
    const nearby = circleCodes.circles.filter(o => o.code &&
      ((previous && previous.x + 1 < o.x && o.x < c.x - 1) || (next && c.x + 1 < o.x && o.x < next.x - 1)));
    const accepted = depths[ci].accepted;
    const bounds = [c.sideTop, ...accepted.map(a => c.sideTop - a.depth * factor)];
    return accepted.map((a, layer) => {
      const topo = [], vertical = [];
      for (const o of nearby) {
        const r = circleColumnCode(o, ci, bounds, topology);
        if (r.topo === layer) topo.push({ circle: o, ...r });
        else if (r.topo === null && r.vertical === layer) vertical.push({ circle: o, ...r });
      }
      const pool = topo.length ? topo : vertical;
      const distinct = [...new Set(pool.map(p => p.circle.code))];
      return {
        depth: a.depth,
        ige: distinct.length === 1 ? distinct[0] : '',
        status: distinct.length > 1 ? 'ambiguous' : topo.length ? 'topology' : vertical.length ? 'vertical-only' : 'not-found',
        candidates: pool.map(p => ({
          code: p.circle.code,
          x: p.circle.x,
          y: p.circle.y,
          reason: p.reason,
          handle: p.circle.text?.handle || '',
          circleHandle: p.circle.handle || ''
        }))
      };
    });
  });
}

function audit(content, reviewed = false) {
  const geo = parseDXF(content), columns = extractColumns(geo);
  const { names, nameHandles } = assignNameAssignments(columns, geo.texts);
  const circleCodes = buildCircleCodes(geo);
  // Это не встроенное исключение: handle передан только как результат ручной проверки этого файла.
  const ignored = reviewed ? new Set(['3034B']) : new Set();
  const depths = extractDepths(columns, geo, circleCodes, 100, ignored);
  const topology = buildTopology(columns, geo);
  const codes = assignCodes(columns, depths, circleCodes, topology, 100);
  return { geo, columns, names, nameHandles, circleCodes, depths, topology, codes };
}


export { parseDXF, extractColumns, assignNames, buildCircleCodes, extractDepths, buildTopology, assignCodes, audit };
