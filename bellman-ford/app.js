"use strict";

const SVG_NS = "http://www.w3.org/2000/svg";
const NODE_RADIUS = 30;

const examples = {
  positive: {
    title: "Positive edge weights",
    description: "All edge weights are positive. Bellman–Ford eventually reaches a phase with no tense edges and can stop early.",
    nodes: [
      { id: "s", x: 0.11, y: 0.52 },
      { id: "a", x: 0.32, y: 0.22 },
      { id: "b", x: 0.31, y: 0.72 },
      { id: "c", x: 0.57, y: 0.18 },
      { id: "d", x: 0.60, y: 0.62 },
      { id: "t", x: 0.86, y: 0.42 }
    ],
    edges: [
      { id: "c-t", from: "c", to: "t", weight: 1, bend: -0.08 },
      { id: "d-t", from: "d", to: "t", weight: 2, bend: 0.06 },
      { id: "a-c", from: "a", to: "c", weight: 2, bend: 0 },
      { id: "b-d", from: "b", to: "d", weight: 2, bend: 0 },
      { id: "b-a", from: "b", to: "a", weight: 1, bend: 0.15 },
      { id: "s-a", from: "s", to: "a", weight: 4, bend: 0 },
      { id: "s-b", from: "s", to: "b", weight: 2, bend: 0 },
      { id: "c-d", from: "c", to: "d", weight: 1, bend: 0.10 }
    ],
    cycleEdges: []
  },
  negative: {
    title: "Reachable negative cycle",
    description: "The cycle b → c → d → b has total weight −3. After V − 1 phases, at least one edge is still tense.",
    nodes: [
      { id: "s", x: 0.10, y: 0.50 },
      { id: "a", x: 0.28, y: 0.50 },
      { id: "b", x: 0.48, y: 0.24 },
      { id: "c", x: 0.70, y: 0.24 },
      { id: "d", x: 0.70, y: 0.70 },
      { id: "t", x: 0.90, y: 0.50 }
    ],
    edges: [
      { id: "c-d", from: "c", to: "d", weight: 2, bend: 0 },
      { id: "d-b", from: "d", to: "b", weight: -6, bend: 0.14 },
      { id: "b-c", from: "b", to: "c", weight: 1, bend: 0 },
      { id: "d-t", from: "d", to: "t", weight: 3, bend: 0 },
      { id: "s-t", from: "s", to: "t", weight: 15, bend: -0.27 },
      { id: "s-a", from: "s", to: "a", weight: 2, bend: 0 },
      { id: "a-b", from: "a", to: "b", weight: 2, bend: 0 }
    ],
    cycleEdges: ["b-c", "c-d", "d-b"]
  }
};

const elements = {
  svg: document.getElementById("graph"),
  graphWrap: document.getElementById("graph-wrap"),
  edgeLayer: document.getElementById("edges-layer"),
  weightLayer: document.getElementById("weights-layer"),
  nodeLayer: document.getElementById("nodes-layer"),
  status: document.getElementById("status-message"),
  description: document.getElementById("example-description"),
  positive: document.getElementById("positive-example"),
  negative: document.getElementById("negative-example"),
  previous: document.getElementById("previous-button"),
  next: document.getElementById("next-button"),
  finishPhase: document.getElementById("phase-button"),
  play: document.getElementById("play-button"),
  reset: document.getElementById("reset-button"),
  speed: document.getElementById("speed-range"),
  phaseLabel: document.getElementById("phase-label"),
  edgeLabel: document.getElementById("edge-label"),
  phaseSummary: document.getElementById("phase-summary"),
  phaseExplanation: document.getElementById("phase-explanation"),
  phaseProgress: document.querySelector(".phase-progress"),
  phaseProgressBar: document.getElementById("phase-progress-bar"),
  edgeOrder: document.getElementById("edge-order"),
  tableBody: document.getElementById("state-table-body"),
  graphTitle: document.getElementById("graph-title"),
  graphDescription: document.getElementById("graph-description")
};

let currentKey = "positive";
let graph = examples[currentKey];
let snapshots = [];
let stepIndex = 0;
let width = 900;
let height = 650;
let playing = false;
let playTimer = null;
let dragging = null;
let positions = new Map();
const nodeElements = new Map();
const edgeElements = new Map();
const weightElements = new Map();

function cloneRecord(record) {
  return Object.fromEntries(Object.entries(record));
}

function finiteDistance(value) {
  return Number.isFinite(value) ? String(value).replace("-", "−") : "∞";
}

function edgeIsTense(edge, distances) {
  return Number.isFinite(distances[edge.from])
    && distances[edge.from] + edge.weight < distances[edge.to];
}

function tenseEdgeIds(distances) {
  return new Set(graph.edges.filter((edge) => edgeIsTense(edge, distances)).map((edge) => edge.id));
}

function snapshot(base, additions = {}) {
  return {
    dist: cloneRecord(base.dist),
    pred: cloneRecord(base.pred),
    phase: base.phase,
    edgeIndex: null,
    edgeId: null,
    relaxed: false,
    changed: null,
    kind: "scan",
    ...additions
  };
}

function buildSnapshots() {
  const state = {
    dist: Object.fromEntries(graph.nodes.map((node) => [node.id, Infinity])),
    pred: Object.fromEntries(graph.nodes.map((node) => [node.id, null])),
    phase: 0
  };
  state.dist.s = 0;

  const result = [snapshot(state, {
    kind: "init",
    message: "Set <strong>dist(s) = 0</strong>. Every other distance is ∞, and every predecessor is undefined."
  })];

  const maximumPhases = graph.nodes.length - 1;
  for (let phase = 1; phase <= maximumPhases; phase += 1) {
    state.phase = phase;
    let relaxations = 0;

    graph.edges.forEach((edge, edgeIndex) => {
      const before = state.dist[edge.to];
      const wasTense = edgeIsTense(edge, state.dist);
      if (wasTense) {
        state.dist[edge.to] = state.dist[edge.from] + edge.weight;
        state.pred[edge.to] = edge.from;
        relaxations += 1;
      }

      const calculation = Number.isFinite(state.dist[edge.from])
        ? `${finiteDistance(state.dist[edge.from])} + ${finiteDistance(edge.weight)} = ${finiteDistance(state.dist[edge.from] + edge.weight)}`
        : `∞ + ${finiteDistance(edge.weight)} = ∞`;
      const message = wasTense
        ? `<strong>${edge.from} → ${edge.to} was tense.</strong> ${calculation} is smaller than ${finiteDistance(before)}, so set dist(${edge.to}) = ${finiteDistance(state.dist[edge.to])} and pred(${edge.to}) = ${edge.from}.`
        : `<strong>${edge.from} → ${edge.to} was not tense.</strong> ${calculation} does not improve dist(${edge.to}) = ${finiteDistance(state.dist[edge.to])}.`;

      result.push(snapshot(state, {
        kind: "scan",
        edgeIndex,
        edgeId: edge.id,
        relaxed: wasTense,
        changed: wasTense ? edge.to : null,
        message
      }));
    });

    const remaining = tenseEdgeIds(state.dist);
    if (remaining.size === 0) {
      result.push(snapshot(state, {
        kind: "complete",
        message: `<strong>No edge is tense.</strong> The distances are final, so Bellman–Ford can stop after phase ${phase}.`,
        relaxations
      }));
      return result;
    }

    if (phase < maximumPhases) {
      result.push(snapshot(state, {
        kind: "phase-end",
        message: `Phase ${phase} is complete, but ${remaining.size} ${remaining.size === 1 ? "edge is" : "edges are"} still tense. Start another full scan.`,
        relaxations
      }));
    } else {
      result.push(snapshot(state, {
        kind: "negative",
        message: `<strong>A reachable negative cycle exists.</strong> After V − 1 complete phases, ${remaining.size} ${remaining.size === 1 ? "edge is" : "edges are"} still tense. The highlighted cycle has total weight −3.`,
        remaining,
        relaxations
      }));
    }
  }
  return result;
}

function createSvgElement(tag, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  return element;
}

function initializeGraph() {
  stopPlaying();
  positions = new Map(graph.nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
  snapshots = buildSnapshots();
  stepIndex = 0;
  nodeElements.clear();
  edgeElements.clear();
  weightElements.clear();
  elements.edgeLayer.replaceChildren();
  elements.weightLayer.replaceChildren();
  elements.nodeLayer.replaceChildren();

  for (const edge of graph.edges) {
    const path = createSvgElement("path", { class: "edge", "data-edge-id": edge.id });
    elements.edgeLayer.append(path);
    edgeElements.set(edge.id, path);

    const group = createSvgElement("g", { class: `edge-weight${edge.weight < 0 ? " negative" : ""}`, "aria-hidden": "true" });
    const label = finiteDistance(edge.weight);
    const labelWidth = Math.max(24, label.length * 8 + 10);
    group.append(
      createSvgElement("rect", { x: -labelWidth / 2, y: -10, width: labelWidth, height: 20, rx: 6 }),
      createSvgElement("text", { x: 0, y: 0 })
    );
    group.querySelector("text").textContent = label;
    elements.weightLayer.append(group);
    weightElements.set(edge.id, group);
  }

  for (const node of graph.nodes) {
    const group = createSvgElement("g", {
      class: `node${node.id === "s" ? " source" : ""}`,
      "data-node-id": node.id,
      role: "group",
      tabindex: "0",
      "aria-label": `Vertex ${node.id}`
    });
    group.append(
      createSvgElement("circle", { class: "halo", r: NODE_RADIUS + 7 }),
      createSvgElement("circle", { class: "body", r: NODE_RADIUS }),
      createSvgElement("text", { class: "node-name", x: 0, y: -3 }),
      createSvgElement("text", { class: "node-distance", x: 0, y: 15 })
    );
    group.querySelector(".node-name").textContent = node.id;
    group.addEventListener("pointerdown", beginDrag);
    group.addEventListener("pointermove", moveDrag);
    group.addEventListener("pointerup", endDrag);
    group.addEventListener("pointercancel", endDrag);
    elements.nodeLayer.append(group);
    nodeElements.set(node.id, group);
  }

  renderEdgeOrder();
  resizeGraph();
  update();
}

function graphPoint(event) {
  const point = elements.svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const matrix = elements.svg.getScreenCTM();
  return matrix ? point.matrixTransform(matrix.inverse()) : point;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function beginDrag(event) {
  const id = event.currentTarget.dataset.nodeId;
  dragging = id;
  event.currentTarget.classList.add("dragging");
  event.currentTarget.setPointerCapture(event.pointerId);
  moveDrag(event);
}

function moveDrag(event) {
  if (!dragging || event.currentTarget.dataset.nodeId !== dragging) return;
  const point = graphPoint(event);
  const x = clamp(point.x, NODE_RADIUS + 12, width - NODE_RADIUS - 12) / width;
  const y = clamp(point.y, NODE_RADIUS + 22, height - NODE_RADIUS - 74) / height;
  positions.set(dragging, { x, y });
  drawGeometry();
}

function endDrag(event) {
  event.currentTarget.classList.remove("dragging");
  dragging = null;
}

function resizeGraph() {
  const bounds = elements.graphWrap.getBoundingClientRect();
  width = Math.max(320, bounds.width);
  height = window.innerWidth <= 720 ? 570 : 650;
  elements.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  drawGeometry();
}

function pixelPosition(id) {
  const position = positions.get(id);
  return { x: position.x * width, y: position.y * height };
}

function edgeGeometry(edge) {
  const start = pixelPosition(edge.from);
  const end = pixelPosition(edge.to);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / length;
  const uy = dy / length;
  const sx = start.x + ux * (NODE_RADIUS + 3);
  const sy = start.y + uy * (NODE_RADIUS + 3);
  const ex = end.x - ux * (NODE_RADIUS + 8);
  const ey = end.y - uy * (NODE_RADIUS + 8);
  const normalX = -uy;
  const normalY = ux;
  const bend = (edge.bend || 0) * length;
  const cx = (sx + ex) / 2 + normalX * bend;
  const cy = (sy + ey) / 2 + normalY * bend;
  const labelX = 0.25 * sx + 0.5 * cx + 0.25 * ex + normalX * 12;
  const labelY = 0.25 * sy + 0.5 * cy + 0.25 * ey + normalY * 12;
  return { path: `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`, labelX, labelY };
}

function drawGeometry() {
  for (const node of graph.nodes) {
    const point = pixelPosition(node.id);
    nodeElements.get(node.id)?.setAttribute("transform", `translate(${point.x} ${point.y})`);
  }
  for (const edge of graph.edges) {
    const geometry = edgeGeometry(edge);
    edgeElements.get(edge.id)?.setAttribute("d", geometry.path);
    weightElements.get(edge.id)?.setAttribute("transform", `translate(${geometry.labelX} ${geometry.labelY})`);
  }
}

function renderEdgeOrder() {
  elements.edgeOrder.replaceChildren();
  graph.edges.forEach((edge) => {
    const item = document.createElement("li");
    item.dataset.edgeId = edge.id;
    const name = document.createElement("span");
    name.textContent = `${edge.from}→${edge.to}`;
    const weight = document.createElement("span");
    weight.className = `weight${edge.weight < 0 ? " negative" : ""}`;
    weight.textContent = finiteDistance(edge.weight);
    item.append(name, weight);
    elements.edgeOrder.append(item);
  });
}

function predecessorEdgeIds(state) {
  const ids = new Set();
  for (const [vertex, predecessor] of Object.entries(state.pred)) {
    if (predecessor === null) continue;
    const edge = graph.edges.find((candidate) => candidate.from === predecessor && candidate.to === vertex);
    if (edge) ids.add(edge.id);
  }
  return ids;
}

function activePseudocodeLines(state) {
  if (state.kind === "init") return new Set(["init"]);
  if (state.kind === "negative") return new Set(["check", "report"]);
  if (state.kind === "complete") return new Set(["check"]);
  if (state.kind === "phase-end") return new Set(["repeat"]);
  return new Set(state.relaxed ? ["repeat", "edges", "tense", "relax"] : ["repeat", "edges", "tense"]);
}

function update() {
  const state = snapshots[stepIndex];
  const tense = tenseEdgeIds(state.dist);
  const predecessors = predecessorEdgeIds(state);
  const isNegative = state.kind === "negative";

  elements.status.innerHTML = state.message;
  elements.status.classList.toggle("negative", isNegative);
  elements.description.textContent = graph.description;
  elements.graphTitle.textContent = `${graph.title}: Bellman-Ford phase ${state.phase}`;
  elements.graphDescription.textContent = `${graph.description} Current phase ${state.phase}. ${elements.status.textContent}`;

  for (const edge of graph.edges) {
    const path = edgeElements.get(edge.id);
    path.className.baseVal = "edge";
    if (predecessors.has(edge.id)) path.classList.add("pred");
    if (tense.has(edge.id)) path.classList.add("tense");
    if (edge.id === state.edgeId) path.classList.add(state.relaxed ? "relaxed" : "current");
    if (isNegative && graph.cycleEdges.includes(edge.id)) path.classList.add("cycle");
  }

  for (const node of graph.nodes) {
    const group = nodeElements.get(node.id);
    group.classList.toggle("changed", node.id === state.changed);
    group.classList.toggle("cycle", isNegative && ["b", "c", "d"].includes(node.id));
    group.querySelector(".node-distance").textContent = `d=${finiteDistance(state.dist[node.id])}`;
    group.setAttribute("aria-label", `Vertex ${node.id}, distance ${finiteDistance(state.dist[node.id])}, predecessor ${state.pred[node.id] ?? "none"}`);
  }

  elements.tableBody.replaceChildren();
  for (const node of graph.nodes) {
    const row = document.createElement("tr");
    row.classList.toggle("changed", node.id === state.changed);
    row.classList.toggle("cycle", isNegative && ["b", "c", "d"].includes(node.id));
    const heading = document.createElement("th");
    heading.scope = "row";
    heading.textContent = node.id;
    const distance = document.createElement("td");
    distance.textContent = finiteDistance(state.dist[node.id]);
    const predecessor = document.createElement("td");
    predecessor.textContent = state.pred[node.id] ?? "—";
    row.append(heading, distance, predecessor);
    elements.tableBody.append(row);
  }

  [...elements.edgeOrder.children].forEach((item, index) => {
    item.classList.toggle("active", state.kind === "scan" && index === state.edgeIndex && !state.relaxed);
    item.classList.toggle("relaxed", state.kind === "scan" && index === state.edgeIndex && state.relaxed);
  });

  document.querySelectorAll(".pseudocode li").forEach((line) => {
    line.classList.toggle("active", activePseudocodeLines(state).has(line.dataset.line));
  });

  const maximumPhases = graph.nodes.length - 1;
  const scanned = state.kind === "scan" ? state.edgeIndex + 1 : (state.phase > 0 ? graph.edges.length : 0);
  elements.phaseLabel.textContent = state.phase === 0 ? "Initialization" : `Phase ${state.phase} of ${maximumPhases}`;
  elements.edgeLabel.textContent = state.phase === 0 ? `0 / ${graph.edges.length} edges` : `${scanned} / ${graph.edges.length} edges`;
  elements.phaseSummary.textContent = state.kind === "negative" ? "negative cycle detected" : state.kind === "complete" ? "finished" : state.phase === 0 ? "initialization" : `phase ${state.phase} of ${maximumPhases}`;
  elements.phaseExplanation.textContent = state.kind === "negative"
    ? "The extra check finds an edge that can still be relaxed."
    : state.kind === "complete"
      ? "No tense edge remains; another phase cannot change any label."
      : state.kind === "phase-end"
        ? `This phase made ${state.relaxations} ${state.relaxations === 1 ? "relaxation" : "relaxations"}.`
        : state.kind === "init"
          ? "Initialize distances and predecessors."
          : `Scan edge ${state.edgeIndex + 1} of ${graph.edges.length} in the fixed order.`;
  const progress = state.phase === 0 ? 0 : ((state.phase - 1) + scanned / graph.edges.length) / maximumPhases;
  elements.phaseProgressBar.style.width = `${Math.min(100, progress * 100)}%`;
  elements.phaseProgress.setAttribute("aria-valuemax", maximumPhases);
  elements.phaseProgress.setAttribute("aria-valuenow", Math.min(maximumPhases, state.phase));

  elements.previous.disabled = stepIndex === 0;
  elements.next.disabled = stepIndex === snapshots.length - 1;
  elements.finishPhase.disabled = stepIndex === snapshots.length - 1;
  elements.next.textContent = stepIndex === snapshots.length - 1 ? "Finished" : "Next edge →";
  drawGeometry();
}

function goTo(index) {
  stepIndex = clamp(index, 0, snapshots.length - 1);
  update();
}

function finishCurrentPhase() {
  const current = snapshots[stepIndex];
  const targetPhase = current.phase === 0 || current.kind === "phase-end" ? current.phase + 1 : current.phase;
  for (let index = stepIndex + 1; index < snapshots.length; index += 1) {
    const candidate = snapshots[index];
    if (candidate.phase > targetPhase || (candidate.phase === targetPhase && ["phase-end", "complete", "negative"].includes(candidate.kind))) {
      goTo(index);
      return;
    }
  }
  goTo(snapshots.length - 1);
}

function stopPlaying() {
  playing = false;
  if (playTimer) window.clearTimeout(playTimer);
  playTimer = null;
  elements.play.textContent = "Play";
  elements.play.setAttribute("aria-pressed", "false");
}

function scheduleNext() {
  if (!playing) return;
  if (stepIndex >= snapshots.length - 1) {
    stopPlaying();
    return;
  }
  const delay = 1150 / Number(elements.speed.value);
  playTimer = window.setTimeout(() => {
    goTo(stepIndex + 1);
    scheduleNext();
  }, delay);
}

function togglePlay() {
  if (playing) {
    stopPlaying();
    return;
  }
  if (stepIndex >= snapshots.length - 1) goTo(0);
  playing = true;
  elements.play.textContent = "Pause";
  elements.play.setAttribute("aria-pressed", "true");
  scheduleNext();
}

function selectExample(key) {
  currentKey = key;
  graph = examples[key];
  elements.positive.classList.toggle("selected", key === "positive");
  elements.negative.classList.toggle("selected", key === "negative");
  elements.positive.setAttribute("aria-pressed", String(key === "positive"));
  elements.negative.setAttribute("aria-pressed", String(key === "negative"));
  initializeGraph();
}

elements.previous.addEventListener("click", () => { stopPlaying(); goTo(stepIndex - 1); });
elements.next.addEventListener("click", () => { stopPlaying(); goTo(stepIndex + 1); });
elements.finishPhase.addEventListener("click", () => { stopPlaying(); finishCurrentPhase(); });
elements.play.addEventListener("click", togglePlay);
elements.reset.addEventListener("click", () => initializeGraph());
elements.positive.addEventListener("click", () => selectExample("positive"));
elements.negative.addEventListener("click", () => selectExample("negative"));
elements.speed.addEventListener("input", () => {
  if (playing) {
    window.clearTimeout(playTimer);
    scheduleNext();
  }
});
window.addEventListener("resize", resizeGraph);
window.addEventListener("keydown", (event) => {
  if (["INPUT", "BUTTON"].includes(document.activeElement?.tagName)) return;
  if (event.key === "ArrowRight") { stopPlaying(); goTo(stepIndex + 1); }
  if (event.key === "ArrowLeft") { stopPlaying(); goTo(stepIndex - 1); }
  if (event.key === " ") { event.preventDefault(); togglePlay(); }
});

initializeGraph();
