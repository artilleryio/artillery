// Compute pricing for AWS Lambda
// GB/second divided by 10e10
module.exports = {
  base: {
    x86: 1666670
  },
  'af-south-1': {
    x86: 2210000
  },
  'ap-east-1': {
    x86: 2292000,
  },
  'eu-south-1': {
    x86: 1951720
  },
  'me-south-1': {
    x86: 2066670
  },
  'me-central-1': {
    x86: 2066670
  }
};
