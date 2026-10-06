/** Absolute public link for a persona. Call from client code after mount (needs window). */
export function shareUrl(slug: string): string {
  const path = `/p/${slug}`;
  return typeof window === "undefined" ? path : `${window.location.origin}${path}`;
}

/** Short form shown in the UI: host + path, without the scheme. */
export function displayUrl(slug: string): string {
  return shareUrl(slug).replace(/^https?:\/\//, "");
}
