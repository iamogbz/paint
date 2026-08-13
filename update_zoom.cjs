const fs = require('fs');
let code = fs.readFileSync('src/components/PaintingControls.ts', 'utf8');

const targetRegex = /<!-- Middle Group: Canvas Zoom Controls[\s\S]*?<\/div>\s*`/m;

const replacement = `<!-- Middle Group: Canvas Zoom Controls (Only when image is loaded) -->
          \${showPhotoControls
            ? html\`
                <div
                  style="display: flex; align-items: center; background: rgba(255, 255, 255, 0.95); border: 2.5px solid #000000; border-radius: 9999px; box-shadow: 2px 2px 0px 0px #000000; overflow: hidden; position: relative;"
                >
                  <!-- Zoom Out (Left Half) -->
                  <button
                    title="Zoom Out"
                    @click=\${() => {
                      soundEffects.playPop();
                      window.dispatchEvent(new CustomEvent("easel-zoom-out"));
                    }}
                    style="flex: 1; display: flex; align-items: center; justify-content: flex-start; padding: 0.375rem 1rem 0.375rem 0.75rem; border: none; background: transparent; cursor: pointer; color: #000000; min-width: 50px;"
                  >
                    \${iconZoomOut(16, "#000000")}
                  </button>
                  
                  <!-- Center Text Overlay (Pointer Events None) -->
                  <div style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); pointer-events: none; font-size: 0.75rem; font-weight: 900; color: #000000;">
                    \${Math.round(zoomScale * 100)}%
                  </div>

                  <!-- Zoom In (Right Half) -->
                  <button
                    title="Zoom In"
                    @click=\${() => {
                      soundEffects.playPop();
                      window.dispatchEvent(new CustomEvent("easel-zoom-in"));
                    }}
                    style="flex: 1; display: flex; align-items: center; justify-content: flex-end; padding: 0.375rem 0.75rem 0.375rem 1rem; border: none; background: transparent; cursor: pointer; color: #000000; min-width: 50px;"
                  >
                    \${iconZoomIn(16, "#000000")}
                  </button>
                </div>
              \``;

code = code.replace(targetRegex, replacement);
fs.writeFileSync('src/components/PaintingControls.ts', code);
console.log("Updated zoom controls.");
