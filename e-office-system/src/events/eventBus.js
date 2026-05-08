import { EventEmitter } from "node:events";

export const EVENTS = {
  FILE_MOVED: "FILE_MOVED",
};

const eventBus = new EventEmitter();

// Helps avoid warnings if multiple modules add listeners over time.
eventBus.setMaxListeners(50);

export default eventBus;
