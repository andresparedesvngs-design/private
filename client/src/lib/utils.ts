import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Valida si un string es un ObjectId de MongoDB válido
 * ObjectId: 24 caracteres hexadecimales
 */
export function isValidObjectId(id: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

/**
 * Formatea un ObjectId para mostrarlo de manera abreviada
 * Útil para mostrar IDs en la UI
 */
export function formatObjectId(id: string, length: number = 8): string {
  if (!isValidObjectId(id)) {
    return id.slice(0, length);
  }
  return id.slice(0, length);
}