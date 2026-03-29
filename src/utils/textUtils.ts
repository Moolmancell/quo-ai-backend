/**
 * Calculates the cosine similarity between two vectors.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let mA = 0;
    let mB = 0;

    for (let i = 0; i < vecA.length; i++) {
        const a = vecA[i];
        const b = vecB[i];

        if (a === undefined || b === undefined) continue;

        dotProduct += a * b;
        mA += a * a;
        mB += b * b;
    }

    const denominator = Math.sqrt(mA) * Math.sqrt(mB);
    return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Cleans RSS content by removing HTML tags, URLs, and collapsing whitespace.
 */
export function cleanRSSContent(content: string): string {
    return content
        .replace(/<[^>]*>/g, '') // Removes HTML tags
        .replace(/\bhttps?:\/\/\S+|www\.\S+/gi, '') // Removes URLs
        .replace(/\s+/g, ' ') // Collapses extra whitespace/newlines into single spaces
        .trim();
}

/**
 * Truncates long content by keeping the head and tail, omitting the middle.
 */
export function truncateContent(content: string, buffer: number = 5000): string {
    if (content.length > (buffer * 2)) {
        const head = content.substring(0, buffer);
        const tail = content.substring(content.length - buffer);
        return `${head}\n\n[...middle section omitted...]\n\n${tail}`;
    }
    return content;
}
