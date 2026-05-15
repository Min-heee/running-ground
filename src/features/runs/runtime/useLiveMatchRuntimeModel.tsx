import { useLiveMatchRuntime } from '@/features/runs/runtime/useLiveMatchRuntime';

type UseLiveMatchRuntimeModelInput = Parameters<typeof useLiveMatchRuntime>[0];

export function useLiveMatchRuntimeModel(input: UseLiveMatchRuntimeModelInput) {
  return useLiveMatchRuntime(input);
}
