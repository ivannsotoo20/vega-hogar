'use client';

import { type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { usePathname } from 'next/navigation';

interface Props {
  children: ReactNode;
}

/**
 * Envoltorio para `{children}` en `(app)/layout.tsx`. Anima la entrada/salida
 * de cada ruta con `AnimatePresence + key=pathname` (fade + slide sutil, 180ms).
 * `initial={false}` desactiva la animación en el primer mount (hard reload).
 */
export function AnimatedPageShell({ children }: Props) {
  const pathname = usePathname();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
        className="flex-1 min-h-0 min-w-0 flex flex-col"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
