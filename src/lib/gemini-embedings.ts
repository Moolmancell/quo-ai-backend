import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";

/**
 * Creates an instance of GoogleGenerativeAIEmbeddings that is patched 
 * at runtime to always request a specific dimension size.
 */
export const createGeminiEmbeddings = (dimensions: number = 768) => {
    // 1. Create the standard instance
    const embeddings = new GoogleGenerativeAIEmbeddings({
        model: "gemini-embedding-001",
        // apiKey is automatically picked up from process.env.GOOGLE_API_KEY
    });

    // 2. Grab a reference to the original private method
    const originalConvertToContent = (embeddings as any)._convertToContent.bind(embeddings);

    // 3. Override it on this specific object at runtime to bypass TypeScript class rules
    (embeddings as any)._convertToContent = (text: string) => {
        // Call the original method so we don't have to duplicate their cleaning logic
        const baseResult = originalConvertToContent(text);
        
        // Inject our desired dimensionality
        return {
            ...baseResult,
            outputDimensionality: dimensions
        };
    };

    return embeddings;
};