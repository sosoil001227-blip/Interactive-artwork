export function publicAssetURL(path: string) {
  const base = new URL(import.meta.env?.BASE_URL ?? '/', location.href)
  return new URL(path, base).href
}
