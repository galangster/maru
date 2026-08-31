import { Series } from "remotion";
import { CaptionedClip } from "./components/CaptionedClip";
import { TitleCard } from "./components/TitleCard";
import { APP_NAME, APP_VERSION, CLIENT_ID, SHOTS, sec } from "./shots";

const INTRO_FRAMES = sec(6);
const SHOT_TITLE_FRAMES = sec(2);
const OUTRO_FRAMES = sec(5);

export const totalDurationInFrames =
  INTRO_FRAMES +
  SHOTS.reduce((sum, s) => sum + SHOT_TITLE_FRAMES + s.durationInFrames, 0) +
  OUTRO_FRAMES;

export const DemoVideo: React.FC = () => (
  <Series>
    <Series.Sequence durationInFrames={INTRO_FRAMES}>
      <TitleCard
        heading={APP_NAME}
        sub={`Google OAuth verification demo — version ${APP_VERSION}`}
        detail={CLIENT_ID}
      />
    </Series.Sequence>
    {SHOTS.flatMap((shot, i) => [
      <Series.Sequence
        key={`${shot.id}-title`}
        durationInFrames={SHOT_TITLE_FRAMES}
      >
        <TitleCard heading={`${i + 1}. ${shot.title}`} />
      </Series.Sequence>,
      <Series.Sequence key={shot.id} durationInFrames={shot.durationInFrames}>
        <CaptionedClip shot={shot} />
      </Series.Sequence>,
    ])}
    <Series.Sequence durationInFrames={OUTRO_FRAMES}>
      <TitleCard
        heading={APP_NAME}
        sub="All Gmail data stays on this device. The only requested scope is gmail.modify."
        detail="https://getmaru.app"
      />
    </Series.Sequence>
  </Series>
);
