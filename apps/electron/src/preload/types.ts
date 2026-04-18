import type { PokeMateApi } from "./index.js";

declare global {
  interface Window {
    pokeMate: PokeMateApi;
  }
}
export {};
