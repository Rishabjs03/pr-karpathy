import packageJson from '../package.json' with { type: 'json' };

export const TOOL_NAME = 'lucidiff';
export const VERSION: string = packageJson.version;
