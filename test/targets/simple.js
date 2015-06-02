var Interfake = require('interfake');
var target = new Interfake();
target.get('/test').status(200);
target.listen(3000);
