/** Turns a stored base64 JPEG into an HTTP image response. */
export function jpegResponse(base64: string): Response {
  const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(bytes.byteLength),
      // Always the newest frame; the monitor cache-busts the URL anyway.
      "Cache-Control": "no-store",
    },
  });
}
