import { EventEmitter } from "node:events";
import type { ChangeEvent } from "@edv4h/poke-mate-shared-types";

export type ChangeEventPayload = ChangeEvent;

export class ChangeBus extends EventEmitter {
  emitChange(event: ChangeEventPayload): void {
    this.emit("change", event);
  }
  onChange(listener: (event: ChangeEventPayload) => void): () => void {
    this.on("change", listener);
    return () => this.off("change", listener);
  }
}
