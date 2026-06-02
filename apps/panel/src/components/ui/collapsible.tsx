'use client';

import { Collapsible as CollapsiblePrimitive } from 'radix-ui';

/**
 * shadcn-style wrapper around Radix Collapsible (meta package `radix-ui`).
 * Used for collapsable sidebar groups + accordion-like UI.
 */
const Collapsible = CollapsiblePrimitive.Root;
const CollapsibleTrigger = CollapsiblePrimitive.Trigger;
const CollapsibleContent = CollapsiblePrimitive.Content;

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
