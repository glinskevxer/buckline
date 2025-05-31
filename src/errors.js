/**
 * One error family for the whole program.
 *
 * Every failure that a scaler, a grader or a bookkeeper could plausibly cause
 * carries a stable code and a path, so the command line can print something
 * useful and a caller can branch on the code rather than on the message text.
 * Programmer mistakes stay as plain TypeError and RangeError.
 */

export class BucklineError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'BucklineError';
    this.code = options.code ?? 'BUCKLINE';
    this.path = options.path ?? null;
    this.details = options.details ?? null;
    this.hint = options.hint ?? null;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }

  /** A flat object suitable for a json report or a log line. */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      path: this.path,
      details: this.details,
      hint: this.hint,
    };
  }
}

/** The input does not describe a log, a board or a ticket that could exist. */
export class ValidationError extends BucklineError {
  constructor(message, options = {}) {
    super(message, { code: 'VALIDATION', ...options });
    this.name = 'ValidationError';
    this.issues = options.issues ?? [];
  }

  toJSON() {
    return { ...super.toJSON(), issues: this.issues };
  }
}

/** A scale could not be computed from an otherwise valid log. */
export class ScaleError extends BucklineError {
  constructor(message, options = {}) {
    super(message, { code: 'SCALE', ...options });
    this.name = 'ScaleError';
  }
}

/** A grade could not be assigned, usually because the rule book has no entry. */
export class GradeError extends BucklineError {
  constructor(message, options = {}) {
    super(message, { code: 'GRADE', ...options });
    this.name = 'GradeError';
  }
}

/** A contract term is missing or contradicts another term. */
export class ContractError extends BucklineError {
  constructor(message, options = {}) {
    super(message, { code: 'CONTRACT', ...options });
    this.name = 'ContractError';
  }
}

/** Returns true for anything this program raised on purpose. */
export function isBucklineError(value) {
  return value instanceof BucklineError;
}

/**
 * Renders any thrown value as one or two lines for the command line.
 *
 * The hint is on its own line and it says what to do rather than what went
 * wrong. Putting it on the same line made the message too long to read at the
 * end of a long command, and putting it behind a verbose flag meant nobody
 * ever saw it.
 */
export function formatError(value) {
  if (isBucklineError(value)) {
    const where = value.path ? ` at ${value.path}` : '';
    const head = `${value.code}${where}: ${value.message}`;
    return value.hint ? `${head}\n  try: ${value.hint}` : head;
  }
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  return String(value);
}

/** Adds a hint to an error that has none, and leaves one that has alone. */
export function withHint(error, hint) {
  if (isBucklineError(error) && !error.hint) {
    error.hint = hint;
  }
  return error;
}
