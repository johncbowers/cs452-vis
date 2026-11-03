"use strict";

const NODE_RADIUS = 31;
const SVG_NS = "http://www.w3.org/2000/svg";

const vertices = [
  { id: "s", order: 0, left: [0.08, 0.48], right: [0.61, 0.48], narrowLeft: [0.14, 0.52], narrowRight: [0.62, 0.52] },
  { id: "a", order: 1, left: [0.20, 0.70], right: [0.68, 0.72], narrowLeft: [0.14, 0.73], narrowRight: [0.62, 0.73] },
  { id: "b", order: 2, left: [0.19, 0.30], right: [0.68, 0.28], narrowLeft: [0.14, 0.33], narrowRight: [0.62, 0.33] },
  { id: "c", order: 3, left: [0.39, 0.17], right: [0.87, 0.15], narrowLeft: [0.14, 0.14], narrowRight: [0.62, 0.14] },
  { id: "d", order: 4, left: [0.31, 0.49], right: [0.78, 0.48], narrowLeft: [0.38, 0.43], narrowRight: [0.86, 0.43] },
  { id: "e", order: 5, left: [0.37, 0.78], right: [0.88, 0.79], narrowLeft: [0.38, 0.83], narrowRight: [0.86, 0.83] },
  { id: "f", order: 6, left: [0.43, 0.34], right: [0.93, 0.36], narrowLeft: [0.38, 0.23], narrowRight: [0.86, 0.23] },
  { id: "g", order: 7, left: [0.44, 0.64], right: [0.94, 0.65], narrowLeft: [0.38, 0.63], narrowRight: [0.86, 0.63] }
];

const edges = [
  { id: "s-a", from: "s", to: "a", weight: 4, bend: 0 },
  { id: "s-b", from: "s", to: "b", weight: 2, bend: 0 },
  { id: "s-c", from: "s", to: "c", weight: 7, bend: -0.16 },
  { id: "b-a", from: "b", to: "a", weight: 1, bend: 0.12 },
  { id: "b-d", from: "b", to: "d", weight: 5, bend: 0 },
  { id: "b-e", from: "b", to: "e", weight: 8, bend: 0.14 },
  { id: "a-d", from: "a", to: "d", weight: 2, bend: 0 },
  { id: "a-c", from: "a", to: "c", weight: 4, bend: -0.12 },
  { id: "d-c", from: "d", to: "c", weight: 1, bend: -0.06 },
  { id: "d-e", from: "d", to: "e", weight: 3, bend: 0 },
  { id: "c-e", from: "c", to: "e", weight: 2, bend: 0.18 },
  { id: "c-f", from: "c", to: "f", weight: 2, bend: 0 },
  { id: "e-f", from: "e", to: "f", weight: 1, bend: 0.08 },
  { id: "e-g", from: "e", to: "g", weight: 4, bend: 0 },
  { id: "f-g", from: "f", to: "g", weight: 2, bend: 0 }
];

const elements = {
  graphWrap: document.getElementById("graph-wrap"),
  svg: document.getElementById("graph"),
  zones: document.getElementById("zones-layer"),
  edgeLayer: document.getElementById("edges-layer"),
  weightLayer: document.getElementById("weights-layer"),
  nodeLayer: document.getElementById("nodes-layer"),
  status: document.getElementById("status-message"),
  queue: document.getElementById("priority-queue"),
  tableBody: document.getElementById("state-table-body"),
  previous: document.getElementById("previous-button"),
  next: document.getElementById("next-button"),
  play: document.getElementById("play-button"),
  reset: document.getElementById("reset-button"),
  speed: document.getElementById("speed-range"),
  stepLabel: document.getElementById("step-label"),
  stepFraction: document.getElementById("step-fraction")
};

const nodePositions = new Map(vertices.map((vertex) => [vertex.id, { x: 0, y: 0, vx: 0, vy: 0 }]));
const dragOverrides = new Map();
const nodeElements = new Map();
const edgeElements = new Map();
const weightElements = new Map();

let snapshots = buildSnapshots();
let stepIndex = 0;
let transition = null;
let playing = false;
let playTimer = null;
let dragging = null;
let width = 900;
let height = 650;
let lastFrame = performance.now();

function cloneRecord(record) {
  return Object.fromEntries(Object.entries(record));
}

function finiteDistance(value) {
  return Number.isFinite(value) ? value : "∞";
}

function edgeIsTense(edge, distances) {
  const fromDistance = distances[edge.from];
  return Number.isFinite(fromDistance) && fromDistance + edge.weight < distances[edge.to];
}

function tenseEdgeIds(distances) {
  return new Set(edges.filter((edge) => edgeIsTense(edge, distances)).map((edge) => edge.id));
}

function buildSnapshots() {
  const dist = Object.fromEntries(vertices.map((vertex) => [vertex.id, Infinity]));
  const pred = Object.fromEntries(vertices.map((vertex) => [vertex.id, null]));
  const processed = new Set();
  const queue = new Set(["s"]);
  dist.s = 0;

  const result = [{
    dist: cloneRecord(dist),
    pred: cloneRecord(pred),
    processed: new Set(processed),
    queue: new Set(queue),
    extracted: null,
    relaxed: [],
    changed: [],
    message: "Initialize <strong>dist(s) = 0</strong> and every other distance to ∞. Insert s into the priority queue. The dashed orange edges are tense.",
    label: "Initialization"
  }];

  while (queue.size > 0) {
    const u = [...queue].sort((left, right) => {
      const distanceDifference = dist[left] - dist[right];
      return distanceDifference !== 0 ? distanceDifference : left.localeCompare(right);
    })[0];

    queue.delete(u);
    processed.add(u);
    const relaxed = [];
    const changed = [];

    for (const edge of edges.filter((candidate) => candidate.from === u)) {
      if (edgeIsTense(edge, dist)) {
        const oldDistance = dist[edge.to];
        dist[edge.to] = dist[u] + edge.weight;
        pred[edge.to] = u;
        if (!processed.has(edge.to)) {
          queue.add(edge.to);
        }
        relaxed.push(edge.id);
        changed.push({ vertex: edge.to, before: oldDistance, after: dist[edge.to], pred: u });
      }
    }

    const detail = changed.length > 0
      ? changed.map((change) => `${change.vertex}: ${finiteDistance(change.before)} → ${change.after}`).join("; ")
      : "No outgoing edge is tense.";

    result.push({
      dist: cloneRecord(dist),
      pred: cloneRecord(pred),
      processed: new Set(processed),
      queue: new Set(queue),
      extracted: u,
      relaxed,
      changed: changed.map((change) => change.vertex),
      message: `<strong>Extract ${u}</strong> with minimum tentative distance ${dist[u]}. Relax its tense outgoing edges. ${detail}`,
      label: `Process ${u}`
    });
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

function initializeSvg() {
  elements.zones.replaceChildren();
  elements.edgeLayer.replaceChildren();
  elements.weightLayer.replaceChildren();
  elements.nodeLayer.replaceChildren();
  nodeElements.clear();
  edgeElements.clear();
  weightElements.clear();

  elements.zones.append(
    createSvgElement("rect", { class: "zone-background processed" }),
    createSvgElement("rect", { class: "zone-background unprocessed" }),
    createSvgElement("line", { class: "wavefront" }),
    createSvgElement("text", { class: "zone-label processed-label" }),
    createSvgElement("text", { class: "zone-label unprocessed-label" }),
    createSvgElement("text", { class: "wave-label" })
  );

  for (const edge of edges) {
    const path = createSvgElement("path", { class: "edge", "data-edge-id": edge.id });
    elements.edgeLayer.append(path);
    edgeElements.set(edge.id, path);

    const weightGroup = createSvgElement("g", { class: "edge-weight", "aria-hidden": "true" });
    weightGroup.append(
      createSvgElement("rect", { x: -11, y: -9, width: 22, height: 18, rx: 6 }),
      createSvgElement("text", { x: 0, y: 0 })
    );
    weightGroup.querySelector("text").textContent = edge.weight;
    elements.weightLayer.append(weightGroup);
    weightElements.set(edge.id, weightGroup);
  }

  for (const vertex of vertices) {
    const group = createSvgElement("g", {
      class: "node",
      "data-node-id": vertex.id,
      role: "group",
      "aria-label": `Vertex ${vertex.id}`
    });
    group.append(
      createSvgElement("circle", { class: "halo", r: NODE_RADIUS + 6 }),
      createSvgElement("circle", { class: "body", r: NODE_RADIUS }),
      createSvgElement("text", { class: "node-name", x: 0, y: -3 }),
      createSvgElement("text", { class: "node-distance", x: 0, y: 15 })
    );
    group.querySelector(".node-name").textContent = vertex.id;
    group.addEventListener("pointerdown", beginVertexDrag);
    group.addEventListener("pointermove", moveVertexDrag);
    group.addEventListener("pointerup", endVertexDrag);
    group.addEventListener("pointercancel", endVertexDrag);
    elements.nodeLayer.append(group);
    nodeElements.set(vertex.id, group);
  }

  resizeGraph();
}

function resizeGraph() {
  const bounds = elements.graphWrap.getBoundingClientRect();
  width = Math.max(320, bounds.width);
  height = window.innerWidth <= 720 ? 640 : 650;
  elements.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const boundary = width * 0.5;
  const [processedRect, unprocessedRect, wavefront, processedLabel, unprocessedLabel, waveLabel] = elements.zones.children;
  Object.entries({ x: 0, y: 0, width: boundary, height }).forEach(([key, value]) => processedRect.setAttribute(key, value));
  Object.entries({ x: boundary, y: 0, width: width - boundary, height }).forEach(([key, value]) => unprocessedRect.setAttribute(key, value));
  Object.entries({ x1: boundary, x2: boundary, y1: 48, y2: height - 72 }).forEach(([key, value]) => wavefront.setAttribute(key, value));

  const narrow = width < 520;
  processedLabel.setAttribute("x", narrow ? 12 : 24);
  processedLabel.setAttribute("y", 30);
  processedLabel.textContent = narrow ? "PROCESSED" : "Processed · distance is final";
  unprocessedLabel.setAttribute("x", boundary + (narrow ? 12 : 24));
  unprocessedLabel.setAttribute("y", 30);
  unprocessedLabel.textContent = narrow ? "UNPROCESSED" : "Unprocessed · tentative distance";
  waveLabel.setAttribute("x", boundary + 8);
  waveLabel.setAttribute("y", height - 82);
  waveLabel.textContent = "wavefront";

  const visual = displayedSnapshot();
  for (const vertex of vertices) {
    const position = nodePositions.get(vertex.id);
    const target = targetPosition(vertex, visual.processed.has(vertex.id));
    if (position.x === 0 && position.y === 0) {
      position.x = target.x;
      position.y = target.y;
    }

    const radius = currentNodeRadius();
    const node = nodeElements.get(vertex.id);
    node.querySelector(".body").setAttribute("r", radius);
    node.querySelector(".halo").setAttribute("r", radius + 6);
  }
}

function targetPosition(vertex, isProcessed) {
  const override = dragOverrides.get(vertex.id);
  if (override) {
    const bounds = dragBounds(isProcessed);
    const horizontalRange = bounds.maxX - bounds.minX;
    return {
      x: isProcessed
        ? bounds.maxX - override.waveDistance * horizontalRange
        : bounds.minX + override.waveDistance * horizontalRange,
      y: bounds.minY + override.yFraction * (bounds.maxY - bounds.minY)
    };
  }

  const narrow = width < 520;
  const normalized = narrow
    ? (isProcessed ? vertex.narrowLeft : vertex.narrowRight)
    : (isProcessed ? vertex.left : vertex.right);
  const footerClearance = 80;
  const topClearance = 60;
  return {
    x: normalized[0] * width,
    y: topClearance + normalized[1] * (height - topClearance - footerClearance)
  };
}

function currentNodeRadius() {
  return width < 520 ? 23 : NODE_RADIUS;
}

function dragBounds(isProcessed) {
  const radius = currentNodeRadius();
  const boundary = width * 0.5;
  const sidePadding = radius + 11;
  return {
    minX: isProcessed ? sidePadding : boundary + sidePadding,
    maxX: isProcessed ? boundary - sidePadding : width - sidePadding,
    minY: radius + 42,
    maxY: height - radius - 70
  };
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function eventPointInGraph(event) {
  const point = elements.svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const matrix = elements.svg.getScreenCTM();
  return matrix ? point.matrixTransform(matrix.inverse()) : { x: point.x, y: point.y };
}

function setDraggedPosition(vertexId, point) {
  const visual = displayedSnapshot();
  const isProcessed = visual.processed.has(vertexId);
  const bounds = dragBounds(isProcessed);
  const x = clamp(point.x, bounds.minX, bounds.maxX);
  const y = clamp(point.y, bounds.minY, bounds.maxY);
  const position = nodePositions.get(vertexId);

  position.x = x;
  position.y = y;
  position.vx = 0;
  position.vy = 0;

  dragOverrides.set(vertexId, {
    waveDistance: isProcessed
      ? (bounds.maxX - x) / Math.max(1, bounds.maxX - bounds.minX)
      : (x - bounds.minX) / Math.max(1, bounds.maxX - bounds.minX),
    yFraction: (y - bounds.minY) / Math.max(1, bounds.maxY - bounds.minY)
  });
}

function beginVertexDrag(event) {
  if (event.button !== 0 || transition) return;
  event.preventDefault();
  stopPlaying();
  const node = event.currentTarget;
  const vertexId = node.dataset.nodeId;
  dragging = { id: vertexId, pointerId: event.pointerId };
  node.classList.add("dragging");
  try {
    node.setPointerCapture(event.pointerId);
  } catch {
    // Pointer capture is a convenience; dragging still works without it.
  }
  setDraggedPosition(vertexId, eventPointInGraph(event));
}

function moveVertexDrag(event) {
  if (!dragging || dragging.pointerId !== event.pointerId || dragging.id !== event.currentTarget.dataset.nodeId) return;
  event.preventDefault();
  setDraggedPosition(dragging.id, eventPointInGraph(event));
}

function endVertexDrag(event) {
  if (!dragging || dragging.pointerId !== event.pointerId || dragging.id !== event.currentTarget.dataset.nodeId) return;
  event.preventDefault();
  setDraggedPosition(dragging.id, eventPointInGraph(event));
  event.currentTarget.classList.remove("dragging");
  try {
    event.currentTarget.releasePointerCapture(event.pointerId);
  } catch {
    // Some browsers release capture automatically before pointerup is handled.
  }
  dragging = null;
}

function displayedSnapshot() {
  if (transition?.phase === "extract") {
    const queueBeforeRelaxation = new Set(snapshots[stepIndex].queue);
    queueBeforeRelaxation.delete(snapshots[stepIndex + 1].extracted);
    return {
      ...snapshots[stepIndex],
      processed: new Set(snapshots[stepIndex + 1].processed),
      queue: queueBeforeRelaxation,
      extracted: snapshots[stepIndex + 1].extracted,
      relaxed: snapshots[stepIndex + 1].relaxed,
      changed: []
    };
  }
  return snapshots[stepIndex];
}

function currentTenseEdges(visual) {
  return tenseEdgeIds(visual.dist);
}

function queueInOrder(visual) {
  return [...visual.queue].sort((left, right) => {
    const difference = visual.dist[left] - visual.dist[right];
    return difference !== 0 ? difference : left.localeCompare(right);
  });
}

function stateForVertex(vertexId, visual) {
  if (visual.processed.has(vertexId)) return "processed";
  if (visual.queue.has(vertexId)) return "queue";
  return "unseen";
}

function updateInterface() {
  const visual = displayedSnapshot();
  const tense = currentTenseEdges(visual);
  const changed = new Set(visual.changed);
  const relaxed = transition?.phase === "relax" ? new Set(transition.relaxed) : new Set();
  const activeTense = transition?.phase === "extract" ? new Set(transition.relaxed) : new Set();

  elements.status.innerHTML = transition?.phase === "extract"
    ? `<strong>Extract ${transition.extracted}</strong> from the priority queue and move it across the wavefront. Its highlighted outgoing edges are tense.`
    : visual.message;

  elements.stepLabel.textContent = transition?.phase === "extract" ? `Extract ${transition.extracted}` : visual.label;
  elements.stepFraction.textContent = `${stepIndex} / ${snapshots.length - 1}`;

  elements.previous.disabled = stepIndex === 0 || transition !== null;
  elements.next.disabled = stepIndex === snapshots.length - 1 || transition !== null;
  elements.reset.disabled = stepIndex === 0 && transition === null;
  elements.play.disabled = stepIndex === snapshots.length - 1 && !playing;
  elements.next.textContent = stepIndex === snapshots.length - 2 ? "Finish →" : "Next step →";

  elements.queue.replaceChildren();
  const orderedQueue = queueInOrder(visual);
  if (orderedQueue.length === 0) {
    const empty = document.createElement("li");
    empty.className = "queue-empty";
    empty.textContent = stepIndex === snapshots.length - 1 ? "Empty — algorithm complete" : "Empty";
    elements.queue.append(empty);
  } else {
    for (const vertexId of orderedQueue) {
      const item = document.createElement("li");
      item.innerHTML = `<span>${vertexId}</span><span>${finiteDistance(visual.dist[vertexId])}</span>`;
      item.setAttribute("aria-label", `Vertex ${vertexId}, tentative distance ${finiteDistance(visual.dist[vertexId])}`);
      elements.queue.append(item);
    }
  }

  elements.tableBody.replaceChildren();
  for (const vertex of vertices) {
    const state = stateForVertex(vertex.id, visual);
    const row = document.createElement("tr");
    if (changed.has(vertex.id)) row.classList.add("changed");
    row.innerHTML = `
      <th scope="row">${vertex.id}</th>
      <td>${finiteDistance(visual.dist[vertex.id])}</td>
      <td>${visual.pred[vertex.id] ?? "—"}</td>
      <td><span class="state-chip ${state}">${state === "unseen" ? "not queued" : state}</span></td>
    `;
    elements.tableBody.append(row);
  }

  for (const vertex of vertices) {
    const node = nodeElements.get(vertex.id);
    const state = stateForVertex(vertex.id, visual);
    node.setAttribute("class", [
      "node",
      visual.processed.has(vertex.id) ? "processed" : "unprocessed",
      visual.queue.has(vertex.id) ? "in-queue" : "",
      visual.extracted === vertex.id ? "current" : "",
      !Number.isFinite(visual.dist[vertex.id]) ? "unreachable" : ""
    ].filter(Boolean).join(" "));
    node.querySelector(".node-distance").textContent = `d=${finiteDistance(visual.dist[vertex.id])}`;
    node.setAttribute("aria-label", `Vertex ${vertex.id}; distance ${finiteDistance(visual.dist[vertex.id])}; predecessor ${visual.pred[vertex.id] ?? "none"}; ${state}. Drag to reposition within this side of the wavefront.`);
  }

  for (const edge of edges) {
    const element = edgeElements.get(edge.id);
    const isPred = visual.pred[edge.to] === edge.from;
    element.setAttribute("class", [
      "edge",
      tense.has(edge.id) ? "tense" : "",
      isPred ? "pred" : "",
      relaxed.has(edge.id) ? "relaxed" : "",
      activeTense.has(edge.id) ? "active-tense" : ""
    ].filter(Boolean).join(" "));
  }

  const activeLines = transition?.phase === "extract"
    ? ["loop", "extract", "scan", "tense"]
    : transition?.phase === "relax"
      ? ["relax", "queue"]
      : stepIndex === 0
        ? ["init", "insert"]
        : stepIndex === snapshots.length - 1
          ? ["loop"]
          : ["loop", "extract"];

  document.querySelectorAll(".pseudocode li").forEach((line) => {
    line.classList.toggle("active", activeLines.includes(line.dataset.line));
  });

  updateGraphDescription(visual, tense);
}

function updateGraphDescription(visual, tense) {
  const processed = vertices.filter((vertex) => visual.processed.has(vertex.id)).map((vertex) => vertex.id).join(", ") || "none";
  const queue = queueInOrder(visual).map((vertexId) => `${vertexId} at ${visual.dist[vertexId]}`).join(", ") || "empty";
  const tenseDescription = [...tense].join(", ") || "none";
  document.getElementById("graph-description").textContent = `Processed vertices: ${processed}. Priority queue: ${queue}. Tense edges: ${tenseDescription}.`;
}

function curvedEdgeGeometry(edge) {
  const from = nodePositions.get(edge.from);
  const to = nodePositions.get(edge.to);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / length;
  const uy = dy / length;
  const normalX = -uy;
  const normalY = ux;
  const bendDistance = edge.bend * Math.min(220, length);

  const radius = currentNodeRadius();
  const start = { x: from.x + ux * radius, y: from.y + uy * radius };
  const end = { x: to.x - ux * (radius + 7), y: to.y - uy * (radius + 7) };
  const control = {
    x: (start.x + end.x) / 2 + normalX * bendDistance,
    y: (start.y + end.y) / 2 + normalY * bendDistance
  };

  const midpoint = {
    x: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x,
    y: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y
  };

  return {
    path: `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} Q ${control.x.toFixed(2)} ${control.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
    midpoint
  };
}

function runPhysics(now) {
  const delta = Math.min(32, now - lastFrame) / 16.67;
  lastFrame = now;
  const visual = displayedSnapshot();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const attraction = reducedMotion ? 1 : 0.085;
  const damping = reducedMotion ? 0 : 0.76;

  for (const vertex of vertices) {
    const position = nodePositions.get(vertex.id);
    if (dragging?.id === vertex.id) {
      position.vx = 0;
      position.vy = 0;
      continue;
    }
    const target = targetPosition(vertex, visual.processed.has(vertex.id));
    position.vx += (target.x - position.x) * attraction * delta;
    position.vy += (target.y - position.y) * attraction * delta;
  }

  const radius = currentNodeRadius();
  for (let i = 0; i < vertices.length; i += 1) {
    for (let j = i + 1; j < vertices.length; j += 1) {
      const first = nodePositions.get(vertices[i].id);
      const second = nodePositions.get(vertices[j].id);
      const dx = second.x - first.x;
      const dy = second.y - first.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const minimum = radius * 2.65;
      if (distance < minimum) {
        const force = (minimum - distance) * 0.012 * delta;
        const ux = dx / distance;
        const uy = dy / distance;
        if (dragging?.id !== vertices[i].id) {
          first.vx -= ux * force;
          first.vy -= uy * force;
        }
        if (dragging?.id !== vertices[j].id) {
          second.vx += ux * force;
          second.vy += uy * force;
        }
      }
    }
  }

  for (const vertex of vertices) {
    const position = nodePositions.get(vertex.id);
    if (dragging?.id === vertex.id) {
      nodeElements.get(vertex.id).setAttribute("transform", `translate(${position.x.toFixed(2)} ${position.y.toFixed(2)})`);
      continue;
    }
    position.vx *= damping;
    position.vy *= damping;
    position.x += position.vx * delta;
    position.y += position.vy * delta;
    const bounds = dragBounds(visual.processed.has(vertex.id));
    position.x = clamp(position.x, bounds.minX, bounds.maxX);
    position.y = clamp(position.y, bounds.minY, bounds.maxY);
    nodeElements.get(vertex.id).setAttribute("transform", `translate(${position.x.toFixed(2)} ${position.y.toFixed(2)})`);
  }

  for (const edge of edges) {
    const geometry = curvedEdgeGeometry(edge);
    edgeElements.get(edge.id).setAttribute("d", geometry.path);
    weightElements.get(edge.id).setAttribute("transform", `translate(${geometry.midpoint.x.toFixed(2)} ${geometry.midpoint.y.toFixed(2)})`);
  }

  requestAnimationFrame(runPhysics);
}

function animationDuration() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 20;
  return 780 / Number(elements.speed.value);
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function advance() {
  if (transition || stepIndex >= snapshots.length - 1) return;
  const nextSnapshot = snapshots[stepIndex + 1];
  transition = {
    phase: "extract",
    extracted: nextSnapshot.extracted,
    relaxed: nextSnapshot.relaxed
  };
  updateInterface();
  await wait(animationDuration());

  stepIndex += 1;
  transition = {
    phase: "relax",
    extracted: nextSnapshot.extracted,
    relaxed: nextSnapshot.relaxed
  };
  updateInterface();
  await wait(animationDuration() * 0.72);

  transition = null;
  updateInterface();
  if (stepIndex >= snapshots.length - 1) {
    stopPlaying();
  }
}

function retreat() {
  if (transition || stepIndex === 0) return;
  stopPlaying();
  stepIndex -= 1;
  updateInterface();
}

function reset() {
  stopPlaying();
  transition = null;
  stepIndex = 0;
  updateInterface();
}

function stopPlaying() {
  playing = false;
  elements.play.textContent = "Play";
  elements.play.setAttribute("aria-pressed", "false");
  window.clearTimeout(playTimer);
  playTimer = null;
}

async function playLoop() {
  if (!playing) return;
  if (stepIndex >= snapshots.length - 1) {
    stopPlaying();
    return;
  }
  await advance();
  if (playing) {
    playTimer = window.setTimeout(playLoop, 500 / Number(elements.speed.value));
  }
}

function togglePlay() {
  if (playing) {
    stopPlaying();
    return;
  }
  if (stepIndex >= snapshots.length - 1) {
    reset();
  }
  playing = true;
  elements.play.textContent = "Pause";
  elements.play.setAttribute("aria-pressed", "true");
  playLoop();
}

elements.previous.addEventListener("click", retreat);
elements.next.addEventListener("click", () => {
  stopPlaying();
  advance();
});
elements.play.addEventListener("click", togglePlay);
elements.reset.addEventListener("click", reset);
window.addEventListener("resize", resizeGraph);
window.addEventListener("keydown", (event) => {
  if (event.target.matches("input, button")) return;
  if (event.key === "ArrowRight") advance();
  if (event.key === "ArrowLeft") retreat();
  if (event.key === " ") {
    event.preventDefault();
    togglePlay();
  }
});

initializeSvg();
updateInterface();
requestAnimationFrame(runPhysics);
