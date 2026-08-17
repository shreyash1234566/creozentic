import { Rect, Txt, makeScene2D } from "@motion-canvas/2d";
import { all, createRef, createSignal, waitFor } from "@motion-canvas/core";

export type KineticCaptionProps = {
  text: string;
  x: number;
  y: number;
  durationSec: number;
  fontSize: number;
  color: string;
};

export default makeScene2D(function* (view) {
  const background = createRef<Rect>();
  const caption = createRef<Txt>();
  const opacity = createSignal(0);
  view.add(<Rect ref={background} width={1080} height={1920} fill="#00000000" />);
  view.add(
    <Txt ref={caption} text="" fontFamily="Inter" fontSize={64} fill="#ffffff" opacity={opacity} />,
  );
  yield* all(opacity(1, 0.2), waitFor(0.2));
});
