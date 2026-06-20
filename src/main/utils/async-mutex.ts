/**
 * Lightweight async mutex implementation using a queue-based approach.
 * No external dependencies required.
 */

export type MutexRelease = () => void;

/**
 * A queue-based async mutex that serializes access to a critical section.
 * Callers await `acquire()` which resolves when it is their turn.
 * The returned release function must be called to hand control to the next waiter.
 */
export class AsyncMutex {
  private _queue: Array<() => void> = [];
  private _locked = false;

  /**
   * Acquire the mutex. Returns a promise that resolves with a release function
   * when the caller's turn arrives.
   */
  acquire(): Promise<MutexRelease> {
    if (!this._locked) {
      this._locked = true;
      return Promise.resolve(this._createRelease());
    }

    return new Promise<MutexRelease>((resolve) => {
      this._queue.push(() => resolve(this._createRelease()));
    });
  }

  /**
   * Returns true if the mutex is currently held.
   */
  isLocked(): boolean {
    return this._locked;
  }

  private _createRelease(): MutexRelease {
    let released = false;
    return () => {
      if (released) return;
      released = true;

      const next = this._queue.shift();
      if (next) {
        next();
      } else {
        this._locked = false;
      }
    };
  }
}

/**
 * A keyed mutex that maintains a separate AsyncMutex per key.
 * Useful for per-instance locking where each instance is identified by a string key.
 */
export class KeyedMutex {
  private _mutexes = new Map<string, AsyncMutex>();

  /**
   * Acquire the mutex for the given key. Creates a new mutex on first access.
   */
  acquire(key: string): Promise<MutexRelease> {
    let mutex = this._mutexes.get(key);
    if (!mutex) {
      mutex = new AsyncMutex();
      this._mutexes.set(key, mutex);
    }
    return mutex.acquire();
  }

  /**
   * Returns true if the mutex for the given key is currently held.
   */
  isLocked(key: string): boolean {
    const mutex = this._mutexes.get(key);
    return mutex ? mutex.isLocked() : false;
  }
}
