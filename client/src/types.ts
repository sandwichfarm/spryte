/** Sprite mapping JSON structure as output by the processor */
export interface SpriteMapping {
  cellDimensions: {
    width: number;
    height: number;
  };
  mapping: Record<
    string,
    {
      x: number;
      y: number;
      source: string;
    }
  >;
}

/** Resolved sprite data ready for rendering */
export interface SpriteSheet {
  /** URL of the sprite PNG */
  spriteUrl: string;
  /** Parsed mapping data */
  mapping: SpriteMapping;
  /** Natural pixel dimensions of the sprite image */
  imageWidth: number;
  imageHeight: number;
}

/** CSS properties for rendering a single avatar from the sprite */
export interface SpriteAvatarStyle {
  backgroundImage: string;
  backgroundPosition: string;
  backgroundSize: string;
  backgroundRepeat: string;
  width: string;
  height: string;
}
