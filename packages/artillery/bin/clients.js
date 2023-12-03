const fetch = require('node-fetch');
const msg1 = 'hello world!';
const msg2 = 'zorbin!';


module.exports = {
  healthRequest: async function(context, events, done) {
    try {
      await fetch('https://horrorday.com/health', {
        method: 'GET'
      });
    } catch (error) {
      done(error);
    }
    events.emit('counter', 'my_counter', 1);
    events.emit('customMessage', `${msg1}`);
    events.emit('customMessage', `${msg2}`);
    done();
  }
};
