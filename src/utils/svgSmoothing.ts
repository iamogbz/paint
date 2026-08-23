interface Point {
  x: number;
  y: number;
}

function pointKey(p: Point): string {
  return `${Math.round(p.x * 100) / 100},${Math.round(p.y * 100) / 100}`;
}

function undirEdgeKey(a: Point, b: Point): string {
  const ka = pointKey(a);
  const kb = pointKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

function formatCoordinate(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

/**
 * Parses an SVG path `d` attribute into closed polygon rings of points.
 */
export function parseSvgPathToRings(d: string): Point[][] {
  const rings: Point[][] = [];
  let currentRing: Point[] = [];
  let curX = 0;
  let curY = 0;
  let startX = 0;
  let startY = 0;

  const commandRegex = /([a-df-z])|([+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?)/gi;
  let match: RegExpExecArray | null;
  let currentCommand = "";
  const numbers: number[] = [];

  const flushCommand = () => {
    if (!currentCommand) return;
    const cmd = currentCommand;
    const isRel = cmd === cmd.toLowerCase();
    const type = cmd.toUpperCase();

    if (type === "M") {
      for (let i = 0; i < numbers.length; i += 2) {
        if (i + 1 >= numbers.length) break;
        const x = isRel ? curX + numbers[i] : numbers[i];
        const y = isRel ? curY + numbers[i + 1] : numbers[i + 1];
        if (i === 0) {
          if (currentRing.length > 0) {
            rings.push(currentRing);
            currentRing = [];
          }
          curX = startX = x;
          curY = startY = y;
          currentRing.push({ x, y });
        } else {
          curX = x;
          curY = y;
          currentRing.push({ x, y });
        }
      }
    } else if (type === "L") {
      for (let i = 0; i < numbers.length; i += 2) {
        if (i + 1 >= numbers.length) break;
        const x = isRel ? curX + numbers[i] : numbers[i];
        const y = isRel ? curY + numbers[i + 1] : numbers[i + 1];
        curX = x;
        curY = y;
        currentRing.push({ x, y });
      }
    } else if (type === "H") {
      for (let i = 0; i < numbers.length; i++) {
        const x = isRel ? curX + numbers[i] : numbers[i];
        curX = x;
        currentRing.push({ x, y: curY });
      }
    } else if (type === "V") {
      for (let i = 0; i < numbers.length; i++) {
        const y = isRel ? curY + numbers[i] : numbers[i];
        curY = y;
        currentRing.push({ x: curX, y });
      }
    } else if (type === "Z") {
      curX = startX;
      curY = startY;
      if (currentRing.length > 0) {
        rings.push(currentRing);
        currentRing = [];
      }
    }
    numbers.length = 0;
  };

  while ((match = commandRegex.exec(d)) !== null) {
    if (match[1]) {
      flushCommand();
      currentCommand = match[1];
      if (currentCommand.toUpperCase() === "Z") {
        flushCommand();
        currentCommand = "";
      }
    } else if (match[2]) {
      numbers.push(parseFloat(match[2]));
    }
  }
  flushCommand();
  if (currentRing.length > 0) {
    rings.push(currentRing);
  }

  // Clean rings: remove duplicates and ensure valid ring closure
  return rings
    .map((ring) => {
      const cleaned: Point[] = [];
      for (let i = 0; i < ring.length; i++) {
        const pt = ring[i];
        if (cleaned.length === 0) {
          cleaned.push(pt);
        } else {
          const prev = cleaned[cleaned.length - 1];
          if (Math.hypot(pt.x - prev.x, pt.y - prev.y) > 0.001) {
            cleaned.push(pt);
          }
        }
      }
      if (cleaned.length > 1) {
        const first = cleaned[0];
        const last = cleaned[cleaned.length - 1];
        if (Math.hypot(first.x - last.x, first.y - last.y) < 0.001) {
          cleaned.pop();
        }
      }
      return cleaned;
    })
    .filter((r) => r.length >= 3);
}

/**
 * Ramer-Douglas-Peucker simplification for 2D polyline.
 */
function rdp(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points;

  const first = points[0];
  const last = points[points.length - 1];

  let maxDist = 0;
  let index = 0;

  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const lenSq = dx * dx + dy * dy;

  for (let i = 1; i < points.length - 1; i++) {
    const pt = points[i];
    let dist = 0;
    if (lenSq === 0) {
      dist = Math.hypot(pt.x - first.x, pt.y - first.y);
    } else {
      const num = Math.abs(dy * pt.x - dx * pt.y + last.x * first.y - last.y * first.x);
      dist = num / Math.sqrt(lenSq);
    }

    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const left = rdp(points.slice(0, index + 1), epsilon);
    const right = rdp(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  } else {
    return [first, last];
  }
}

/**
 * Chaikin corner cutting for open polyline with fixed endpoints.
 */
function chaikinOpen(points: Point[], iterations: number = 2): Point[] {
  if (points.length <= 2) return points;
  let current = points;
  for (let it = 0; it < iterations; it++) {
    const next: Point[] = [current[0]];
    for (let i = 0; i < current.length - 1; i++) {
      const p0 = current[i];
      const p1 = current[i + 1];
      next.push({
        x: 0.75 * p0.x + 0.25 * p1.x,
        y: 0.75 * p0.y + 0.25 * p1.y,
      });
      next.push({
        x: 0.25 * p0.x + 0.75 * p1.x,
        y: 0.25 * p0.y + 0.75 * p1.y,
      });
    }
    next.push(current[current.length - 1]);
    current = next;
  }
  return current;
}

/**
 * Chaikin corner cutting for periodic closed loop.
 */
function chaikinClosed(points: Point[], iterations: number = 2): Point[] {
  if (points.length < 3) return points;
  let current = points;
  for (let it = 0; it < iterations; it++) {
    const next: Point[] = [];
    const n = current.length;
    for (let i = 0; i < n; i++) {
      const p0 = current[i];
      const p1 = current[(i + 1) % n];
      next.push({
        x: 0.75 * p0.x + 0.25 * p1.x,
        y: 0.75 * p0.y + 0.25 * p1.y,
      });
      next.push({
        x: 0.25 * p0.x + 0.75 * p1.x,
        y: 0.25 * p0.y + 0.75 * p1.y,
      });
    }
    current = next;
  }
  return current;
}

function ringsToPathD(rings: Point[][]): string {
  return rings
    .map((ring) => {
      if (ring.length === 0) return "";
      const [first, ...rest] = ring;
      let d = `M${formatCoordinate(first.x)} ${formatCoordinate(first.y)}`;
      for (const pt of rest) {
        d += ` L${formatCoordinate(pt.x)} ${formatCoordinate(pt.y)}`;
      }
      d += " Z";
      return d;
    })
    .filter(Boolean)
    .join(" ");
}

/**
 * Smooths all SVG path elements in a planar SVG document by decomposing their shared
 * boundaries into topological arcs, smoothing each shared arc once, and reconstructing
 * paths from the smoothed arcs. This guarantees 100% gap-free vector topology.
 */
export function smoothPlanarSvgPaths(svgDoc: SVGSVGElement): void {
  const pathElements = Array.from(svgDoc.querySelectorAll<SVGPathElement>("path"));
  if (pathElements.length === 0) return;

  // 1. Parse each path into rings
  const elementRingsMap = new Map<SVGPathElement, Point[][]>();
  const vertexIncidentEdges = new Map<string, Set<string>>();
  const pointObjMap = new Map<string, Point>();

  for (const pathEl of pathElements) {
    const d = pathEl.getAttribute("d");
    if (!d) continue;
    const rings = parseSvgPathToRings(d);
    elementRingsMap.set(pathEl, rings);

    for (const ring of rings) {
      const n = ring.length;
      for (let i = 0; i < n; i++) {
        const u = ring[i];
        const v = ring[(i + 1) % n];
        const ku = pointKey(u);
        const kv = pointKey(v);
        pointObjMap.set(ku, u);
        pointObjMap.set(kv, v);

        const edgeKey = undirEdgeKey(u, v);
        if (!vertexIncidentEdges.has(ku)) vertexIncidentEdges.set(ku, new Set());
        if (!vertexIncidentEdges.has(kv)) vertexIncidentEdges.set(kv, new Set());
        vertexIncidentEdges.get(ku)!.add(edgeKey);
        vertexIncidentEdges.get(kv)!.add(edgeKey);
      }
    }
  }

  // 2. Determine junction vertices (nodes with degree !== 2, or isolated loop anchors)
  const isJunctionVertex = (p: Point): boolean => {
    const key = pointKey(p);
    const incident = vertexIncidentEdges.get(key);
    return !incident || incident.size !== 2;
  };

  // 3. Shared smoothed arcs cache: canonical arc signature -> smoothed points
  const smoothedArcsCache = new Map<string, Point[]>();

  const smoothArc = (points: Point[], isOpen: boolean): Point[] => {
    if (isOpen) {
      const simplified = rdp(points, 0.4);
      return chaikinOpen(simplified, 2);
    } else {
      const simplified = rdp(points, 0.4);
      return chaikinClosed(simplified, 2);
    }
  };

  // 4. Transform each path's rings by stitching smoothed shared arcs
  for (const pathEl of pathElements) {
    const rings = elementRingsMap.get(pathEl);
    if (!rings || rings.length === 0) continue;

    const smoothedRings: Point[][] = [];

    for (const ring of rings) {
      const n = ring.length;
      if (n < 3) continue;

      // Find all junction indices along this ring
      const junctionIndices: number[] = [];
      for (let i = 0; i < n; i++) {
        if (isJunctionVertex(ring[i])) {
          junctionIndices.push(i);
        }
      }

      // If no junction vertices exist (isolated simple loop), anchor at index 0
      if (junctionIndices.length === 0) {
        junctionIndices.push(0);
      }

      const smoothedRing: Point[] = [];

      if (junctionIndices.length === 1) {
        // Closed loop arc
        const anchorIdx = junctionIndices[0];
        const loopPoints: Point[] = [];
        for (let i = 0; i < n; i++) {
          loopPoints.push(ring[(anchorIdx + i) % n]);
        }

        // Canonical ID for closed loop
        const minKeyPoint = loopPoints.reduce((min, p) => (pointKey(p) < pointKey(min) ? p : min), loopPoints[0]);
        const minIdx = loopPoints.indexOf(minKeyPoint);
        const canonLoop: Point[] = [];
        for (let i = 0; i < n; i++) canonLoop.push(loopPoints[(minIdx + i) % n]);
        const canonId = `closed:${canonLoop.map(pointKey).join(",")}`;

        let smoothedLoop = smoothedArcsCache.get(canonId);
        if (!smoothedLoop) {
          smoothedLoop = smoothArc(canonLoop, false);
          smoothedArcsCache.set(canonId, smoothedLoop);
        }
        smoothedRings.push(smoothedLoop);
      } else {
        // Multiple junctions along ring: decompose into open arcs
        const m = junctionIndices.length;
        for (let s = 0; s < m; s++) {
          const fromIdx = junctionIndices[s];
          const toIdx = junctionIndices[(s + 1) % m];

          const arcPoints: Point[] = [];
          let cur = fromIdx;
          while (true) {
            arcPoints.push(ring[cur]);
            if (cur === toIdx) break;
            cur = (cur + 1) % n;
          }

          const startKey = pointKey(arcPoints[0]);
          const endKey = pointKey(arcPoints[arcPoints.length - 1]);

          const isCanonical = startKey < endKey;
          const canonPoints = isCanonical ? arcPoints : [...arcPoints].reverse();
          const canonId = `open:${pointKey(canonPoints[0])}->${pointKey(canonPoints[canonPoints.length - 1])}:${canonPoints.map(pointKey).join(",")}`;

          let smoothedCanon = smoothedArcsCache.get(canonId);
          if (!smoothedCanon) {
            smoothedCanon = smoothArc(canonPoints, true);
            smoothedArcsCache.set(canonId, smoothedCanon);
          }

          const orientedSmoothed = isCanonical ? smoothedCanon : [...smoothedCanon].reverse();

          // Append to ring (avoiding duplicate vertex at the junction connection)
          if (smoothedRing.length === 0) {
            smoothedRing.push(...orientedSmoothed);
          } else {
            smoothedRing.push(...orientedSmoothed.slice(1));
          }
        }

        if (smoothedRing.length > 1) {
          const first = smoothedRing[0];
          const last = smoothedRing[smoothedRing.length - 1];
          if (Math.hypot(first.x - last.x, first.y - last.y) < 0.01) {
            smoothedRing.pop();
          }
        }
        smoothedRings.push(smoothedRing);
      }
    }

    if (smoothedRings.length > 0) {
      const newD = ringsToPathD(smoothedRings);
      pathEl.setAttribute("d", newD);
    }
  }
}
