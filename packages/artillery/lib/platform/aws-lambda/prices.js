// Compute pricing for AWS Lambda
// GB/second divided by 10e10
// https://aws.amazon.com/lambda/pricing/
module.exports = {
  base: {
    x86_64: 1666670,
    arm64: 1333340
  },
  'af-south-1': {
    x86_64: 2210000,
    arm64: 1768000
  },
  'ap-east-1': {
    x86_64: 2292000,
    arm64: 1830000
  },
  'eu-south-1': {
    x86_64: 1951720,
    arm64: 1561380
  },
  'me-south-1': {
    x86_64: 2066670,
    arm64: 1653340
  },
  'me-central-1': {
    x86_64: 2066670,
    arm64: 1653340
  }
};
