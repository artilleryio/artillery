// Copyright (c) Artillery Software Inc.
// SPDX-License-Identifier: BUSL-1.1
//
// Non-evaluation use of Artillery on Azure requires a commercial license

const { QueueClient } = require('@azure/storage-queue');
const { BlobServiceClient } = require('@azure/storage-blob');
const { DefaultAzureCredential } = require('@azure/identity');
const { randomUUID } = require('node:crypto');

function getAQS() {
  return new QueueClient(
    process.env.AZURE_STORAGE_QUEUE_URL,
    new DefaultAzureCredential()
  );
}

// Azure Queue Storage has a 64KB message limit
// Use 60KB threshold to leave margin for encoding overhead
const AQS_SIZE_LIMIT = 60 * 1024;

let blobContainerClient = null;

function getBlobClient() {
  if (!blobContainerClient) {
    const storageAccount = process.env.AZURE_STORAGE_ACCOUNT;
    const containerName = process.env.AZURE_STORAGE_BLOB_CONTAINER;
    if (!storageAccount || !containerName) {
      throw new Error(
        'AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_BLOB_CONTAINER must be set'
      );
    }
    const blobServiceClient = new BlobServiceClient(
      `https://${storageAccount}.blob.core.windows.net`,
      new DefaultAzureCredential()
    );
    blobContainerClient = blobServiceClient.getContainerClient(containerName);
  }
  return blobContainerClient;
}

async function sendMessage(queue, body, tags) {
  const payload = JSON.stringify({
    payload: body,
    attributes: tags.reduce((acc, tag) => {
      acc[tag.key] = tag.value;
      return acc;
    }, {})
  });

  // Check if payload exceeds Azure Queue Storage limit
  if (Buffer.byteLength(payload, 'utf8') > AQS_SIZE_LIMIT) {
    // Upload to blob storage and send reference
    const testId = tags.find((t) => t.key === 'testId')?.value;
    const workerId = tags.find((t) => t.key === 'workerId')?.value;
    const messageId = randomUUID();
    const blobName = `tests/${testId}/overflow/${workerId}/${messageId}.json`;

    const blobClient = getBlobClient().getBlockBlobClient(blobName);
    await blobClient.upload(payload, Buffer.byteLength(payload, 'utf8'));

    // Send reference message
    const refPayload = JSON.stringify({
      payload: {
        _overflowRef: blobName,
        event: body.event
      },
      attributes: tags.reduce((acc, tag) => {
        acc[tag.key] = tag.value;
        return acc;
      }, {})
    });

    return queue.sendMessage(refPayload);
  }

  return queue.sendMessage(payload);
}

module.exports = { getAQS, sendMessage };
