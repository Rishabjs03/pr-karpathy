/**
 * Terminal output: a spinner per pipeline stage, plus plain status lines.
 *
 * Everything goes to stderr, so stdout stays clean for `--json`. When stderr is not a terminal
 * (CI, pipes), the spinner is replaced by one line per finished stage.
 */
import pc from 'picocolors';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export interface Logger {
  /** Starts a stage. Call the returned function to finish it. */
  stage(label: string): StageHandle;
  info(message: string): void;
  warn(message: string): void;
  /** Only printed with --verbose. */
  debug(message: string): void;
  error(message: string): void;
}

export interface StageHandle {
  /** Updates the text shown next to the spinner. */
  update(detail: string): void;
  succeed(detail?: string): void;
  fail(detail?: string): void;
}

export interface LoggerOptions {
  stream: NodeJS.WritableStream & { isTTY?: boolean };
  verbose: boolean;
  /** Disable spinners and colors (for tests and CI). */
  plain?: boolean;
}

function seconds(start: number): string {
  return `${((Date.now() - start) / 1000).toFixed(1)}s`;
}

export function createLogger({ stream, verbose, plain }: LoggerOptions): Logger {
  const interactive = !plain && Boolean(stream.isTTY);
  const color = interactive ? pc : pc.createColors(false);
  let active: { clear: () => void } | null = null;

  const write = (line: string) => {
    active?.clear();
    stream.write(`${line}\n`);
  };

  return {
    stage(label) {
      const start = Date.now();
      let detail = '';
      let frame = 0;
      let timer: NodeJS.Timeout | undefined;

      const render = () => {
        const text = `${color.cyan(FRAMES[frame % FRAMES.length] ?? '')} ${label}${detail ? color.dim(` ${detail}`) : ''}`;
        stream.write(`\r\u001b[2K${text}`);
        frame += 1;
      };
      const clear = () => {
        if (interactive) stream.write('\r\u001b[2K');
      };
      const stop = () => {
        if (timer) clearInterval(timer);
        clear();
        if (active?.clear === clear) active = null;
      };

      if (interactive) {
        active = { clear };
        render();
        timer = setInterval(render, 80);
        timer.unref();
      }

      return {
        update(next) {
          detail = next;
        },
        succeed(final) {
          stop();
          const suffix = final ?? detail;
          stream.write(
            `${color.green('✔')} ${label}${suffix ? color.dim(` ${suffix}`) : ''} ${color.dim(seconds(start))}\n`,
          );
        },
        fail(final) {
          stop();
          stream.write(`${color.red('✖')} ${label}${final ? color.dim(` ${final}`) : ''}\n`);
        },
      };
    },
    info: (message) => write(message),
    warn: (message) => write(`${color.yellow('!')} ${message}`),
    debug: (message) => {
      if (verbose) write(color.dim(message));
    },
    error: (message) => write(`${color.red('Error:')} ${message}`),
  };
}
