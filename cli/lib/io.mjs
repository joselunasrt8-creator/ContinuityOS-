import { readFileSync } from "node:fs"
import { printError } from "./output.mjs"

export function readJsonFile(path) {
  let raw
  try {
    raw = readFileSync(path, "utf8")
  } catch (e) {
    printError(`cannot read file: ${path}`)
  }
  try {
    return JSON.parse(raw)
  } catch (e) {
    printError(`invalid JSON in file: ${path}`)
  }
}

export function requireArg(args, index, name) {
  const val = args[index]
  if (!val) printError(`missing required argument: <${name}>`)
  return val
}
