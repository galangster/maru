import { AbsoluteFill, OffthreadVideo, staticFile } from "remotion";
import { captureFile, type Shot } from "../shots";
import { FONT_MONO, FONT_SANS, theme } from "../theme";

/**
 * Renders one shot: the real screen capture when it exists, otherwise a
 * placeholder slot, with the shot's caption as a lower-third overlay.
 *
 * The caption band sits outside the 16:9 capture area (the capture is
 * letterboxed above it), so captions never cover identity evidence such
 * as the browser address bar.
 */
export const CaptionedClip: React.FC<{ shot: Shot }> = ({ shot }) => {
  const captionBand = 160;

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: captionBand,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {shot.hasCapture ? (
          <OffthreadVideo
            src={staticFile(captureFile(shot))}
            style={{ maxWidth: "100%", maxHeight: "100%" }}
          />
        ) : (
          <PlaceholderSlot shot={shot} />
        )}
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: captionBand,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "0 160px",
        }}
      >
        <div
          style={{
            color: theme.caption,
            fontSize: 32,
            lineHeight: 1.35,
            textAlign: "center",
            fontFamily: FONT_SANS,
          }}
        >
          {shot.caption}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const PlaceholderSlot: React.FC<{ shot: Shot }> = ({ shot }) => (
  <div
    style={{
      width: "82%",
      aspectRatio: "16 / 9",
      border: `3px dashed ${theme.border}`,
      borderRadius: 16,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      gap: 20,
      color: theme.faint,
      fontFamily: FONT_MONO,
    }}
  >
    <div style={{ fontSize: 40 }}>capture pending</div>
    <div style={{ fontSize: 28 }}>{captureFile(shot)}</div>
    {shot.consentFlow ? (
      <div style={{ fontSize: 24, color: theme.warn }}>
        consent flow — one continuous, unedited capture
      </div>
    ) : null}
  </div>
);
