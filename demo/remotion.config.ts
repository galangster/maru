import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// Reviewer-facing video: favor quality over render speed.
Config.setCrf(16);
