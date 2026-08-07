/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Parsing and formatting of --aws-tags. These tags are applied to
// AWS resources created for a test run: ECS/Fargate tasks, Lambda
// functions and SQS queues.

// https://docs.aws.amazon.com/tag-editor/latest/userguide/tagging.html
const TAG_KEY_MAX_LENGTH = 128;
const TAG_VALUE_MAX_LENGTH = 256;
const MAX_TAGS = 50;
const VALID_TAG_CHARS = /^[\p{L}\p{N} _.:/=+\-@]*$/u;

interface ResourceTag {
  key: string;
  value: string;
}

// Input format: "key:value,key:value". Values may contain ":" - the
// entry is split on the first ":" only. Throws on invalid input.
function parseResourceTags(input?: string | null): ResourceTag[] {
  if (!input) {
    return [];
  }

  const tags: ResourceTag[] = [];
  const errors: string[] = [];

  const entries = input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const entry of entries) {
    const sepIndex = entry.indexOf(':');
    if (sepIndex === -1) {
      errors.push(`"${entry}" - expected key:value format`);
      continue;
    }

    const key = entry.slice(0, sepIndex).trim();
    const value = entry.slice(sepIndex + 1).trim();

    if (key.length === 0) {
      errors.push(`"${entry}" - tag key is empty`);
    } else if (key.length > TAG_KEY_MAX_LENGTH) {
      errors.push(
        `"${entry}" - tag key exceeds ${TAG_KEY_MAX_LENGTH} characters`
      );
    } else if (key.toLowerCase().startsWith('aws:')) {
      errors.push(`"${entry}" - the "aws:" tag key prefix is reserved by AWS`);
    } else if (!VALID_TAG_CHARS.test(key)) {
      errors.push(`"${entry}" - tag key contains invalid characters`);
    } else if (value.length > TAG_VALUE_MAX_LENGTH) {
      errors.push(
        `"${entry}" - tag value exceeds ${TAG_VALUE_MAX_LENGTH} characters`
      );
    } else if (!VALID_TAG_CHARS.test(value)) {
      errors.push(`"${entry}" - tag value contains invalid characters`);
    } else if (tags.some((t) => t.key === key)) {
      errors.push(`"${entry}" - duplicate tag key`);
    } else {
      tags.push({ key, value });
    }
  }

  if (tags.length > MAX_TAGS) {
    errors.push(`a maximum of ${MAX_TAGS} tags is allowed`);
  }

  if (errors.length > 0) {
    throw new Error(`Invalid --aws-tags value:\n  - ${errors.join('\n  - ')}`);
  }

  return tags;
}

// SQS CreateQueue and Lambda CreateFunction/TagResource take a map
function toTagMap(tags: ResourceTag[]): Record<string, string> {
  return Object.fromEntries(tags.map((t) => [t.key, t.value]));
}

// ECS RunTask takes [{ key, value }]
function toEcsTags(tags: ResourceTag[]): ResourceTag[] {
  return tags.map((t) => ({ key: t.key, value: t.value }));
}

export { parseResourceTags, toTagMap, toEcsTags };
export type { ResourceTag };
