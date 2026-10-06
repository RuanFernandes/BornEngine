const assert = require('node:assert/strict');
const test = require('node:test');
const { getOIDCCredential } = require('@vscode/vsce/out/oidc');

test('Marketplace OIDC exchange includes the API version and federated auth scheme', async () => {
  const requests = [];
  const responses = [
    { statusCode: 200, statusMessage: 'OK', readBody: async () => JSON.stringify({ value: 'github-oidc-token' }) },
    { statusCode: 200, statusMessage: 'OK', readBody: async () => JSON.stringify({ credential: 'marketplace-session-token' }) },
  ];
  const request = async (url, options) => {
    requests.push({ url, options });
    return responses.shift();
  };

  const credential = await getOIDCCredential('nullborne', {
    environment: {
      GITHUB_ACTIONS: 'true',
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token.actions.example/id-token',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'github-runtime-token',
    },
    marketplaceUrl: 'https://marketplace.visualstudio.com',
    request,
  });

  assert.equal(credential, 'marketplace-session-token');
  assert.equal(requests.length, 2);
  assert.equal(new URL(requests[1].url).searchParams.get('api-version'), '7.2-preview.1');
  assert.equal(requests[1].options.headers.Authorization, 'FederatedToken github-oidc-token');
});
