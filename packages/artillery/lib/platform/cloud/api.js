const request = require('got');

class Client {
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
    const res = await request.get(this.whoamiEndpoint, {
      headers: this.defaultHeaders,
      throwHttpErrors: false,
      retry: {
        limit: 3
      }
    });

    const body = JSON.parse(res.body);
    this.orgId = body.activeOrg;
    return body;
  }

  async getStashDetails({ orgId }) {
    const currentOrgId = orgId || this.orgId;

    const res = await request.get(
      `${this.baseUrl}/api/org/${currentOrgId}/stash`,
      {
        headers: this.defaultHeaders,
        throwHttpErrors: false,
        retry: {
          limit: 3
        }
      }
    );

    if (res.statusCode === 200) {
      let body = {};
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

module.exports = {
  createClient
};
