function replaceOutsideCodeFence(markdown, replacer) {
  const lines = markdown.split('\n')
  const result = []
  let inFence = false
  let fenceChar = ''

  for (const line of lines) {
    const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})/)
    if (fenceMatch) {
      const currentFenceChar = fenceMatch[2][0]
      if (!inFence) {
        inFence = true
        fenceChar = currentFenceChar
      } else if (currentFenceChar === fenceChar) {
        inFence = false
        fenceChar = ''
      }
      result.push(line)
      continue
    }

    result.push(inFence ? line : replacer(line))
  }

  return result.join('\n')
}

function replacePlaceholders(src, placeholderMap) {
  return replaceOutsideCodeFence(src, (line) => {
    let result = line
    for (const [placeholder, url] of Object.entries(placeholderMap)) {
      result = result.replaceAll(placeholder, url)
    }
    return result
  })
}

function replacePlaceholdersEverywhere(src, placeholderMap) {
  let result = src
  for (const [placeholder, url] of Object.entries(placeholderMap)) {
    result = result.replaceAll(placeholder, url)
  }
  return result
}

function replacePlaceholdersForFile(code, id, placeholderMap) {
  const filePath = id.split('?')[0]

  if (filePath.endsWith('.md')) {
    return replacePlaceholders(code, placeholderMap)
  }

  if (filePath.endsWith('.vue')) {
    return replacePlaceholdersEverywhere(code, placeholderMap)
  }

  return code
}

export function markdownUrlReplacePlugin(placeholderMap) {
  return {
    name: 'markdown-url-replace',
    enforce: 'pre',
    transform(code, id) {
      if (!code.includes('{{URL_')) return null

      const transformed = replacePlaceholdersForFile(code, id, placeholderMap)
      if (transformed === code) return null
      return { code: transformed, map: null }
    },
  }
}
