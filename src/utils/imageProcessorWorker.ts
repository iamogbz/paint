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
      
      for (const regionA of regions) {
        const idA = regionA.id;
        const boxA = regionA.boundingBox;
        if (!boxA) continue;
        const areaA = boxA.width * boxA.height;
        const candidates: { id: string; distSq: number }[] = [];
        
        for (const regionB of regions) {
          const idB = regionB.id;
          if (idA === idB) continue;
          const boxB = regionB.boundingBox;
          if (!boxB) continue;
          const areaB = boxB.width * boxB.height;

          // Only add smaller or equal sized regions to the neighbor list.
          // This prevents large regions from "stealing" taps intended for smaller regions 
          // when the user wants to paint a small region with a non-matching color.
          if (areaB > areaA) continue;
          
          const dx = Math.max(0, Math.max(boxA.x - (boxB.x + boxB.width), boxB.x - (boxA.x + boxA.width)));
          const dy = Math.max(0, Math.max(boxA.y - (boxB.y + boxB.height), boxB.y - (boxA.y + boxA.height)));
          const minDistSq = dx * dx + dy * dy;

          if (minDistSq <= expandPxSq) {
            candidates.push({ id: idB, distSq: minDistSq });
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
