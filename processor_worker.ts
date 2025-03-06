import { processor } from "./processor/core.ts";

self.onmessage = async (e: MessageEvent) => {
  const { photoMapping, cellSize, sprite, json } = e.data;
  try {
    await processor(photoMapping, cellSize, sprite, json);
    self.postMessage({ status: "done" });
  } catch (err) {
    self.postMessage({ status: "error", error: err.toString() });
  }
};