export function getSpritePosition(pubkey: string): string {
    let hash = 0;
    for (let i = 0; i < pubkey.length; i++) {
      hash += pubkey.charCodeAt(i);
    }
    const offsetX = (hash % 10) * -AVATAR_SIZE;
    return `${offsetX}px 0px`;
  }