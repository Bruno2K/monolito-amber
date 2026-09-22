import { NamingValidationError } from "./errors.js";

/**
 * Extensible naming-validation boundary (0.3 §11).
 * Default rules are structural only — no invented client BIM / ISO 19650 schemes.
 * Organizations may later plug a policy; drafts may be invalid, publish is blocked.
 */
export interface NamingValidationInput {
  documentCode: string;
  revisionCode: string;
  title: string;
  disciplineId?: string | null;
  documentType?: string | null;
  fileName?: string | null;
}

export interface NamingValidationResult {
  ok: boolean;
  errors: string[];
}

export interface NamingValidator {
  validate(input: NamingValidationInput): NamingValidationResult;
}

const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function requireToken(value: string | null | undefined, field: string, errors: string[]): void {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    errors.push(`${field} is required to publish`);
    return;
  }
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) {
    errors.push(`${field} must not contain path separators`);
  }
}

export function validateDefaultNaming(input: NamingValidationInput): NamingValidationResult {
  const errors: string[] = [];
  requireToken(input.documentCode, "documentCode", errors);
  requireToken(input.revisionCode, "revisionCode", errors);
  requireToken(input.title, "title", errors);
  if (input.documentCode?.trim() && !CODE_RE.test(input.documentCode.trim())) {
    errors.push("documentCode must be an identifier (letters, digits, . _ -)");
  }
  if (input.revisionCode?.trim() && !CODE_RE.test(input.revisionCode.trim())) {
    errors.push("revisionCode must be an identifier (letters, digits, . _ -)");
  }
  if (input.fileName?.includes("..") || input.fileName?.includes("/") || input.fileName?.includes("\\")) {
    errors.push("fileName must be a basename without path separators");
  }
  return { ok: errors.length === 0, errors };
}

export const defaultNamingValidator: NamingValidator = {
  validate: validateDefaultNaming,
};

export function assertNamingValid(input: NamingValidationInput, validator: NamingValidator = defaultNamingValidator): void {
  const result = validator.validate(input);
  if (!result.ok) {
    throw new NamingValidationError(result.errors.join("; "));
  }
}
