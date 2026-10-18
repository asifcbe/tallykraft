import { useRef, useEffect } from 'react';

/**
 * Keeps a paginated table showing its FIRST row after a page (or page-size)
 * change, instead of leaving the reader parked on the last row / mid-scroll.
 *
 * Attach the returned ref to whichever element wraps the table rows:
 *   - if that element scrolls internally (has overflow:auto + a max height),
 *     it's scrolled back to the top;
 *   - otherwise (the page itself scrolls) it's scrolled into view at the top.
 *
 * Usage:
 *   const scrollRef = useTableScrollReset(page, rowsPerPage);
 *   <TableContainer ref={scrollRef} ...>
 */
export function useTableScrollReset(...deps) {
  const ref = useRef(null);
  const first = useRef(true);
  useEffect(() => {
    // Don't yank the viewport on first mount.
    if (first.current) { first.current = false; return; }
    const el = ref.current;
    if (!el) return;
    const scrollsInternally = el.scrollHeight > el.clientHeight + 4;
    if (scrollsInternally) {
      el.scrollTo({ top: 0, behavior: 'auto' });
    } else if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}
