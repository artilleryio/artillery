module.exports = {
  setCookieAndConnectWebSocket: async function(context, events, done) {
    events.emit('message', 'zzzzzz');
  }
};
