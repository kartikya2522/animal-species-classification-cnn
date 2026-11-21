/** In-page anchor id for source `id` of a chat message (`scope`). */
export function citationAnchor(scope: string, id: number) {
  return `cite-${scope}-${id}`
}
