'use strict';

function parseTags(input) {
  let tags = [];
  if (input) {
    const tagList = input.split(',').map((x) => x.trim());
    for (const t of tagList) {
      const cs = t.split(':');
      if (cs.length !== 2) {
        console.error(`Invalid tag, skipping: ${t}`);
      } else {
        tags.push({ name: cs[0].trim(), value: cs[1].trim() });
      }
    }
  }

  return tags;
}

module.exports = {
  parseTags
};
