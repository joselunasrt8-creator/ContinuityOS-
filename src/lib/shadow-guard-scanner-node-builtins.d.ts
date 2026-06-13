declare module 'fs' {
  const fs: Record<string, never>
  export = fs
}

declare module 'path' {
  const path: Record<string, never>
  export = path
}
