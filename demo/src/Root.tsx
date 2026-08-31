import { Composition } from "remotion";
import { DemoVideo, totalDurationInFrames } from "./DemoVideo";
import { FPS, HEIGHT, WIDTH } from "./shots";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="MaruDemo"
    component={DemoVideo}
    durationInFrames={totalDurationInFrames}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
  />
);
