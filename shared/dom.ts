const elements = new Map<string, HTMLElement>()

export function element<T extends HTMLElement = HTMLElement>(id: string): T {
  let node = elements.get(id)
  if (!node) { node = document.getElementById(id)!; elements.set(id, node) }
  return node as T
}

export function setText(node: HTMLElement, value: string) {
  if (node.textContent !== value) node.textContent = value
}
