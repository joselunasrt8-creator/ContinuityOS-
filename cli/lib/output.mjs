import { writeFileSync } from "node:fs"

export function printJson(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n")
}

export function printError(message, code = 1) {
  process.stderr.write(`error: ${message}\n`)
  process.exit(code)
}

export function printLine(msg) {
  process.stdout.write(msg + "\n")
}

export function writeOutputFile(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8")
}
