const tap = require('tap');
const _path = require('node:path');

const { commonPrefix } = require('../../lib/create-bom/create-bom');

tap.test('Test commonPrefix', async (t) => {
  const INPUTS = [
    {
      input: ['/home/user/documents/projectA', '/home/user/documents'],
      expected: '/home/user/documents/',
      sep: '/'
    },
    {
      input: ['/home/user/documents/projectA', '/home'],
      expected: '/home/',
      sep: '/'
    },
    {
      input: ['/home/user/acme.js', '/home/user/acme.yml'],
      expected: '/home/user/',
      sep: '/'
    },
    {
      input: ['/', '/user/acme.js'],
      expected: '/',
      sep: '/'
    },
    {
      input: ['/a/b', '/a/b/c', '/a/d'],
      expected: '/a/',
      sep: '/'
    },
    {
      input: ['C:\\', 'C:\\hello.txt'],
      expected: 'C:\\',
      sep: '\\'
    },
    {
      input: ['D:\\hello.txt', 'C:\\hello.txt'],
      expected: '',
      sep: '\\'
    },
    {
      input: [],
      expected: ''
    },
    {
      input: ['/'],
      expected: '/',
      sep: '/'
    },
    {
      input: ['/', '/hello'],
      expected: '/',
      sep: '/'
    },
    {
      input: ['/home/user'],
      expected: '/home/user/',
      sep: '/'
    },
    {
      input: ['/home/user/a', '/home/user/b'],
      expected: '/home/user/',
      sep: '/'
    },
    {
      input: ['/home/user/a', '/var/lib'],
      expected: '',
      sep: '/'
    },
    {
      input: ['C:\\Users\\Admin', 'D:\\Files'],
      expected: '',
      sep: '\\'
    },
    {
      input: ['C:\\Users\\Admin\\a', 'C:\\Users\\Admin\\b'],
      expected: 'C:\\Users\\Admin\\',
      sep: '\\'
    },
    {
      input: ['C:/Users/Admin/a', 'C:/Users/Admin/b'],
      expected: 'C:/Users/Admin/',
      sep: '/'
    },
    {
      input: ['/home/user/a/c', '/home/user/b/c'],
      expected: '/home/user/',
      sep: '/'
    },
    {
      input: ['/home/user/a/c/d', '/home/user/a/c'],
      expected: '/home/user/a/c/',
      sep: '/'
    },
    {
      input: ['/home/user', '/home/user'],
      expected: '/home/user/',
      sep: '/'
    },
    {
      input: [123, true, '/home/user'],
      expected: ''
    },
    {
      input: ['/', '/'],
      expected: '/',
      sep: '/'
    },
    {
      input: ['/', '/a', '/b'],
      expected: '/',
      sep: '/'
    },
    {
      input: ['C:\\'],
      expected: 'C:\\',
      sep: '\\'
    },
    {
      input: ['/home/user', 'C:\\Users\\Admin'],
      expected: ''
    },
    {
      input: ['/home/user name/a', '/home/user name/b'],
      expected: '/home/user name/',
      sep: '/'
    }
  ];

  for (const i of INPUTS) {
    const result = commonPrefix(i.input, i.sep);
    t.equal(
      result,
      i.expected,
      `commonPrefix should return ${i.expected} for input: ${JSON.stringify(
        i.input
      )} - got: ${result}`
    );
  }
});
