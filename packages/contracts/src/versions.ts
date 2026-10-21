/** Contract and component version identifiers persisted with decisions. */
export const SCHEMA_VERSION = "1.0.0" as const;
export const PARSER_VERSION = "0.1.0" as const;
export const POLICY_VERSION = "0.1.0" as const;
export const PROMPT_VERSION = "0.1.0" as const;
export const ADAPTER_VERSION = "0.1.0" as const;
export const CALIBRATION_VERSION = "none" as const;

export type SchemaVersion = typeof SCHEMA_VERSION;
