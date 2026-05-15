import type { ReactNode } from 'react';

export type LiveMatchPageRenderer = () => ReactNode;

export type PagerTab = {
  index: number;
  label: string;
};
