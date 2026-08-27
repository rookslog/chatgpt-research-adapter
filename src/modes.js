export const MODES = Object.freeze(['standard', 'web', 'deep', 'image']);

function modeError(message, code) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}

function assertReason(reason) {
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw modeError('mode reason must be a nonblank string', 'ERR_MODE_REASON');
  }
}

export function resolveMode(mode, reason) {
  if (mode === undefined) {
    if (reason !== undefined) throw modeError('mode reason requires an explicit mode', 'ERR_MODE_REASON');
    return Object.freeze({ mode: 'standard', reason: 'default' });
  }
  if (typeof mode !== 'string' || !MODES.includes(mode)) {
    throw modeError('mode must be one of standard, web, deep, image', 'ERR_MODE');
  }
  if (mode === 'standard' && reason === undefined) {
    return Object.freeze({ mode, reason: 'explicit-standard' });
  }
  assertReason(reason);
  return Object.freeze({ mode, reason });
}
