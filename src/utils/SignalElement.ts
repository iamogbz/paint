import { LitElement } from 'lit';
import { SignalWatcher } from "@lit-labs/signals";

export class SignalElement extends SignalWatcher(LitElement) {
  protected createRenderRoot() {
    return this;
  }
}

