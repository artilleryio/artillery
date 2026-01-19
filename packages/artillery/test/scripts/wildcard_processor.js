exports.init = function init(context, _, done) {
  const socket = context.sockets[''];
  if (socket) {
    socket.on('*', () => {
      console.log('Wildcard captured');
    });
  } else {
    console.log('Could not find socket in context');
  }
  return done();
};
