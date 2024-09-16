import { createHaberdasher } from '../../../../../examples/rpc-twirp-with-custom-function/twirp/protos/haberdasher.pb.js';

function choose(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export const haberdasher = {
  MakeHat: (size) => {
    return {
      inches: size.inches,
      color: choose(['red', 'green', 'blue', 'purple']),
      name: choose(['beanie', 'fedora', 'top hat', 'cowboy', 'beret'])
    };
  }
};

export const habderdasherHandler = createHaberdasher(haberdasher);
