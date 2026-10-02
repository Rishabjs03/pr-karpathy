/**
 * Schemas and types shared by the pipeline and the renderer.
 *
 * This entry point (`@lucidiff/core/schema`) imports only `zod`, so the renderer can depend
 * on it without loading the LLM or GitHub clients.
 */
export * from './llm';
export * from './document';
