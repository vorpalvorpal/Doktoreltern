/** `dl agenda` (package B). */
import { buildAgenda } from './agenda';

export async function cmdAgenda(ws: string): Promise<string> {
  return buildAgenda(ws);
}
