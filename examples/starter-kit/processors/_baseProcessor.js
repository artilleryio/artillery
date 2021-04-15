var faker = require('faker');

module.exports = {
    generateRandomData: (userContext, events, done) => {
        userContext.vars.name = faker.name.findName();
        userContext.vars.id = faker.datatype.number({
            'min': 543200000,
            'max': 555550000
        });
        return done();
    },
    generateRandomTiming:  (userContext, events, done) => {
        userContext.vars.timing = faker.datatype.number({
            'min': 100,
            'max': 3000
        });
        return done();
    },
    printStatus: (requestParams, response, context, ee, next) => {
        console.log(`ENDPOINT: [${response.request.method}] ${response.request.uri.path}: ${response.statusCode}`);
        if (response.statusCode >= 400) {
            console.warn(response.body);
        }
        return next();
    }
};