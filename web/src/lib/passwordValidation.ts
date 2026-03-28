import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 12;

export const passwordRequirements = [
  { label: 'Mínimo 12 caracteres', test: (p: string) => p.length >= 12 },
  { label: 'Letra maiúscula', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Letra minúscula', test: (p: string) => /[a-z]/.test(p) },
  { label: 'Número', test: (p: string) => /[0-9]/.test(p) },
  { label: 'Caractere especial (!@#$%...)', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export const strongPasswordSchema = z
  .string()
  .min(12, 'Senha deve ter no mínimo 12 caracteres')
  .regex(/[A-Z]/, 'Senha deve conter pelo menos uma letra maiúscula')
  .regex(/[a-z]/, 'Senha deve conter pelo menos uma letra minúscula')
  .regex(/[0-9]/, 'Senha deve conter pelo menos um número')
  .regex(/[^A-Za-z0-9]/, 'Senha deve conter pelo menos um caractere especial');

export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const result = strongPasswordSchema.safeParse(password);
  if (result.success) return { valid: true, errors: [] };
  return { valid: false, errors: result.error.errors.map(e => e.message) };
}
