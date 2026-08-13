const fs = require('fs');
let code = fs.readFileSync('src/components/EaselBoard.ts', 'utf8');

code = code.replace(
/  private handleCanvasMouseMove = \(e: MouseEvent\) => \{\n    if \(this\.isDragging \|\| this\.hasDragged\) \{\n      return;\n    \}/g,
`  private handleCanvasMouseMove = (e: MouseEvent) => {
    if (this.isDragging || this.hasDragged || draggedColorSignal.get()) {
      return;
    }`
);

code = code.replace(
/  private handleCanvasPointerUp = \(e: PointerEvent\) => \{\n    if \(e\.pointerType === "mouse" && e\.button !== 0\) return;\n    \n    if \(this\.hasDragged\) \{\n      this\.hasDragged = false;\n      return;\n    \}/g,
`  private handleCanvasPointerUp = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    
    if (this.hasDragged) {
      this.hasDragged = false;
      return;
    }
    if (draggedColorSignal.get()) {
      return;
    }`
);

fs.writeFileSync('src/components/EaselBoard.ts', code);
