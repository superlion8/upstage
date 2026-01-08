/**
 * Claude Tool Adapters Index
 * Exports all Claude MCP tool adapters for use with Claude Agent SDK
 */

// Image generation tools (Gemini Imagen)
export {
    generateModelImageTool,
    changeOutfitTool,
    changeModelTool,
    replicateReferenceTool,
    editImageTool,
    imagenTools,
} from './imagen.js';

// Analysis and utility tools
export {
    stylistTool,
    analyzeImageTool,
    webScraperTool,
    socialAnalyzerTool,
    videoAnalyzerTool,
    analysisTools,
} from './analysis.js';

// Combined tool list for Claude Agent
export const allClaudeTools = [
    // From imagen.ts
    ...(await import('./imagen.js')).imagenTools,
    // From analysis.ts
    ...(await import('./analysis.js')).analysisTools,
];
