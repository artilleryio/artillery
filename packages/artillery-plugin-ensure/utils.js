const crypto = require('crypto');

const numericOperators = ['+', '-', '*', '/', '%', '^'];
const comparisonOperators = ['==', '<=', '>=', '<', '>'];
const booleanOperators = ['or', 'and', 'not', '?', ':', '(', ')'];
const builtInFunctions = ['ceil', 'floor', 'random', 'round'];

// List of known operators
const operators = [
  ...numericOperators,
  ...comparisonOperators,
  ...booleanOperators,
  ...builtInFunctions
];

const hashString = (str) => {
  const hash = crypto.createHash('sha256'); // sha256 is a good choice for uniqueness and speed
  hash.update(str);
  return hash.digest('hex'); // returns the hash as a string of hexadecimal numbers
};

const getOperatorRegularExp = () => {
  // Escape any characters that have special meaning in regex
  const escapedOperators = operators.map((char) =>
    ['+', '*', '.', '(', ')', '[', ']', '{', '}', '|', '\\', '?'].includes(char)
      ? `\\${char}`
      : char
  );
  // Join the array into a string, with each character separated by a pipe (|)
  const operatorsPattern = escapedOperators.join('|');

  // Now create a new RegExp object
  return new RegExp(`(${operatorsPattern})`);
};

const returnMetricNamesAfterFilters = (expression) => {
  const operatorPattern = getOperatorRegularExp();

  let tokens = expression.split(operatorPattern);

  tokens = tokens.filter(Boolean);

  tokens = tokens.map((token) => token.trim());

  tokens = tokens.filter(Boolean).filter((el) => {
    //exclude operators and numbers, and the remaining should be metric names
    return !operators.includes(el) && isNaN(el);
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
