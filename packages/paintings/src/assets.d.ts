/** A scene's picture, bundled as base64 (the build's loader for images). */
declare module "*.jpg" { const base64: string; export default base64; }
declare module "*.webp" { const base64: string; export default base64; }
