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
      
      for (const regionA of regions) {
        const idA = regionA.id;
        const boxA = regionA.boundingBox;
        if (!boxA) continue;
        const areaA = boxA.width * boxA.height;
        const neighbours: string[] = [];
        
        for (const regionB of regions) {
          const idB = regionB.id;
          if (idA === idB) continue;
          const boxB = regionB.boundingBox;
          if (!boxB) continue;
          const areaB = boxB.width * boxB.height;
          
          if (areaB > areaA) continue;
          
          const intersectX = boxA.x - expandPx <= boxB.x + boxB.width && boxA.x + boxA.width + expandPx >= boxB.x;
          const intersectY = boxA.y - expandPx <= boxB.y + boxB.height && boxA.y + boxA.height + expandPx >= boxB.y;
          if (intersectX && intersectY) {
            neighbours.push(idB);
          }
        }
        neighbourGraph.set(idA, neighbours);
      }
      self.postMessage({ id, type: "SUCCESS", payload: neighbourGraph });
    }
  } catch (err: any) {
    self.postMessage({ id, type: "ERROR", payload: err.message });
  }
};
