const { customAlphabet } = require('nanoid');

function generateId(prefix = '') {
  const idf = customAlphabet('3456789abcdefghjkmnpqrtwxyz');
  const testRunId = `${prefix}${idf(4)}_${idf(29)}_${idf(4)}`;
  return testRunId;
}

module.exports = generateId;
