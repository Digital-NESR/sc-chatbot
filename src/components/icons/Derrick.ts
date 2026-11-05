import { createLucideIcon } from 'lucide-react';

/**
 * A drilling derrick, for AssetLens AI.
 *
 * Lucide has no oil rig: `Drill` is a handheld power drill and `TowerControl`
 * is an air traffic tower, and neither reads as oilfield equipment next to the
 * other agent icons. This is drawn to lucide's own grid - 24x24, stroke 2,
 * round caps - so it sits in the row without looking like a different set.
 *
 * Kept to six strokes on purpose. The sidebar renders it at 20px, and a
 * fuller lattice turns to mush at that size.
 */
const Derrick = createLucideIcon('Derrick', [
    // Ground line.
    ['path', { d: 'M3 21h18', key: 'ground' }],
    // The two legs of the mast, tapering to the crown. The wide stance matters:
    // a narrower one with a single brace draws a capital A, not a derrick.
    ['path', { d: 'M5 21 10 4', key: 'leg-left' }],
    ['path', { d: 'M19 21 14 4', key: 'leg-right' }],
    // Crown block across the top.
    ['path', { d: 'M10 4h4', key: 'crown' }],
    // Two cross members, each ending exactly on the legs at its own height -
    // 8.7/15.3 at y=8.5 and 6.4/17.6 at y=16.5. A brace that overhangs the
    // legs is what makes the shape read as a letter.
    ['path', { d: 'M8.7 8.5h6.6', key: 'brace-upper' }],
    ['path', { d: 'M6.4 16.5h11.2', key: 'brace-lower' }],
    // The string running down the centre to the well.
    ['path', { d: 'M12 8.5v12.5', key: 'string' }],
]);

export default Derrick;
