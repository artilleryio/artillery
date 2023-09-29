const crypto = require('crypto');

const numericOperators = ['+', '-', '*', '/', '%', '^'];
const comparisonOperators = ['==', '<', '<=', '>', '>='];
const booleanOperators = ['or', 'and', 'not', '?', ':', '(', ')'];
const builtInFunctions = ['ceil', 'floor', 'random', 'round'];

// List of known operators
const operators = [
  ...numericOperators,
  ...comparisonOperators,
  ...booleanOperators,
  ...builtInFunctions
];

function hashString(str) {
  const hash = crypto.createHash('sha256'); // sha256 is a good choice for uniqueness and speed
  hash.update(str);
  return hash.digest('hex'); // returns the hash as a string of hexadecimal numbers
}

function returnExpressionWithHashes(expression) {
  let metricNames = expression
    //1. split by spaces first to divide into chunks
    .split(/\s+/)
    .filter(Boolean)
    //2. check for potential builtInFunction usage and flatten arguments
    .flatMap((part) => {
      const functionPattern = /(\w+)\(([^)]+)\)/;

      if (functionPattern.test(part)) {
        // Handle function calls by splitting arguments further
        const [, functionName, args] = part.match(functionPattern);
        const bleh = [functionName, ...args.split(/, */)];
        return bleh;
      }

      return part.split();
    })
    //3. filter out operators and user input numbers
    .filter((el) => {
      return !operators.includes(el) && isNaN(el);
    });

  let finalExpression = expression;

  metricNames.forEach((metricString) => {
    finalExpression = finalExpression.replaceAll(
      metricString,
      `'${hashString(metricString)}'` //include quotes '' in string due to filtrex
    );
  });

  return finalExpression;
}

module.exports = {
  returnExpressionWithHashes,
  hashString
};
