type WordDictionary = Map<string, unknown> | Set<string>

function hasWord(dictionary: WordDictionary, value: string): boolean {
  const key = value.toLowerCase()
  return dictionary instanceof Set ? dictionary.has(key) : dictionary.has(key)
}

export function cleanPdfEnglishText(text: string, dictionary: WordDictionary = new Map()): string {
  const source = String(text || '').replace(/\r/g, '')
  const cleanedLines = source.split('\n').map(line => {
    const tokens = line.trim().replace(/[ \t]+/g, ' ').split(' ').filter(Boolean)
    const merged: string[] = []
    for (let index = 0; index < tokens.length; index += 1) {
      let current = tokens[index]
      while (/^[A-Za-z]+$/.test(current) && index + 1 < tokens.length && /^[A-Za-z]+$/.test(tokens[index + 1])) {
        const next = tokens[index + 1]
        const combined = `${current}${next}`
        const currentKnown = hasWord(dictionary, current)
        const nextKnown = hasWord(dictionary, next)
        const combinedKnown = hasWord(dictionary, combined)
        const shouldMerge = combinedKnown && (!currentKnown || !nextKnown || current.length <= 2 || next.length <= 2)
        if (!shouldMerge) break
        current = combined
        index += 1
      }
      merged.push(current)
    }
    return merged
      .join(' ')
      .replace(/\s+([,.;:!?%)]}”’])/g, '$1')
      .replace(/([([{“‘])\s+/g, '$1')
      .trim()
  })
  return cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
