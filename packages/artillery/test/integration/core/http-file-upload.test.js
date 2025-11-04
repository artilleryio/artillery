

const { createTestServer } = require('../../targets/http-file-upload-server');
const { test, beforeEach, afterEach } = require('tap');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { $ } = require('zx');

let server;
let port;

beforeEach(async () => {
  server = await createTestServer();
  port = server.info.port;
});

afterEach((_t) => {
  server.stop();
});

async function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

test('HTTP engine successfully handles file uploads', async (t) => {
  const expectedFiles = [
    {
      fieldName: 'guide',
      fileName: 'artillery-installation.pdf',
      contentType: 'application/pdf'
    },
    {
      fieldName: 'logo',
      fileName: 'artillery-logo.jpg',
      contentType: 'image/jpeg'
    }
  ];

  const expectedOtherFields = {
    name: 'Artillery'
  };

  const override = {
    config: {
      target: `http://127.0.0.1:${port}`
    }
  };

  /// Run the test
  let output;
  try {
    output =
      await $`artillery run ${__dirname}/fixtures/http-file-upload.yml --overrides ${JSON.stringify(
        override
      )}`;
  } catch (err) {
    console.error('There has been an error in test run execution: ', err);
    t.fail(err);
  }
  // We log the response body from the processor so we can parse it from output
  const match = output.stdout.match(/RESPONSE BODY: (.*) RESPONSE BODY END/s);
  let data;
  if (match) {
    try {
      data = JSON.parse(match[1].trim());
    } catch (err) {
      console.error('Error parsing response body: ', err);
    }
  } else {
    console.error('Response body not found in output');
  }

  const files = data?.files;
  const fields = data?.fields;
  t.ok(
    data?.files && data?.fields,
    'Should successfully upload a combination of file and non-file form fields'
  );
  t.equal(data.status, 'success', 'Should have a success status');
  t.equal(
    files.length,
    expectedFiles.length,
    `${expectedFiles.length} files should be uploaded`
  );
  t.match(fields, expectedOtherFields, 'Should have the expected other fields');

  for (const expectedFile of expectedFiles) {
    const uploadedFile = files.find(
      (f) => f.fieldName === expectedFile.fieldName
    );

    if (!uploadedFile) {
      t.fail(
        `Could not find uploaded file with fieldName ${expectedFile.fieldName}`
      );
      continue;
    }

    const expectedHash = await calculateFileHash(
      `${__dirname}/fixtures/files/${expectedFile.fileName}`
    );

    t.equal(
      uploadedFile.originalFilename,
      expectedFile.fileName,
      `Should have uploaded the ${expectedFile.fileName} file under the correct field`
    );
    t.equal(
      uploadedFile.fileHash,
      expectedHash,
      'Uploaded file should match the sent file'
    );
    t.equal(
      uploadedFile.headers['content-type'],
      expectedFile.contentType,
      'Should have uploaded file with correct content type'
    );
  }
});
