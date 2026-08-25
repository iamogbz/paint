import init, { vectorize_rgba } from "../vtracer/vtracer_wasm.js";

self.onmessage = async (e: MessageEvent) => {
  const { type, id, payload } = e.data;
  try {
    if (type === "VECTORIZE") {
      const { rawPixels, imgWidth, imgHeight, options } = payload;
      await init("https://unpkg.com/@visioncortex/vtracer@1.0.0-alpha.3/pkg/vtracer_wasm_bg.wasm");
      const svgStr = vectorize_rgba(rawPixels, imgWidth, imgHeight, options);
      self.postMessage({ id, type: "SUCCESS", payload: svgStr });
    } else if (type === "COMPUTE_NEIGHBORS") {
      const { regions, expandPx } = payload;
      const neighbourGraph = new Map<string, string[]>();
      const expandPxSq = expandPx * expandPx;
      const cellSize = Math.max(expandPx * 2, 64);
      const grid = new Map<string, Array<{ id: string; boundingBox: { width: number; height: number; x: number; y: number } }>>();

      for (const region of regions) {
        if (!region.boundingBox) continue;
        const box = region.boundingBox;
        const minX = Math.floor(box.x / cellSize);
        const maxX = Math.floor((box.x + box.width) / cellSize);
        const minY = Math.floor(box.y / cellSize);
        const maxY = Math.floor((box.y + box.height) / cellSize);

        for (let gx = minX; gx <= maxX; gx++) {
          for (let gy = minY; gy <= maxY; gy++) {
            const key = `${gx},${gy}`;
            let list = grid.get(key);
            if (!list) {
              list = [];
              grid.set(key, list);
            }
            list.push(region);
          }
        }
      }

      for (const regionA of regions) {
        const idA = regionA.id;
        const boxA = regionA.boundingBox;
        if (!boxA) continue;
        const areaA = boxA.width * boxA.height;
        const candidates: { id: string; distSq: number }[] = [];
        const seenCandidates = new Set<string>();

        const queryMinX = Math.floor((boxA.x - expandPx) / cellSize);
        const queryMaxX = Math.floor((boxA.x + boxA.width + expandPx) / cellSize);
        const queryMinY = Math.floor((boxA.y - expandPx) / cellSize);
        const queryMaxY = Math.floor((boxA.y + boxA.height + expandPx) / cellSize);

        for (let gx = queryMinX; gx <= queryMaxX; gx++) {
          for (let gy = queryMinY; gy <= queryMaxY; gy++) {
            const list = grid.get(`${gx},${gy}`);
            if (!list) continue;

            for (const regionB of list) {
              const idB = regionB.id;
              if (idA === idB || seenCandidates.has(idB)) continue;
              seenCandidates.add(idB);

              const boxB = regionB.boundingBox;
              const areaB = boxB.width * boxB.height;
              if (areaB > areaA) continue;

              const dx = Math.max(0, Math.max(boxA.x - (boxB.x + boxB.width), boxB.x - (boxA.x + boxA.width)));
              const dy = Math.max(0, Math.max(boxA.y - (boxB.y + boxB.height), boxB.y - (boxA.y + boxA.height)));
              const minDistSq = dx * dx + dy * dy;

              if (minDistSq <= expandPxSq) {
                candidates.push({ id: idB, distSq: minDistSq });
              }
            }
          }
        }

        candidates.sort((a, b) => a.distSq - b.distSq);
        neighbourGraph.set(idA, candidates.map((c) => c.id));
      }
      self.postMessage({ id, type: "SUCCESS", payload: neighbourGraph });
    }
  } catch (err: any) {
    self.postMessage({ id, type: "ERROR", payload: err.message });
  }
};
