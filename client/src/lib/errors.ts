export const getErrorMessage = (
  err: any,
  fallback: string = "Error inesperado"
): string => {
  const message =
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    err?.message ||
    (typeof err === "string" ? err : "");

  return message && String(message).trim() ? String(message) : fallback;
};
