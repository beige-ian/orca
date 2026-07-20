import {
  createTomlLineScanState,
  getTomlTableHeader,
  isTomlStructuralLine,
  updateTomlLineScanState
} from './config-toml-line-scan'

const ORCA_DISABLED_BROWSER_TABLES = [
  { header: '[mcp_servers.node_repl]', path: ['mcp_servers', 'node_repl'] },
  {
    header: '[plugins."browser@openai-bundled"]',
    path: ['plugins', 'browser@openai-bundled']
  }
] as const

export function applyOrcaBrowserRoutingConfig(config: string): string {
  return ORCA_DISABLED_BROWSER_TABLES.reduce(forceTomlTableDisabled, config)
}

function forceTomlTableDisabled(
  config: string,
  target: (typeof ORCA_DISABLED_BROWSER_TABLES)[number]
): string {
  const lines = config.split('\n')
  const sections = findTomlSections(lines).filter((section) =>
    tomlTablePathEquals(section.header, target.path)
  )
  if (sections.length === 0) {
    return appendDisabledTomlTable(config, target.header)
  }

  for (const section of sections.toReversed()) {
    const enabledIndex = findEnabledLine(lines, section.start + 1, section.end)
    if (enabledIndex === null) {
      lines.splice(section.start + 1, 0, withMatchingCarriageReturn('enabled = false', lines))
      continue
    }
    lines[enabledIndex] = replaceEnabledValue(lines[enabledIndex] ?? '')
  }
  return lines.join('\n')
}

type TomlSectionRange = { header: string; start: number; end: number }

function findTomlSections(lines: readonly string[]): TomlSectionRange[] {
  const sections: TomlSectionRange[] = []
  let current: Omit<TomlSectionRange, 'end'> | null = null
  let scanState = createTomlLineScanState()

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const header = isTomlStructuralLine(scanState) ? getTomlTableHeader(line) : null
    if (header) {
      if (current) {
        sections.push({ ...current, end: index })
      }
      current = { header: header.trim(), start: index }
    }
    scanState = updateTomlLineScanState(scanState, line)
  }
  if (current) {
    sections.push({ ...current, end: lines.length })
  }
  return sections
}

function findEnabledLine(lines: readonly string[], start: number, end: number): number | null {
  let scanState = createTomlLineScanState()
  for (let index = start; index < end; index += 1) {
    const line = lines[index] ?? ''
    if (isTomlStructuralLine(scanState) && /^[ \t]*enabled[ \t]*=/.test(line)) {
      return index
    }
    scanState = updateTomlLineScanState(scanState, line)
  }
  return null
}

function replaceEnabledValue(line: string): string {
  const match = /^([ \t]*)enabled[ \t]*=[ \t]*(?:true|false)([ \t]*#.*)?(\r?)$/.exec(line)
  return match ? `${match[1]}enabled = false${match[2] ?? ''}${match[3]}` : line
}

function tomlTablePathEquals(header: string, targetPath: readonly string[]): boolean {
  const parsedPath = parseTomlTablePath(header)
  return (
    parsedPath?.length === targetPath.length &&
    parsedPath.every((segment, index) => segment === targetPath[index])
  )
}

function parseTomlTablePath(header: string): string[] | null {
  const trimmed = header.trim()
  if (!trimmed.startsWith('[') || trimmed.startsWith('[[') || !trimmed.endsWith(']')) {
    return null
  }
  const inner = trimmed.slice(1, -1)
  const path: string[] = []
  let index = 0

  while (index < inner.length) {
    index = skipWhitespace(inner, index)
    const parsedKey = parseTomlKey(inner, index)
    if (!parsedKey) {
      return null
    }
    path.push(parsedKey.value)
    index = skipWhitespace(inner, parsedKey.nextIndex)
    if (index === inner.length) {
      return path
    }
    if (inner[index] !== '.') {
      return null
    }
    index += 1
  }
  return null
}

function parseTomlKey(
  input: string,
  startIndex: number
): { value: string; nextIndex: number } | null {
  const quote = input[startIndex]
  if (quote === "'") {
    const endIndex = input.indexOf("'", startIndex + 1)
    return endIndex === -1
      ? null
      : { value: input.slice(startIndex + 1, endIndex), nextIndex: endIndex + 1 }
  }
  if (quote === '"') {
    let index = startIndex + 1
    let value = ''
    while (index < input.length) {
      const char = input[index]
      if (char === '"') {
        return { value, nextIndex: index + 1 }
      }
      if (char === '\\') {
        const escaped = input[index + 1]
        if (escaped !== '"' && escaped !== '\\') {
          return null
        }
        value += escaped
        index += 2
        continue
      }
      value += char
      index += 1
    }
    return null
  }

  const match = /^[A-Za-z0-9_-]+/.exec(input.slice(startIndex))
  return match ? { value: match[0], nextIndex: startIndex + match[0].length } : null
}

function skipWhitespace(input: string, startIndex: number): number {
  let index = startIndex
  while (input[index] === ' ' || input[index] === '\t') {
    index += 1
  }
  return index
}

function appendDisabledTomlTable(config: string, targetHeader: string): string {
  const newline = config.includes('\r\n') ? '\r\n' : '\n'
  const separator = config.length === 0 || config.endsWith('\n') ? '' : newline
  return `${config}${separator}${targetHeader}${newline}enabled = false${newline}`
}

function withMatchingCarriageReturn(line: string, lines: readonly string[]): string {
  return lines.some((candidate) => candidate.endsWith('\r')) ? `${line}\r` : line
}
