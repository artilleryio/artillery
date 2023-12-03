const io = require('socket.io-client');
const fetch = require('node-fetch');
const duration = 200000;

async function fetchWithRetry(url, options = {}, retries = 3, backoff = 300) {
  let lastError;

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        return response;
      }
      lastError = new Error(`Cookie request failed: ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise(resolve => setTimeout(resolve, backoff));
    backoff *= 2; // Exponential backoff
  }

  throw lastError;
}

module.exports = {
  setCookieAndConnectWebSocket: async function(context, events, done) {
    try {
      await fetchWithRetry('https://98y98340923u4.com/set-cookie', {
        method: 'GET',
      });
    } catch (error) {
      done(error);
    }

    try {
      const socket = io('https://98y98340923u4.com', {
        transports: ['websocket'],
        withCredentials: true,
      });

      setTimeout(() => {
        socket.disconnect();
        events.emit('counter', 'my_counter', 1);
        events.emit('customMessage', 'zzzzzzzzz');
        done();
      }, duration);
    } catch {
      const errorWS = "WebSocket connection error";
      done(new Error(errorWS));
    }
  }
};
