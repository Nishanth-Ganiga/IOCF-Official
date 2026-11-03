/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** "off" builds the site without the Command Center (see src/data/features.ts). */
  readonly VITE_COMMAND_CENTER?: string;
}
