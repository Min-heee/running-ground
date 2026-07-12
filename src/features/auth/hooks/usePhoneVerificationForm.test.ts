import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';

import { usePhoneVerificationForm } from './usePhoneVerificationForm';

// The shared signup/recovery phone-OTP hook (P0-1 launch flow). These tests pin the
// request → cooldown → verify → reset state transitions against mocked services so
// the consolidated hook cannot drift from the behavior both callers shipped with.
//
// The repo's test runner is plain node:test (no DOM, no react renderer), so the hook
// is driven through React's dispatcher seam with a minimal useState/useRef/
// useCallback/useEffect harness. State setters apply immediately and every action is
// followed by a re-render, which is equivalent for these pins because the hook only
// reads state captured at render time.

type StateCell = { kind: 'state'; value: unknown; setter: (next: unknown) => void };
type RefCell = { kind: 'ref'; ref: { current: unknown } };
type CallbackCell = { kind: 'callback'; deps: unknown[] | undefined; fn: unknown };
type EffectCell = { kind: 'effect'; deps: unknown[] | undefined; cleanup: (() => void) | void };
type Cell = StateCell | RefCell | CallbackCell | EffectCell;

const ReactInternals = (React as unknown as Record<string, { H: unknown }>)
  .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

function depsEqual(previous: unknown[] | undefined, next: unknown[] | undefined) {
  if (!previous || !next || previous.length !== next.length) {
    return false;
  }
  return previous.every((item, index) => Object.is(item, next[index]));
}

function createHookHarness<T>(runHook: () => T) {
  const cells: Cell[] = [];
  let cursor = 0;
  let pendingEffects: (() => void)[] = [];

  const dispatcher = {
    useState(initial: unknown) {
      const index = cursor++;
      if (!cells[index]) {
        const cell: StateCell = {
          kind: 'state',
          value: typeof initial === 'function' ? (initial as () => unknown)() : initial,
          setter: (next: unknown) => {
            cell.value = typeof next === 'function'
              ? (next as (current: unknown) => unknown)(cell.value)
              : next;
          },
        };
        cells[index] = cell;
      }
      const cell = cells[index] as StateCell;
      return [cell.value, cell.setter];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      if (!cells[index]) {
        cells[index] = { kind: 'ref', ref: { current: initial } };
      }
      return (cells[index] as RefCell).ref;
    },
    useCallback(fn: unknown, deps: unknown[] | undefined) {
      const index = cursor++;
      const previous = cells[index] as CallbackCell | undefined;
      if (previous && depsEqual(previous.deps, deps)) {
        return previous.fn;
      }
      cells[index] = { kind: 'callback', deps, fn };
      return fn;
    },
    useEffect(effect: () => (() => void) | void, deps: unknown[] | undefined) {
      const index = cursor++;
      const existing = cells[index] as EffectCell | undefined;
      if (!existing) {
        const cell: EffectCell = { kind: 'effect', deps, cleanup: undefined };
        cells[index] = cell;
        pendingEffects.push(() => {
          cell.cleanup = effect();
        });
        return;
      }
      if (!depsEqual(existing.deps, deps)) {
        pendingEffects.push(() => {
          if (typeof existing.cleanup === 'function') {
            existing.cleanup();
          }
          existing.deps = deps;
          existing.cleanup = effect();
        });
      }
    },
  };

  function render(): T {
    const previousDispatcher = ReactInternals.H;
    ReactInternals.H = dispatcher;
    cursor = 0;
    let result: T;
    try {
      result = runHook();
    } finally {
      ReactInternals.H = previousDispatcher;
    }
    const effects = pendingEffects;
    pendingEffects = [];
    for (const run of effects) {
      run();
    }
    return result;
  }

  function unmount() {
    for (const cell of cells) {
      if (cell && cell.kind === 'effect' && typeof cell.cleanup === 'function') {
        cell.cleanup();
      }
    }
  }

  return { render, unmount };
}

type HookResult = ReturnType<typeof usePhoneVerificationForm>;

function createVerificationHarness({
  phone = '010-1234-5678',
  requestImpl,
  verifyImpl,
}: {
  phone?: string;
  requestImpl?: (phone: string) => Promise<{ requestId: string; resendAvailableAt?: string }>;
  verifyImpl?: (requestId: string, code: string) => Promise<{ verifiedToken: string }>;
} = {}) {
  const requestCalls: string[] = [];
  const verifyCalls: { requestId: string; code: string }[] = [];

  const requestCode = async (requestedPhone: string) => {
    requestCalls.push(requestedPhone);
    if (requestImpl) {
      return requestImpl(requestedPhone);
    }
    return { requestId: 'req-1' };
  };

  const verifyCode = async (requestId: string, code: string) => {
    verifyCalls.push({ requestId, code });
    if (verifyImpl) {
      return verifyImpl(requestId, code);
    }
    return { verifiedToken: 'token-1' };
  };

  let currentPhone = phone;
  const harness = createHookHarness<HookResult>(() => usePhoneVerificationForm({
    phone: currentPhone,
    requestCode,
    verifyCode,
  }));

  return {
    render: harness.render,
    unmount: harness.unmount,
    setPhone(next: string) {
      currentPhone = next;
    },
    requestCalls,
    verifyCalls,
  };
}

test('request → cooldown → verify → reset transitions', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 0 });
  const harness = createVerificationHarness();

  let state = harness.render();
  assert.equal(state.requestId, '');
  assert.equal(state.code, '');
  assert.equal(state.verifiedToken, '');
  assert.equal(state.isVerified, false);
  assert.equal(state.isRequestingCode, false);
  assert.equal(state.isVerifyingCode, false);
  assert.equal(state.error, null);
  assert.equal(state.resendCooldown, 0);
  assert.equal(state.phoneValid, true);

  // Request a code: the service receives the formatted phone, prior code/token/verified
  // state is dropped, and the default (no resendAvailableAt) cooldown is 60s.
  await state.handleRequestCode();
  state = harness.render();
  assert.deepEqual(harness.requestCalls, ['010-1234-5678']);
  assert.equal(state.requestId, 'req-1');
  assert.equal(state.isRequestingCode, false);
  assert.equal(state.resendCooldown, 60);

  // The cooldown ticks down once per second.
  t.mock.timers.tick(1000);
  state = harness.render();
  assert.equal(state.resendCooldown, 59);

  // While the cooldown is running, another request is a no-op.
  await state.handleRequestCode();
  state = harness.render();
  assert.equal(harness.requestCalls.length, 1);

  // Code input keeps digits only, capped at 6.
  state.handleCodeChange('12a3b4c5d6e78');
  state = harness.render();
  assert.equal(state.code, '123456');
  assert.equal(state.error, null);

  // Verify: token stored, verified flag set, cooldown cleared and stays cleared.
  await state.handleVerifyCode();
  state = harness.render();
  assert.deepEqual(harness.verifyCalls, [{ requestId: 'req-1', code: '123456' }]);
  assert.equal(state.verifiedToken, 'token-1');
  assert.equal(state.isVerified, true);
  assert.equal(state.isVerifyingCode, false);
  assert.equal(state.resendCooldown, 0);

  t.mock.timers.tick(5000);
  state = harness.render();
  assert.equal(state.resendCooldown, 0);

  // Reset (phone changed / find-username prefill): everything is dropped so a stale
  // token can never be submitted for a different number.
  state.resetVerification();
  state = harness.render();
  assert.equal(state.requestId, '');
  assert.equal(state.code, '');
  assert.equal(state.verifiedToken, '');
  assert.equal(state.isVerified, false);
  assert.equal(state.error, null);
  assert.equal(state.resendCooldown, 0);

  harness.unmount();
});

test('cooldown honors the service resendAvailableAt instant and re-enables requests at 0', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 0 });
  const harness = createVerificationHarness({
    requestImpl: async () => ({
      requestId: 'req-cooldown',
      resendAvailableAt: new Date(5000).toISOString(),
    }),
  });

  let state = harness.render();
  await state.handleRequestCode();
  state = harness.render();
  assert.equal(state.resendCooldown, 5);

  for (let second = 4; second >= 0; second -= 1) {
    t.mock.timers.tick(1000);
    state = harness.render();
    assert.equal(state.resendCooldown, second);
  }

  // Once the cooldown reaches 0, a resend goes through again.
  await state.handleRequestCode();
  state = harness.render();
  assert.equal(harness.requestCalls.length, 2);

  harness.unmount();
});

test('request failure surfaces the fallback copy without touching prior state', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 0 });
  const harness = createVerificationHarness({
    requestImpl: async () => {
      throw { message: 'not-an-error-instance' };
    },
  });

  let state = harness.render();
  await state.handleRequestCode();
  state = harness.render();
  assert.equal(state.error, '인증번호 발송에 실패했어요.');
  assert.equal(state.requestId, '');
  assert.equal(state.isRequestingCode, false);
  assert.equal(state.resendCooldown, 0);

  harness.unmount();
});

test('verify failure keeps the form unverified and reports the service message', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 0 });
  const harness = createVerificationHarness({
    verifyImpl: async () => {
      throw new Error('인증번호가 올바르지 않아요.');
    },
  });

  let state = harness.render();
  await state.handleRequestCode();
  state = harness.render();
  state.handleCodeChange('654321');
  state = harness.render();

  await state.handleVerifyCode();
  state = harness.render();
  assert.equal(state.error, '인증번호가 올바르지 않아요.');
  assert.equal(state.isVerified, false);
  assert.equal(state.verifiedToken, '');
  assert.equal(state.isVerifyingCode, false);
  // The failed verify leaves the resend cooldown running (only success clears it).
  assert.equal(state.resendCooldown, 60);

  harness.unmount();
});

test('guards: invalid phone blocks requests, missing request/short code block verify', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 0 });
  const harness = createVerificationHarness({ phone: '010-123' });

  let state = harness.render();
  assert.equal(state.phoneValid, false);
  await state.handleRequestCode();
  assert.equal(harness.requestCalls.length, 0);

  // No requestId yet → verify is a no-op even with a 6-digit code.
  state.handleCodeChange('123456');
  state = harness.render();
  await state.handleVerifyCode();
  assert.equal(harness.verifyCalls.length, 0);

  // Valid phone now, request succeeds, but a short code still blocks verify.
  harness.setPhone('010-1234-5678');
  state = harness.render();
  await state.handleRequestCode();
  state = harness.render();
  assert.equal(harness.requestCalls.length, 1);
  state.handleCodeChange('123');
  state = harness.render();
  await state.handleVerifyCode();
  assert.equal(harness.verifyCalls.length, 0);

  harness.unmount();
});

test('unmount clears a running cooldown interval', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 0 });
  const clearIntervalMock = t.mock.method(globalThis, 'clearInterval');
  const harness = createVerificationHarness();

  let state = harness.render();
  await state.handleRequestCode();
  state = harness.render();
  assert.equal(state.resendCooldown, 60);

  const callsBeforeUnmount = clearIntervalMock.mock.callCount();
  harness.unmount();
  assert.equal(clearIntervalMock.mock.callCount(), callsBeforeUnmount + 1);
});
