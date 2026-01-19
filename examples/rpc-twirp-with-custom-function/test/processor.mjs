import { client } from 'twirpscript';
import { MakeHat } from '../twirp/protos/haberdasher.pb.js';

client.baseURL = 'http://localhost:8080';

function recordMetrics(startedAt, ee, error) {
  //you can add more domain specific metrics here dependant on the response
  ee.emit('counter', 'twirp.requests', 1);
  ee.emit('counter', 'twirp.responses', 1);
  if (error) {
    ee.emit('counter', 'twirp.responses.error', 1);
    ee.emit('counter', `twirp.codes.${error.code}`, 1);
  } else {
    ee.emit('counter', 'twirp.responses.success', 1);
  }
  
  const took = Number(process.hrtime.bigint() - startedAt) / 1e6;
  ee.emit('histogram', 'twirp.response_time', took);
}

export async function callRpcServer(_context, ee, _next) {
  const startedAt = process.hrtime.bigint();
  try {
    const res = await MakeHat({ inches: 15, potato: true });
    console.log(res);
    recordMetrics(startedAt, ee);
  } catch (error) {
    recordMetrics(startedAt, ee, error);
  }
}
