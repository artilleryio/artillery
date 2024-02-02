const fs = require('fs');
const path = require('path');

const commitSha = process.env.COMMIT_SHA;

const filePath = path.join(
  __dirname,
  '../../../packages/artillery/lib/platform/aws-ecs/legacy/constants.js'
);

try {
  let content = fs.readFileSync(filePath, 'utf8');

  // This regex matches "const DEFAULT_IMAGE_TAG" followed by any characters, and then an equal sign and more characters
  // until it reaches a semicolon or end of the line
  const regex = /const DEFAULT_IMAGE_TAG\s*=\s*(['"])[^'"]*?\1/;
  const replacement = `const DEFAULT_IMAGE_TAG = '${commitSha}'`; // Replace with commitSha in single quotes
  content = content.replace(regex, replacement);

  // Write the modified content back to the file
  fs.writeFileSync(filePath, content);

  // Verify by reading the content again and console logging it
  const verifyContent = fs.readFileSync(filePath, 'utf8');
  console.log(verifyContent);

  if (!verifyContent.includes(commitSha)) {
    throw new Error('Failed to replace commit SHA in JS file');
  }
} catch (error) {
  console.error('Error occurred:', error);
}
