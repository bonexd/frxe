const RESET_PREFIXES = [
  'vitr.web.',
  'frxe.web.',
  'nont.music.youtube.',
];

export function resetVitrWebStorage(storage = localStorage) {
  const removed = [];
  const length = Number(storage?.length || 0);
  const keys = [];

  for (let index = 0; index < length; index += 1) {
    const key = storage.key(index);
    if (key) keys.push(key);
  }

  for (const key of keys) {
    if (!RESET_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
    storage.removeItem(key);
    removed.push(key);
  }

  return removed;
}

export { RESET_PREFIXES };
