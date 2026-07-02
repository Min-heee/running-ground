import assert from 'node:assert/strict';
import test from 'node:test';
import { routeLegalRequest } from './legalRoutes.mjs';

function createStubResponse() {
  const state = { statusCode: null, headers: null, body: undefined, ended: false };
  return {
    state,
    writeHead(statusCode, headers) {
      state.statusCode = statusCode;
      state.headers = headers;
    },
    end(body) {
      state.body = body;
      state.ended = true;
    },
  };
}

test('serves the privacy policy on BOTH /privacy and /privacy-policy', () => {
  for (const pathname of ['/privacy', '/privacy-policy']) {
    const response = createStubResponse();
    const handled = routeLegalRequest({ pathname, method: 'GET', response });

    assert.equal(handled, true, `expected ${pathname} to be handled`);
    assert.equal(response.state.statusCode, 200);
    assert.equal(response.state.headers['content-type'], 'text/html; charset=utf-8');
    assert.match(response.state.body, /개인정보처리방침/);
  }
});

test('HEAD responds 200 without a body', () => {
  const response = createStubResponse();
  const handled = routeLegalRequest({ pathname: '/privacy', method: 'HEAD', response });

  assert.equal(handled, true);
  assert.equal(response.state.statusCode, 200);
  assert.equal(response.state.body, undefined);
  assert.equal(response.state.ended, true);
});

test('other paths and methods fall through to the API chain', () => {
  const response = createStubResponse();
  assert.equal(routeLegalRequest({ pathname: '/api/health', method: 'GET', response }), false);
  assert.equal(routeLegalRequest({ pathname: '/privacy', method: 'POST', response }), false);
  assert.equal(response.state.ended, false);
});
