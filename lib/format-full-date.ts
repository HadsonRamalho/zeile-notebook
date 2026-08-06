export function formatFullDate(dateParam: Date | string) {
  return new Date(dateParam).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Etc/GMT+3",
  });
}
