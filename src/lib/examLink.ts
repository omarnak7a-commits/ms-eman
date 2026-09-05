/** The public student URL for an exam, matching the existing /exam/:slug route. */
export function examStudentUrl(slug: string): string {
  return `${window.location.origin}/exam/${slug}`;
}
