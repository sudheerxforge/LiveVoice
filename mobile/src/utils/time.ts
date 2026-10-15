const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "3:05 PM" */
export function formatTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "Today 3:05 PM", "Yesterday", "Sep 18" or "Sep 18, 2025". */
export function formatChatDate(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ms >= startOfToday) {
    return `Today ${formatTime(ms)}`;
  }
  if (ms >= startOfToday - 24 * 60 * 60 * 1000) {
    return 'Yesterday';
  }
  const date = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === now.getFullYear() ? date : `${date}, ${d.getFullYear()}`;
}
