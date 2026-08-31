import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { FONT_MONO, FONT_SANS, theme } from "../theme";

export const TitleCard: React.FC<{
  heading: string;
  sub?: string;
  detail?: string;
}> = ({ heading, sub, detail }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        justifyContent: "center",
        alignItems: "center",
        fontFamily: FONT_SANS,
        opacity,
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 1400 }}>
        <div style={{ color: theme.fg, fontSize: 72, fontWeight: 650 }}>
          {heading}
        </div>
        {sub ? (
          <div style={{ color: theme.muted, fontSize: 36, marginTop: 28 }}>
            {sub}
          </div>
        ) : null}
        {detail ? (
          <div
            style={{
              color: theme.muted,
              fontSize: 26,
              marginTop: 40,
              fontFamily: FONT_MONO,
            }}
          >
            {detail}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
