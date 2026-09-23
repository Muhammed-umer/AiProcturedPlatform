/** Turns a stored base64 JPEG into an HTTP image response. */
export function jpegResponse(base64: string): Response {
  const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(bytes.byteLength),
      // The monitor puts the frame's own timestamp in the URL, so a cached
      // copy is never stale. "private" keeps it in the invigilator's browser
      // only, never in anything shared between them and the server.
      "Cache-Control": "private, max-age=300",
    },
  });
}
