import { spawn } from 'node:child_process';

/** Opens a file with the operating system's default handler (the browser, for .html). */
export function openWithSystem(file: string): Promise<void> {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [file]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '""', file]]
        : ['xdg-open', [file]];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.once('error', (error) =>
      reject(new Error(`Could not open the browser (${error.message}). Open ${file} manually.`)),
    );
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}
