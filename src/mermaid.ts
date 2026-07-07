// Turn an infograph node key (which may contain spaces and other characters) into
// a Mermaid-safe node identifier. Shared by every Mermaid producer so ids stay
// consistent across diagrams.
export function sanitizeId(key: string): string {
    return key.replace(/[^\w]/g, '_')
}
