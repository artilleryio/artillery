const crypto = require('crypto');
const debug = require('debug')('plugin:ensure');

const hashString = (str) => {
  const hash = crypto.createHash('sha256'); // sha256 is a good choice for uniqueness and speed
  hash.update(str);
  return hash.digest('hex');
};

function replaceMetricsWithHashes(replacementsArray, targetString) {
  let skippedMetrics = [];

  replacementsArray.forEach((str) => {
    if (targetString.includes(str)) {
      while (targetString.includes(str)) {
        targetString = targetString.replace(str, `'${hashString(str)}'`);
      }
    } else {
      debug(`Warning: Skipping non-string replacement value: ${str}`);
      skippedMetrics.push(str);
    }
  });

  if (skippedMetrics.length > 0) {
    debug(
      "WARNING: The following metrics from the report were skipped because they weren't found in your expression. It's possible you misspelled them or they're not being reported by your test."
    );
    debug(skippedMetrics);
  }

  return targetString;
}

function getHashedVarToValueMap(varsWithHashes) {
  let hashedMetrics = {};

  for (const metric of Object.values(varsWithHashes)) {
    hashedMetrics[metric.hash] = metric.value;
  }

  return hashedMetrics;
}

module.exports = {
  hashString,
  replaceMetricsWithHashes,
  getHashedVarToValueMap
};
