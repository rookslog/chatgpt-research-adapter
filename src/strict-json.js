function strictError(message) {
  const error = new SyntaxError(message);
  error.code = 'ERR_STRICT_JSON';
  throw error;
}

function scanJson(text) {
  let index = 0;
  const space = () => { while (/[\x20\x09\x0a\x0d]/.test(text[index] ?? '')) index += 1; };
  const string = () => {
    const start = index;
    if (text[index++] !== '"') strictError('expected string');
    while (index < text.length) {
      const character = text[index++];
      if (character === '"') return text.slice(start, index);
      if (character === '\\') { const escaped = text[index++]; if (!'"\\/bfnrtu'.includes(escaped ?? '')) strictError('invalid escape'); if (escaped === 'u') { for (let count = 0; count < 4; count += 1) if (!/[0-9a-fA-F]/.test(text[index++] ?? '')) strictError('invalid unicode escape'); } }
      else if (character.charCodeAt(0) < 0x20) strictError('control character in string');
    }
    strictError('unterminated string');
  };
  const value = () => {
    space(); const character = text[index];
    if (character === '{') return object();
    if (character === '[') return array();
    if (character === '"') return string();
    if (text.startsWith('true', index)) { index += 4; return; }
    if (text.startsWith('false', index)) { index += 5; return; }
    if (text.startsWith('null', index)) { index += 4; return; }
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(index));
    if (!match) strictError('invalid JSON value');
    index += match[0].length;
  };
  const object = () => {
    index += 1; space(); const keys = new Set();
    if (text[index] === '}') { index += 1; return; }
    while (true) {
      space(); if (text[index] !== '"') strictError('object key must be string');
      const key = JSON.parse(string());
      if (keys.has(key)) strictError('duplicate object key');
      keys.add(key); space(); if (text[index++] !== ':') strictError('missing colon'); value(); space();
      if (text[index] === '}') { index += 1; return; }
      if (text[index++] !== ',') strictError('missing comma');
    }
  };
  const array = () => {
    index += 1; space(); if (text[index] === ']') { index += 1; return; }
    while (true) { value(); space(); if (text[index] === ']') { index += 1; return; } if (text[index++] !== ',') strictError('missing comma'); }
  };
  value(); space(); if (index !== text.length) strictError('trailing content');
};

function rejectUnpaired(value) {
  if (typeof value === 'string') {
    for (let index = 0; index < value.length; index += 1) {
      const unit = value.charCodeAt(index);
      if (unit >= 0xd800 && unit <= 0xdbff && (index + 1 === value.length || value.charCodeAt(index + 1) < 0xdc00 || value.charCodeAt(index + 1) > 0xdfff)) strictError('unpaired surrogate');
      if (unit >= 0xdc00 && unit <= 0xdfff && (index === 0 || value.charCodeAt(index - 1) < 0xd800 || value.charCodeAt(index - 1) > 0xdbff)) strictError('unpaired surrogate');
    }
  } else if (Array.isArray(value)) value.forEach(rejectUnpaired);
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => { rejectUnpaired(key); rejectUnpaired(child); });
}

export function parseStrictJson(text, { requireObjectRoot = false } = {}) {
  try {
    if (typeof text !== 'string' || text.startsWith('\uFEFF')) strictError('invalid JSON input');
    scanJson(text);
    const parsed = JSON.parse(text);
    rejectUnpaired(parsed);
    if (requireObjectRoot && (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')) strictError('JSON root must be an object');
    return parsed;
  } catch (error) { if (error?.code === 'ERR_STRICT_JSON') throw error; strictError('malformed JSON'); }
}

export function parseStrictJsonBuffer(bytes, options) {
  try { return parseStrictJson(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes), options); }
  catch (error) { if (error?.code === 'ERR_STRICT_JSON') throw error; strictError('invalid UTF-8'); }
}
