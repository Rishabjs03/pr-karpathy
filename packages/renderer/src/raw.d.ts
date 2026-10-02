/** Files imported with a `?raw` suffix are bundled as strings (see tsup.shared.ts). */
declare module '*?raw' {
  const content: string;
  export default content;
}
