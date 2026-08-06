"use client";
/**
 * Lazy framer-motion wrapper — reduces initial JS from ~150 kB to ~5 kB.
 * Components use `m` (lightweight) instead of `motion` (full bundle).
 * Wrap your tree in <LazyMotion features={domAnimation}> to enable animations.
 */
export {
  LazyMotion,
  domAnimation,
  domMax,
  m,
  AnimatePresence,
  useAnimation,
  useMotionValue,
  useTransform,
  useInView,
  useScroll,
  useSpring,
} from "framer-motion";
