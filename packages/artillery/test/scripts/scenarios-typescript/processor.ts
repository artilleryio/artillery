import _ from 'lodash';

export const myTest = async (context, ee) => {
  const isTypescript = _.get(context, 'vars.isTypescript');

  console.log(`Got context using lodash: ${JSON.stringify(isTypescript)}`);

  ee.emit('counter', 'hey_from_ts', 1);
};

export const processorWithError = async (_context, _ee) => {
  throw new Error('error_from_ts_processor');
};
