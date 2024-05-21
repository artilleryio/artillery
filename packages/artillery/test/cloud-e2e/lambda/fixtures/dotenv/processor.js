function getFruit(context, ee, next) {
  ee.emit('counter', `fruit.${process.env.FRUIT}`, 1);
  next();
}

module.exports = {
  getFruit
};
