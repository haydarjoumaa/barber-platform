/** Callers should return a generic temporary-unavailability response, never a credential error. */
export class PasswordCapacityError extends Error {
  constructor() {
    super("Password processing capacity reached");
    this.name = "PasswordCapacityError";
  }
}

/** No waiting queue: rejected requests do not retain passwords in pending jobs. */
export function createPasswordWorkLimit(maxActive: number) {
  if (!Number.isSafeInteger(maxActive) || maxActive < 1) throw new Error("Invalid password work limit");
  let active = 0;
  return async function run<T>(operation: () => Promise<T>): Promise<T> {
    if (active >= maxActive) throw new PasswordCapacityError();
    active++;
    try {
      return await operation();
    } finally {
      active--;
    }
  };
}

// Shared by hashing and both verification paths in this server module instance.
export const runPasswordWork = createPasswordWorkLimit(2);
