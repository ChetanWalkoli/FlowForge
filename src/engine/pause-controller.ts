/**
 * FlowForge — Execution Pause Controller
 * Pure TypeScript controller managing in-flight workflow pause/resume/step boundaries (FR-041).
 * Never uses eval() or new Function().
 */

export interface PauseControllerCallbacks {
  onPause?: () => void;
  onResume?: () => void;
}

export class ExecutionPauseController {
  private _isPaused = false;
  private _resumeResolver: (() => void) | null = null;
  private _pausePromise: Promise<void> | null = null;
  private _stepRequested = false;
  private readonly callbacks?: PauseControllerCallbacks;

  constructor(callbacks?: PauseControllerCallbacks) {
    this.callbacks = callbacks;
  }

  public get isPaused(): boolean {
    return this._isPaused;
  }

  public get isStepRequested(): boolean {
    return this._stepRequested;
  }

  /**
   * Pauses execution at the next node boundary.
   */
  public pause(): void {
    if (this._isPaused) return;
    this._isPaused = true;
    this._stepRequested = false;
    this._pausePromise = new Promise<void>((resolve) => {
      this._resumeResolver = resolve;
    });
    this.callbacks?.onPause?.();
  }

  /**
   * Resumes continuous execution until complete, cancelled, or paused again.
   */
  public resume(): void {
    if (!this._isPaused) return;
    this._isPaused = false;
    this._stepRequested = false;
    const resolver = this._resumeResolver;
    this._resumeResolver = null;
    this._pausePromise = null;
    resolver?.();
    this.callbacks?.onResume?.();
  }

  /**
   * Executes a single next node and automatically re-pauses afterwards.
   */
  public step(): void {
    if (!this._isPaused) return;
    this._stepRequested = true;
    const resolver = this._resumeResolver;
    this._pausePromise = new Promise<void>((resolve) => {
      this._resumeResolver = resolve;
    });
    resolver?.();
  }

  /**
   * Awaits until execution is resumed or cancelled if currently paused.
   * Returns true if execution was aborted while paused.
   */
  public async waitIfPaused(signal?: AbortSignal): Promise<boolean> {
    if (!this._isPaused || !this._pausePromise) {
      return signal?.aborted ?? false;
    }
    if (signal?.aborted) {
      return true;
    }

    await new Promise<void>((resolve) => {
      let settled = false;

      const onAbort = () => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        resolve();
      };

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }

      this._pausePromise?.then(() => {
        if (settled) return;
        settled = true;
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
        resolve();
      });
    });

    // If step was requested, pause again immediately after moving forward 1 node
    if (this._stepRequested) {
      this._stepRequested = false;
      this._isPaused = true;
      this._pausePromise = new Promise<void>((resolve) => {
        this._resumeResolver = resolve;
      });
    }

    return signal?.aborted ?? false;
  }
}

