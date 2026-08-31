// Shot list for the Google OAuth verification demo.
// Source: docs/research/shared-client-implementation-plan.md, Part 1 §8
// ("Demo-video rejection reasons") and Part 2 §8 ("Record one final demo").
//
// Capture rules (see demo/README.md):
// - Every clip is a real screen capture of the final signed build.
// - A shot marked `consentFlow: true` must be one continuous, unedited
//   capture. No cuts, no speed changes, no cropping inside that clip.
// - Never crop away identity evidence: browser address bar, client id,
//   app version.

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export const APP_NAME = "Maru Mail";
export const APP_VERSION = "«FROZEN RELEASE VERSION»"; // fill when the release is cut
export const CLIENT_ID =
  "537601059334-su62jrimhnfg3lg5ql21uet30135mdll.apps.googleusercontent.com";

export type Shot = {
  id: string;
  /** Title-card heading shown before the clip. */
  title: string;
  /** On-screen caption (text narration) shown over the clip. */
  caption: string;
  /**
   * True once the real capture exists at public/captures/<id>.mp4.
   * False renders a labeled placeholder slot instead.
   */
  hasCapture: boolean;
  /** Clip length in frames. Placeholder length until the capture lands. */
  durationInFrames: number;
  /** True: the clip must be a single continuous, unedited capture. */
  consentFlow: boolean;
};

export const sec = (s: number) => Math.round(s * FPS);

export const captureFile = (shot: Shot) => `captures/${shot.id}.mp4`;

export const SHOTS: Shot[] = [
  {
    id: "01-build-and-version",
    title: "Final signed build",
    caption: `${APP_NAME} — the final signed build. The About screen shows the app version submitted for review.`,
    hasCapture: false,
    durationInFrames: sec(8),
    consentFlow: false,
  },
  {
    id: "02-account-addition",
    title: "Account addition",
    caption:
      "Adding a Google account opens the system browser. The address bar stays visible, and the request carries the submitted client id.",
    hasCapture: false,
    durationInFrames: sec(12),
    consentFlow: true,
  },
  {
    id: "03-consent-screen",
    title: "Google consent screen",
    caption:
      "The complete English consent screen. The only requested scope is gmail.modify — read, modify, and send access, with nothing broader.",
    hasCapture: false,
    durationInFrames: sec(15),
    consentFlow: true,
  },
  {
    id: "04-read-mail",
    title: "Reading mail",
    caption:
      "Thread listing, message body reading, and attachment access — the read half of gmail.modify.",
    hasCapture: false,
    durationInFrames: sec(15),
    consentFlow: false,
  },
  {
    id: "05-modify-mail",
    title: "Modifying mail",
    caption:
      "Archive, label change, Trash, and untrash — the modify half of gmail.modify.",
    hasCapture: false,
    durationInFrames: sec(15),
    consentFlow: false,
  },
  {
    id: "06-human-send",
    title: "Composing and sending",
    caption: "A human composes and sends a message.",
    hasCapture: false,
    durationInFrames: sec(10),
    consentFlow: false,
  },
  {
    id: "07-agent-session-consent",
    title: "Agent creation and consent",
    caption:
      "Creating an agent shows the privacy notice, then asks the account owner for explicit agent-session consent.",
    hasCapture: false,
    durationInFrames: sec(15),
    consentFlow: true,
  },
  {
    id: "08-agent-read",
    title: "Agent read via MCP",
    caption:
      "An agent reads mail through the MCP client, inside the session the owner just approved.",
    hasCapture: false,
    durationInFrames: sec(12),
    consentFlow: false,
  },
  {
    id: "09-agent-send-approval",
    title: "Agent send needs a human",
    caption:
      "An agent requests a send. Nothing leaves the account until the human approves it.",
    hasCapture: false,
    durationInFrames: sec(12),
    consentFlow: false,
  },
  {
    id: "10-account-removal",
    title: "Account removal",
    caption:
      "Removing the account revokes the token and deletes all local data — the complete lifecycle, not only sign-in.",
    hasCapture: false,
    durationInFrames: sec(12),
    consentFlow: false,
  },
];
