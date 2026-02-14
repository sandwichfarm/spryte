// High-level client
export { Spryte, type SpryteOptions } from "./spryte.js";

// ctxcn-generated CVM client (low-level)
export {
  SpryteCvmClient,
  type GenerateSpryteInput,
  type GenerateSpryteOutput,
  type SpryteCvm,
} from "./ctxcn/SpryteCvmClient.js";

// Sprite consumption utilities
export {
  fetchMapping,
  probeImageSize,
  loadSpriteSheet,
  getAvatarStyle,
  avatarStyleToString,
  getPubkeys,
  hasPubkey,
} from "./sprites.js";

// Types
export type {
  SpriteMapping,
  SpriteSheet,
  SpriteAvatarStyle,
} from "./types.js";
