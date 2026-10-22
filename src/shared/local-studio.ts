/**
 * The local Unsloth Studio backend that serves OpenAI-compatible models on
 * 127.0.0.1. Koda can start and own it, so the app works without the
 * standalone Studio desktop running.
 */
export interface LocalStudioBackendStatus {
  /** A managed Studio install was found on this machine. */
  installed: boolean;
  /** The health endpoint answered on the target port. */
  running: boolean;
  /** Koda started this backend and is therefore allowed to stop it. */
  owned: boolean;
  /** The OpenAI-compatible base URL the backend serves. */
  baseUrl: string;
  /** The loopback port the backend listens on. */
  port: number;
  /** The process id of the backend Koda started, when it owns one. */
  pid?: number;
  /** Why the backend is not running, when it is not. */
  error?: string;
}
