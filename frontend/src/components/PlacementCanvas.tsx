import { useEffect, useRef, useState } from 'react';
import { API_URL } from '../lib/api';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  photo: File;
  initialPlacement: Box;
  productImageUrl: string;
  productAspectRatio: number;
}

const MIN_WIDTH = 0.1;
const MAX_WIDTH = 0.7;

/** Clamps a box to a sane on-screen size (width in [MIN_WIDTH, MAX_WIDTH], height
 * derived from `aspectRatio` so it never distorts) and keeps it inside the photo.
 * A plain function, not a component method, so the very first box render - before
 * any state exists - already respects these bounds instead of flashing an
 * unclamped one for a frame. */
function clampBoxTo(b: Box, aspectRatio: number): Box {
  const width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, b.width));
  const height = width / aspectRatio;
  const x = Math.max(0, Math.min(1 - width, b.x));
  const y = Math.max(0, Math.min(1 - height, b.y));
  return { x, y, width, height };
}

/**
 * Renders the customer's photo and the battery product image as two separate
 * layers - not a server-flattened composite - so the vision model's placement
 * is a starting point the customer can drag and resize themselves. The model
 * gets the rough spot right; only the customer actually knows their room.
 */
export function PlacementCanvas({ photo, initialPlacement, productImageUrl, productAspectRatio }: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoAspect, setPhotoAspect] = useState<number | null>(null);
  // Starts as the backend's theoretical footprint ratio (30.68"/35.9"), then corrects to
  // the product photo's own real pixel ratio once it loads. The two can differ a lot for
  // a 3/4-angle product shot (vs. a straight-on silhouette) - if the drag box kept the
  // footprint ratio while the image inside it used object-fit: contain, the image would
  // letterbox inside a much taller/wider box than its own visible pixels, so you'd be
  // dragging a big invisible box that doesn't match what you actually see and grab.
  // Matching the box to the image's own ratio keeps the two the same thing.
  const [productAspect, setProductAspect] = useState(productAspectRatio);
  const [box, setBox] = useState<Box>(() => clampBoxTo(initialPlacement, productAspectRatio));
  const containerRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<
    | { type: 'move'; startX: number; startY: number; boxStart: Box }
    | { type: 'resize'; startX: number; boxStart: Box; floorY: number }
    | null
  >(null);

  useEffect(() => {
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const clampBox = (b: Box): Box => clampBoxTo(b, productAspect);

  const onPointerDownMove = (e: React.PointerEvent) => {
    e.preventDefault();
    // Capture on the CONTAINER, not the element under the pointer: onPointerMove/Up
    // are wired to the container, and pointer capture redirects all further events
    // for this pointerId to whatever element captured it - capturing on the child
    // being dragged would silently starve the container's own move/up handlers.
    containerRef.current?.setPointerCapture(e.pointerId);
    gesture.current = { type: 'move', startX: e.clientX, startY: e.clientY, boxStart: box };
  };

  const onPointerDownResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    containerRef.current?.setPointerCapture(e.pointerId);
    gesture.current = { type: 'resize', startX: e.clientX, boxStart: box, floorY: box.y + box.height };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    const container = containerRef.current;
    if (!g || !container) return;
    const rect = container.getBoundingClientRect();

    if (g.type === 'move') {
      const dx = (e.clientX - g.startX) / rect.width;
      const dy = (e.clientY - g.startY) / rect.height;
      setBox(clampBox({ ...g.boxStart, x: g.boxStart.x + dx, y: g.boxStart.y + dy }));
    } else {
      const dx = (e.clientX - g.startX) / rect.width;
      const newWidth = g.boxStart.width + dx;
      const newHeight = newWidth / productAspect;
      // Anchor the floor line (where the unit sits) and its left edge - resizing
      // shouldn't lift a floor-standing box off the ground or slide it sideways.
      setBox(clampBox({ x: g.boxStart.x, y: g.floorY - newHeight, width: newWidth, height: newHeight }));
    }
  };

  const endGesture = () => {
    gesture.current = null;
  };

  return (
    <div>
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: photoAspect ?? undefined,
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid var(--grey-20)',
          touchAction: 'none',
          background: 'var(--grey-5)',
        }}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
      >
        {photoUrl && (
          <img
            src={photoUrl}
            alt="Your install area"
            onLoad={e => setPhotoAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            draggable={false}
          />
        )}
        <div
          onPointerDown={onPointerDownMove}
          style={{
            position: 'absolute',
            left: `${box.x * 100}%`,
            top: `${box.y * 100}%`,
            width: `${box.width * 100}%`,
            height: `${box.height * 100}%`,
            cursor: 'grab',
          }}
        >
          <img
            src={`${API_URL}${productImageUrl}`}
            alt="Battery (drag to reposition)"
            onLoad={e => {
              const real = e.currentTarget.naturalWidth / e.currentTarget.naturalHeight;
              setProductAspect(real);
              // Re-clamp to the real ratio now that it's known, keeping the box's width
              // and floor line (where the unit sits) fixed - only its height changes to
              // match the photo, so the box doesn't jump position, just resizes in place.
              setBox(b => {
                const height = b.width / real;
                return clampBoxTo({ x: b.x, y: b.y + b.height - height, width: b.width, height }, real);
              });
            }}
            // contain as a defensive default for the one frame before onLoad fires and
            // the box is still using the initial guessed ratio - once corrected above,
            // the box always matches the image's own ratio exactly, so fill vs. contain
            // makes no visible difference, but contain never risks a stretch in between.
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', pointerEvents: 'none' }}
            draggable={false}
          />
          <div
            onPointerDown={onPointerDownResize}
            title="Drag to resize"
            style={{
              position: 'absolute',
              right: -8,
              bottom: -8,
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: 'var(--green-90, #2d5a3d)',
              border: '2px solid white',
              cursor: 'nwse-resize',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }}
          />
        </div>
      </div>
      <p className="small" style={{ marginTop: 6, color: 'var(--grey-60)' }}>
        Drag the battery to reposition it, or drag the corner handle to resize - actual size and fit confirmed at
        your site visit.
      </p>
    </div>
  );
}
