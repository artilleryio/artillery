import _ from 'lodash';

export const emitCustomMetric = async (context, ee) => {
  const isESM = _.get(context, 'vars.isESM');
  console.log(`Got context using lodash: ${JSON.stringify(isESM)}`);
  ee.emit('counter', 'hey_from_esm', 1);
};

export const hookThatThrows = async (_context, _ee) => {
  throw new Error('error_from_async_hook');
};
