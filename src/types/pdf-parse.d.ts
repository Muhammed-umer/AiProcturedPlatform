// pdf-parse ships no types for its inner entry point. We import that entry
// point directly (rather than the package index) so it does not try to read a
// bundled sample PDF at import time.
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult {
    text: string;
    numpages: number;
    info: unknown;
  }
  function pdfParse(dataBuffer: Buffer): Promise<PdfParseResult>;
  export default pdfParse;
}
