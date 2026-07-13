import { getCloudHttpClient } from './http-client.ts';

class Client {
  // Untyped JS class - properties assigned dynamically
  [key: string]: any;

  constructor({ apiKey, baseUrl }) {
    this.apiKey = apiKey || process.env.ARTILLERY_CLOUD_API_KEY;

    if (!apiKey) {
      const err = new Error();
      err.name = 'CloudAPIKeyMissing';
      throw err;
    }

    this.baseUrl =
      baseUrl ||
      process.env.ARTILLERY_CLOUD_ENDPOINT ||
      'https://app.artillery.io';

    this.whoamiEndpoint = `${this.baseUrl}/api/user/whoami`;
    this.stashDetailsEndpoint = `${this.baseUrl}/api/stash`;

    this.defaultHeaders = {
      'x-auth-token': this.apiKey
    };
  }

  async whoami() {
    const request = await getCloudHttpClient();
    const res = await request.get(this.whoamiEndpoint, {
      headers: this.defaultHeaders
    });

    const body = JSON.parse(res.body);
    this.orgId = body.activeOrg;
    return body;
  }

  async getStashDetails({ orgId }) {
    const request = await getCloudHttpClient();
    const currentOrgId = orgId || this.orgId;

    const res = await request.get(
      `${this.baseUrl}/api/org/${currentOrgId}/stash`,
      {
        headers: this.defaultHeaders
      }
    );

    if (res.statusCode === 200) {
      let body: any = {};
      try {
        body = JSON.parse(res.body);
      } catch (err) {
        console.error(err);
        return null;
      }

      if (body.url && body.token) {
        return { url: body.url, token: body.token };
      } else {
        return null;
      }
    } else {
      return null;
    }
  }
}

function createClient(opts) {
  return new Client(opts);
}

export { createClient };