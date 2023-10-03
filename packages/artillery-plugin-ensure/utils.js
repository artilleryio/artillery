const crypto = require('crypto');
const debug = require('debug')('plugin:ensure');

const numericOperators = ['+', '-', '*', '/', '%', '^'];
const comparisonOperators = ['==', '<=', '>=', '<', '>'];
const booleanOperators = ['?', ':', '(', ')'];
const builtInFunctions = ['ceil', 'floor', 'random', 'round'];
//these are boolean operators, but have to be treated specially because they can appear in words
const specialTextOperators = ['or', 'and', 'not'];

// List of known operators
const baseOperators = [
  ...numericOperators,
  ...comparisonOperators,
  ...booleanOperators
];

const hashString = (str) => {
  const hash = crypto.createHash('sha256'); // sha256 is a good choice for uniqueness and speed
  hash.update(str);
  return hash.digest('hex'); // returns the hash as a string of hexadecimal numbers
};

const getOperatorRegularExp = () => {
  // Escape any characters that have special meaning in regex
  const escapedOperators = baseOperators.map((char) =>
    ['+', '*', '.', '(', ')', '[', ']', '{', '}', '|', '\\', '?'].includes(char)
      ? `\\${char}`
      : char
  );
  // Join the array into a string, with each character separated by a pipe (|)
  const operatorsPattern = escapedOperators.join('|');
  //check for special operators being enclosed in word boundaries
  const specialOperatorsPattern = '\\band\\b|\\bor\\b|\\bnot\\b';

  // Now create a new RegExp object, with the special operators first as order matters
  return RegExp(`(${specialOperatorsPattern}|${operatorsPattern})`);
};

const returnMetricNamesAfterFilters = (expression) => {
  const operatorPattern = getOperatorRegularExp();

  //split by function calls regex first in case of built-in functions (e.g. ceil, floor, etc)
  let tokens = expression.split(/(\w+)\(([^)]+)\)/g);

  //split further by the remaining operators, and flatten the array
  tokens = tokens.flatMap((part) => {
    return part.split(operatorPattern);
  });

  //filter our undefineds and empty strings
  tokens = tokens.filter(Boolean);

  //trim empty spaces from tokens (e.g. " 20")
  tokens = tokens.map((token) => token.trim());

  //filter out the operators included in the tokens, now including the specially handled operators, as well as numbers.
  //everything remaining should be metric names
  tokens = tokens.filter(Boolean).filter((el) => {
    //exclude operators and numbers, and the remaining should be metric names
    return (
      ![
        ...baseOperators,
        ...specialTextOperators,
        ...builtInFunctions
      ].includes(el) && isNaN(el)
    );
  });

  return tokens;
};

function getMetricNames(expression) {
  let tmpExpression = expression;

  // Treat URLs as a special case
  const urlPlaceholders = {};
  const urlPattern = /(\w+:\/\/[^\s]+)/g;
  tmpExpression.match(urlPattern)?.forEach((match) => {
    const replacementString = `URL_PLACEHOLDER_${
      Object.keys(urlPlaceholders).length
    }`;
    tmpExpression = tmpExpression.replaceAll(match, replacementString);
    urlPlaceholders[replacementString] = match;
  });

  // Treat ternary operator as a special case
  const ternaryPattern = /(.*?)\?(.*?):(.*)/;
  const ternaryMatch = tmpExpression.match(ternaryPattern);
  if (ternaryMatch) {
    return {
      metricNames: [
        //if ternary is found, we call the filter function on each of the filtered parts of the ternary
        ...returnMetricNamesAfterFilters(ternaryMatch[1]),
        ...returnMetricNamesAfterFilters(ternaryMatch[2]),
        ...returnMetricNamesAfterFilters(ternaryMatch[3])
      ],
      urlPlaceholders
    };
  }

  const metricNames = returnMetricNamesAfterFilters(tmpExpression);
  debug(`Parsed Metric Names: ${JSON.stringify(metricNames)}`);

  return { metricNames, urlPlaceholders };
}

function returnExpressionWithHashes(expression) {
  let { metricNames, urlPlaceholders } = getMetricNames(expression);
  let finalExpression = expression;

  metricNames = metricNames.map((str) => {
    //return all url placeholders to original form
    for (let placeholder of Object.keys(urlPlaceholders)) {
      str = str.replace(placeholder, urlPlaceholders[placeholder]);
    }

    //hash only the metric names in the expression
    finalExpression = finalExpression.replaceAll(str, `'${hashString(str)}'`);
    return str;
  });

  return finalExpression;
}

module.exports = {
  returnExpressionWithHashes,
  hashString
};
