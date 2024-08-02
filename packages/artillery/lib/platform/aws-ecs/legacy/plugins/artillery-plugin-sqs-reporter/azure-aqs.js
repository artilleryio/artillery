// Copyright (c) Artillery Software Inc.
// SPDX-License-Identifier: BUSL-1.1
//
// Non-evaluation use of Artillery on Azure requires a commercial license

const { QueueClient } = require('@azure/storage-queue');
const { DefaultAzureCredential } = require('@azure/identity');

function getAQS() {
  return new QueueClient(
    process.env.AZURE_STORAGE_QUEUE_URL,
    new DefaultAzureCredential()
  );
}

function sendMessage(queue, body, tags) {
  const payload = JSON.stringify({
    payload: body,
    // attributes: this.tags
    attributes: tags.reduce((acc, tag) => {
      acc[tag.key] = tag.value;
      return acc;
    }, {})
  });

  return queue.sendMessage(payload);
}

module.exports = { getAQS, sendMessage };
