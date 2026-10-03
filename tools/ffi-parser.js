'use strict';

/** Split a Rust/JSON-ish parameter list on top-level commas. */
function splitParams(source) {
  const params = [];
  let depth = 0;
  let current = '';
  for (const character of source) {
    if (character === '(' || character === '<' || character === '[') depth++;
    else if (character === ')' || character === '>' || character === ']') depth--;
    if (character === ',' && depth === 0) {
      params.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  if (current.trim()) params.push(current.trim());
  return params;
}

/** Extract safe and unsafe `pub extern "C" fn bloom_*` names and arities. */
function extractRustFns(source) {
  const functions = new Map();
  const signature = /pub (?:unsafe )?extern "C" fn (bloom_[a-z0-9_]+)\s*\(/g;
  let match;
  while ((match = signature.exec(source)) !== null) {
    let depth = 1;
    let index = signature.lastIndex;
    const start = index;
    while (index < source.length && depth > 0) {
      if (source[index] === '(') depth++;
      else if (source[index] === ')') depth--;
      index++;
    }
    const params = splitParams(source.slice(start, index - 1)).filter(Boolean);
    // Paired cfg definitions share a name and arity; keep the first.
    if (!functions.has(match[1])) functions.set(match[1], params.length);
  }
  return functions;
}

module.exports = { splitParams, extractRustFns };
