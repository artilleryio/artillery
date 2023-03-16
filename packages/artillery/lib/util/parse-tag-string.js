module.exports = function parseTagString(input) {
  const result = {
    tags: [],
    errors: []
  };

  if (!input) {
    return result;
  }

  const tagList = input.split(',').map((x) => x.trim());
  for (const t of tagList) {
    const cs = t.split(':');
    if (cs.length !== 2) {
      result.errors.push(t);
    } else {
      result.tags.push({ name: cs[0].trim(), value: cs[1].trim() });
    }
  }
  return result;
};
