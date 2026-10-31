// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useEffect, useRef, type ReactNode } from 'react';
import { settings } from '../terminal/settings';

/** Briefly highlights its content green/red when `value` moves. */
export function Flash({ value, children, className, as = 'span' }: { value: number; children: ReactNode; className?: string; as?: 'span' | 'td' | 'div' }) {
  const ref = useRef<HTMLElement>(null);
  const prev = useRef(value);
  useEffect(() => {
    const el = ref.current;
    const before = prev.current;
    prev.current = value;
    if (!el || !settings.get().flash || !Number.isFinite(before) || value === before) return;
    el.classList.remove('flash-up', 'flash-dn');
    void el.offsetWidth;
    el.classList.add(value > before ? 'flash-up' : 'flash-dn');
  }, [value]);
  const Tag = as as 'span';
  return (
    <Tag ref={ref as React.Ref<HTMLSpanElement>} className={className}>
      {children}
    </Tag>
  );
}
