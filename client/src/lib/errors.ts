function formatZodIssues(issues: any): string | null {
  if (!Array.isArray(issues)) return null;
  const msgs = issues
    .map((issue) => {
      const message = typeof issue?.message === "string" ? issue.message : "";
      const path =
        Array.isArray(issue?.path) && issue.path.length
          ? issue.path.map(String).join(".")
          : "";
      if (!message) return "";
      return path ? `${path}: ${message}` : message;
    })
    .filter(Boolean);
  return msgs.length ? msgs.join("\n") : null;
}

function safeToString(value: any): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  if (Array.isArray(value)) {
    const formatted = formatZodIssues(value);
    if (formatted) return formatted;
    return value.map(safeToString).filter(Boolean).join("\n");
  }
  if (typeof value === "object") {
    // Common API shape: { message, error, details }.
    const details = formatZodIssues((value as any).details);
    if (details) return details;
    const nested =
      safeToString((value as any).message) || safeToString((value as any).error);
    if (nested) return nested;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export const getErrorMessage = (err: any, fallback: string = "Error inesperado"): string => {
  const data = err?.response?.data;

  const formattedDetails = formatZodIssues(data?.details) || formatZodIssues(data?.error);
  if (formattedDetails) return formattedDetails;

  const message = data?.message || data?.error || err?.message || (typeof err === "string" ? err : "");
  const asText = safeToString(message).trim();
  return asText ? asText : fallback;
};
